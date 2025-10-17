import { Controller, Post, Get, Query, Body, HttpCode, HttpStatus, Logger, BadRequestException, InternalServerErrorException, ServiceUnavailableException, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiQuery } from '@nestjs/swagger';
import { 
  UniversalSwapRequestDto, 
  UniversalSwapResponseDto, 
  SwapType, 
  BlockchainEcosystem 
} from '@swap/dto/universal-swap-request.dto';
import { SwapRoutingService } from '@swap/services/core/swap-routing.service';
import { AggregatorManagerService } from '@swap/services/core/aggregation/aggregator-manager.service';
import { ApprovalService } from '@swap/services/blockchain/approval/approval.service';
import { QuoteService } from '@swap/services/core/execution/quote.service';
import { WalletService } from '@swap/services/blockchain/wallet/wallet.service';
import { ApprovalRequestDto, ApprovalStatusRequestDto } from '@swap/dto/approval-request.dto';
import { AggregatorType } from '@swap/models/swap-request.model';

/**
 * Universal Swap Controller
 * Handles all types of swaps: on-chain, cross-chain, L1-L2, native L1, etc.
 * Intelligently routes requests to appropriate provider categories
 */
@Controller('universal-swap')
@ApiTags('Universal Swap')
export class UniversalSwapController {
  private readonly logger = new Logger(UniversalSwapController.name);

  constructor(
    private readonly swapRoutingService: SwapRoutingService,
    private readonly aggregatorManager: AggregatorManagerService,
    private readonly approvalService: ApprovalService,
    private readonly quoteService: QuoteService,
    private readonly walletService: WalletService,
    // TODO: Inject additional provider managers when implemented
    // private readonly metaAggregatorManager: MetaAggregatorManager,
    // private readonly nativeL1Manager: NativeL1Manager,
    // private readonly solanaManager: SolanaManager,
  ) {}

  /**
   * Universal quote endpoint - handles all swap scenarios
   */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get universal swap quote',
    description: `
    Universal endpoint that can handle all types of cryptocurrency swaps:
    
    • **On-chain swaps**: Same blockchain, same ecosystem (e.g., ETH -> USDT on Ethereum)
    • **Cross-chain swaps**: Different blockchains, different ecosystems (e.g., ETH -> SOL)
    • **L1-L2 swaps**: Layer 1 to Layer 2 and vice versa (e.g., ETH mainnet -> Arbitrum)
    • **Native L1 swaps**: Bitcoin/THORChain/Maya native routing (e.g., BTC -> ETH via THORChain)
    
    The system automatically:
    1. Analyzes the request to determine swap type
    2. Validates chain compatibility
    3. Routes to appropriate provider category
    4. Returns best routes with execution details
    
    **Supported Ecosystems:**
    - EVM: Ethereum, Polygon, BSC, Arbitrum, Optimism, Base, etc.
    - Solana: SPL tokens and native SOL
    - Cosmos: IBC-enabled chains
    - Bitcoin: Native Bitcoin and wrapped variants
    - THORChain/Maya: Native cross-chain swaps
    `
  })
  @ApiBody({ type: UniversalSwapRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Quote retrieved successfully with route options',
    type: UniversalSwapResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request parameters or unsupported swap combination',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Unsupported swap type: EVM chain 999 not supported' },
        error: { type: 'string', example: 'BadRequest' },
        statusCode: { type: 'number', example: 400 },
      },
    },
  })
  async getUniversalQuote(@Body() request: UniversalSwapRequestDto): Promise<UniversalSwapResponseDto> {
    this.logger.log(`Universal quote request: ${request.sellToken.chain.ecosystem}:${request.sellToken.chain.chainId} -> ${request.buyToken.chain.ecosystem}:${request.buyToken.chain.chainId}`);
    
    try {
      // Step 1: Validate chain compatibility
      if (!this.swapRoutingService.validateChainCompatibility(request)) {
        throw new BadRequestException('Unsupported chain combination for swap');
      }

      // Step 2: Determine swap type
      const swapType = this.swapRoutingService.determineSwapType(request);
      this.logger.debug(`Detected swap type: ${swapType}`);

      // Step 3: Determine provider category
      const providerCategory = this.swapRoutingService.determineProviderCategory(swapType, request);
      this.logger.debug(`Routing to provider category: ${providerCategory}`);

      // Step 4: Get complexity estimation
      const complexity = this.swapRoutingService.estimateSwapComplexity(request);
      this.logger.debug(`Swap complexity: ${complexity.complexity}, steps: ${complexity.estimatedSteps}`);

      // Step 5: Get available providers for this category
      const availableProviders = this.swapRoutingService.getProvidersForCategory(providerCategory, request);
      this.logger.debug(`Available providers: ${availableProviders.join(', ')}`);

      // Step 6: Route to appropriate provider manager (TODO: Implement actual routing)
      const routes = await this.routeToProviderManager(providerCategory, request, swapType);

      // Step 7: Return structured response
      return {
        swapType,
        routes,
        recommendedRoute: routes[0], // Best route (highest quality score)
        transactionData: (routes[0] as any)?.transactionData || null,
        warnings: this.generateWarnings(request, swapType, complexity),
      };

    } catch (error) {
      this.logger.error(`Universal quote failed: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException(`Failed to get universal quote: ${error.message}`);
    }
  }

   /**
   * Universal pre-check endpoint - validates parameters, liquidity, approval, wallet balance, provider health
   */
  @Post('pre-check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Universal pre-check for swap',
    description: `Performs pre-checks for a swap request: parameter validation, liquidity, approval, wallet balance, and provider health. Returns status and warnings for each check.`
  })
  @ApiBody({ type: UniversalSwapRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Pre-check results with status and warnings',
    schema: {
      type: 'object',
      properties: {
        parametersValid: { type: 'boolean' },
        liquidityAvailable: { type: 'boolean' },
        approvalRequired: { type: 'boolean' },
        sufficientBalance: { type: 'boolean' },
        providerHealthy: { type: 'boolean' },
        warnings: { type: 'array', items: { type: 'string' } },
        details: { type: 'object' },
      }
    }
  })
  async universalPreCheck(@Body() request: UniversalSwapRequestDto) {
    this.logger.log(`Universal pre-check request: ${request.sellToken.chain.ecosystem}:${request.sellToken.chain.chainId} -> ${request.buyToken.chain.ecosystem}:${request.buyToken.chain.chainId}`);

    const warnings: string[] = [];
    const details: Record<string, any> = {};

    // Parameter validation
    let parametersValid: boolean | null = null;
    try {
      parametersValid = this.swapRoutingService.validateChainCompatibility(request);
      if (!parametersValid) warnings.push('Unsupported chain combination for swap');
    } catch (e) {
      parametersValid = false;
      warnings.push('Parameter validation failed: ' + e.message);
    }
    details.parametersValid = parametersValid;

    // Liquidity check
    let liquidityAvailable: boolean | null = null;
    try {
      const providerCategory = this.swapRoutingService.determineProviderCategory(
        this.swapRoutingService.determineSwapType(request),
        request
      );
      if (providerCategory === 'evm-aggregators') {
        const legacyParams = this.convertToLegacyParams(request);
        const quotes = await this.aggregatorManager.getMultipleQuotes(
          legacyParams.chainId,
          legacyParams.sellToken,
          legacyParams.buyToken,
          legacyParams.sellAmount,
          legacyParams.taker,
          legacyParams.recipient,
          legacyParams.slippagePercentage,
          legacyParams.deadline
        );
        liquidityAvailable = quotes.length > 0 && parseFloat(quotes[0].quote.buyAmount) > 0;
        if (!liquidityAvailable) {
          warnings.push('No liquidity available for requested swap');
        } else {
          // Cache successful quote for future chain/token support checks
          this.swapRoutingService.cacheSupportedQuote(
            legacyParams.chainId,
            legacyParams.buyToken,
            legacyParams.sellToken
          );
        }
      } else {
        // TODO: Implement provider-specific liquidity check for non-EVM
        liquidityAvailable = true;
        warnings.push('Liquidity check stubbed for non-EVM ecosystem');
      }
    } catch (e) {
      liquidityAvailable = false;
      warnings.push('Liquidity check failed: ' + e.message);
    }
    details.liquidityAvailable = liquidityAvailable;

    // Approval check
    let approvalRequired: boolean | null = null;
    try {
      if (request.sellToken.chain.ecosystem === 'evm') {
        // Check for native ETH (or equivalent) - no approval needed
        const isNativeEth = request.sellToken.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
        if (isNativeEth) {
          approvalRequired = false;
          details.approvalNote = 'Native ETH does not require approval';
        } else {
          const spender = await this.swapRoutingService.getSpenderForSwap(request, this.aggregatorManager);
          if (!spender) {
            // If we couldn't get spender, skip approval check (it will be checked during actual execution)
            approvalRequired = null;
            details.approvalNote = 'Could not determine spender address - approval check skipped';
            warnings.push('Approval check skipped: unable to determine spender address');
          } else {
            const approvalStatus = await this.approvalService.getApprovalStatus(
              Number(request.sellToken.chain.chainId),
              request.sellToken.address,
              request.taker,
              spender,
              request.sellAmount
            );
            approvalRequired = approvalStatus.isApprovalNeeded;
            if (approvalRequired) warnings.push('Token approval required for swap');
          }
        }
      } else {
        // TODO: Implement approval check for non-EVM
        approvalRequired = false;
        details.approvalNote = 'Approval check stubbed for non-EVM ecosystem';
      }
    } catch (e) {
      approvalRequired = false;
      warnings.push('Approval check failed: ' + e.message);
    }
    details.approvalRequired = approvalRequired;

    // Wallet balance check
    let sufficientBalance: boolean | null = null;
    try {
      if (request.sellToken.chain.ecosystem === 'evm') {
        const balanceInfo = await this.walletService.getBalance(
          Number(request.sellToken.chain.chainId),
          request.taker,
          request.sellToken.address
        );
        const balanceBigInt = BigInt(balanceInfo.balance);
        const requiredAmount = BigInt(request.sellAmount);
        sufficientBalance = balanceBigInt >= requiredAmount;
        if (!sufficientBalance) {
          warnings.push('Insufficient wallet balance for swap');
          details.balanceDetails = {
            required: request.sellAmount,
            available: balanceInfo.balance,
            token: balanceInfo.symbol
          };
        }
      } else {
        // TODO: Implement wallet balance check for non-EVM
        sufficientBalance = true;
        details.balanceNote = 'Wallet balance check stubbed for non-EVM ecosystem';
      }
    } catch (e) {
      sufficientBalance = false;
      warnings.push('Wallet balance check failed: ' + e.message);
    }
    details.sufficientBalance = sufficientBalance;

    // Provider health check
    let providerHealthy: boolean | null = null;
    try {
      if (request.sellToken.chain.ecosystem === 'evm') {
        const healthResults = await this.aggregatorManager.getProvidersHealth();
        providerHealthy = healthResults.evm.every(h => h.status === 'healthy');
        if (!providerHealthy) warnings.push('Swap provider is currently unhealthy');
      } else {
        // TODO: Implement provider health check for non-EVM
        providerHealthy = true;
        details.healthNote = 'Provider health check stubbed for non-EVM ecosystem';
      }
    } catch (e) {
      providerHealthy = false;
      warnings.push('Provider health check failed: ' + e.message);
    }
    details.providerHealthy = providerHealthy;

    return {
      parametersValid,
      liquidityAvailable,
      approvalRequired,
      sufficientBalance,
      providerHealthy,
      warnings,
      details,
    };
  }

  /**
   * Universal swap execution endpoint
   */
  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Execute universal swap',
    description: 'Execute a previously quoted swap route across any supported ecosystem'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        routeId: { type: 'string', description: 'Route ID from quote response' },
        userSignature: { type: 'string', description: 'User signature for transaction execution' },
        slippageToleranceBps: { type: 'number', description: 'Final slippage tolerance' },
      },
      required: ['routeId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Swap execution initiated successfully',
    schema: {
      type: 'object',
      properties: {
        executionId: { type: 'string', example: 'exec_12345' },
        transactionHashes: { 
          type: 'array', 
          items: { type: 'string' },
          example: ['0xabc...', '0xdef...'] 
        },
        status: { type: 'string', enum: ['PENDING', 'SUCCESS', 'FAILED'] },
        estimatedCompletion: { type: 'string', format: 'date-time' },
      },
    },
  })
  async executeUniversalSwap(@Body() request: any) {
    this.logger.log(`Executing universal swap route: ${request.routeId}`);
    
    // TODO: Implement swap execution
    throw new BadRequestException('Universal swap execution not yet implemented');
  }

  /**
   * Check execution status
   */
  @Post('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Check swap execution status',
    description: 'Monitor the progress of a cross-chain or complex swap operation'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        executionId: { type: 'string', description: 'Execution ID from execute response' },
      },
      required: ['executionId'],
    },
  })
  async getSwapStatus(@Body() request: { executionId: string }) {
    this.logger.log(`Checking swap status: ${request.executionId}`);
    
    // TODO: Implement status checking
    throw new BadRequestException('Status checking not yet implemented');
  }

  /**
   * Route request to appropriate provider manager
   */
  private async routeToProviderManager(
    category: 'evm-aggregators' | 'meta' | 'native-l1' | 'solana',
    request: UniversalSwapRequestDto,
    swapType: SwapType
  ) {
    this.logger.debug(`Routing to provider category: ${category}`);
    
    switch (category) {
      case 'evm-aggregators':
        return await this.handleEvmAggregators(request, swapType);
        
      case 'meta':
        // TODO: Route to meta aggregator manager
        this.logger.debug('Routing to meta aggregators');
        break;
        
      case 'native-l1':
        // TODO: Route to native L1 router manager
        this.logger.debug('Routing to native L1 routers');
        break;
        
      case 'solana':
        // TODO: Route to Solana router manager
        this.logger.debug('Routing to Solana routers');
        break;
    }

    // Placeholder return for non-implemented categories
    return [{
      provider: 'placeholder',
      outputAmount: '0',
      estimatedGas: '0',
      steps: [],
      estimatedTime: 60,
      qualityScore: 85,
    }];
  }

  /**
   * Handle EVM aggregator routing with dynamic provider selection
   */
  private async handleEvmAggregators(
    request: UniversalSwapRequestDto,
    swapType: SwapType
  ) {
    this.logger.debug('Processing EVM aggregator request');

    try {
      // Convert universal request to legacy format parameters
      const legacyParams = this.convertToLegacyParams(request);
      
      this.logger.debug(`EVM params: Chain ${legacyParams.chainId}, ${legacyParams.sellToken} -> ${legacyParams.buyToken}, Amount: ${legacyParams.sellAmount}`);
      
      // Get multiple quotes using the existing dynamic provider selection
      const quotes = await this.aggregatorManager.getMultipleQuotes(
        legacyParams.chainId,
        legacyParams.sellToken,
        legacyParams.buyToken,
        legacyParams.sellAmount,
        legacyParams.taker,
        legacyParams.recipient,
        legacyParams.slippagePercentage,
        legacyParams.deadline
      );
      
      this.logger.debug(`Received ${quotes.length} quotes from EVM aggregators`);
      
      // Convert quotes to universal route format
      const routes = quotes.map((quoteResult, index) => {
        const { aggregator, quote } = quoteResult;
        
        this.logger.debug(`Processing quote ${index + 1} from ${aggregator}: ${quote.buyAmount} output, ${quote.gas} gas`);
        
        return {
          provider: aggregator,
          outputAmount: quote.buyAmount,
          estimatedGas: quote.estimatedGas || quote.gas,
          steps: [{
            action: 'swap' as const,
            provider: aggregator,
            fromToken: quote.sellToken,
            toToken: quote.buyToken,
            fromChain: legacyParams.chainId.toString(),
            toChain: legacyParams.chainId.toString(), // Same chain for EVM aggregators
            estimatedTime: 30, // Typical on-chain swap time
          }],
          estimatedTime: 30,
          qualityScore: this.calculateRouteQualityScore(quote, index, aggregator),
          // Include transaction data for immediate execution
          transactionData: {
            to: quote.to,
            data: quote.data,
            value: quote.value,
            gasLimit: quote.estimatedGas || quote.gas,
            gasPrice: quote.gasPrice,
            maxFeePerGas: quote.maxFeePerGas,
            maxPriorityFeePerGas: quote.maxPriorityFeePerGas,
            allowanceTarget: quote.allowanceTarget,
          },
          // Include additional metadata
          metadata: {
            aggregator: aggregator,
            priceImpact: quote.priceImpact,
            minBuyAmount: quote.minBuyAmount,
            approvalStrategy: quote.approvalStrategy,
            permit2: quote.permit2,
            chainId: legacyParams.chainId,
          },
        };
      });

      // Sort by quality score (highest first)
      routes.sort((a, b) => b.qualityScore - a.qualityScore);

      // Cache successful quotes for future chain/token support checks
      if (routes.length > 0 && routes[0].qualityScore > 0) {
        this.swapRoutingService.cacheSupportedQuote(
          legacyParams.chainId,
          legacyParams.buyToken,
          legacyParams.sellToken
        );
      }

      this.logger.log(`✅ Generated ${routes.length} EVM routes with quality scores: ${routes.map(r => `${r.provider}:${r.qualityScore}`).join(', ')}`);
      
      return routes;

    } catch (error) {
      this.logger.error(`EVM aggregator routing failed: ${error.message}`, error.stack);
      
      // Return fallback route with error indication
      return [{
        provider: 'evm-fallback',
        outputAmount: '0',
        estimatedGas: '0',
        steps: [],
        estimatedTime: 0,
        qualityScore: 0,
        error: error.message,
      }];
    }
  }

  /**
   * Convert UniversalSwapRequestDto to legacy parameters format
   */
  private convertToLegacyParams(request: UniversalSwapRequestDto) {
    // Validate that this is an EVM request
    if (request.sellToken.chain.ecosystem !== 'evm' || request.buyToken.chain.ecosystem !== 'evm') {
      throw new Error('EVM aggregators can only handle EVM ecosystem requests');
    }

    if (request.sellToken.chain.chainId !== request.buyToken.chain.chainId) {
      throw new Error('EVM aggregators can only handle same-chain swaps');
    }

    const chainId = request.sellToken.chain.chainId as number;
    
    return {
      chainId,
      sellToken: request.sellToken.address,
      buyToken: request.buyToken.address,
      sellAmount: request.sellAmount,
      taker: request.taker,
      recipient: request.recipient,
      slippagePercentage: request.slippageToleranceBps ? request.slippageToleranceBps / 100 : undefined,
      deadline: request.deadline,
    };
  }

  /**
   * Calculate route quality score based on quote characteristics
   */
  private calculateRouteQualityScore(quote: any, index: number, aggregator: string): number {
    let score = 100; // Base score

    // Penalize based on position (first quote is usually best)
    score -= index * 5;

    // Bonus for higher output amount (better price)
    const outputAmount = parseFloat(quote.buyAmount);
    if (outputAmount > 0) {
      score += Math.min(10, outputAmount / 1000000); // Small bonus for larger amounts
    }

    // Bonus for lower gas costs
    const gasAmount = parseFloat(quote.estimatedGas || quote.gas || '0');
    if (gasAmount > 0) {
      score -= Math.min(20, gasAmount / 100000); // Penalty for high gas
    }

    // Bonus for specific providers based on reliability
    switch (aggregator) {
      case '0x':
        score += 10; // Reliable provider bonus
        break;
      case 'odos':
        score += 8; // Good provider bonus
        break;
      default:
        score += 5; // Default provider bonus
    }

    // Bonus for price impact if available
    if (quote.priceImpact) {
      const priceImpact = parseFloat(quote.priceImpact);
      if (priceImpact < 1) {
        score += 5; // Low price impact bonus
      } else if (priceImpact > 5) {
        score -= 10; // High price impact penalty
      }
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Generate contextual warnings for the swap
   */
  private generateWarnings(
    request: UniversalSwapRequestDto, 
    swapType: SwapType, 
    complexity: any
  ): string[] {
    const warnings: string[] = [];

    if (swapType === SwapType.CROSS_CHAIN) {
      warnings.push('Cross-chain swaps may take 5-15 minutes to complete');
      warnings.push('Monitor transaction progress on both source and destination chains');
    }

    if (swapType === SwapType.NATIVE_SWAP) {
      warnings.push('Native L1 swaps via THORChain/Maya require multiple confirmations');
      warnings.push('Ensure memo field is correctly formatted for the swap');
    }

    if (complexity.complexity === 'complex') {
      warnings.push('Complex swap with multiple steps - higher gas costs expected');
      warnings.push('Consider breaking into smaller swaps if amount is large');
    }

    if (request.sellToken.chain.ecosystem === BlockchainEcosystem.BITCOIN) {
      warnings.push('Bitcoin transactions require network confirmations - allow extra time');
    }

    if (!request.preferredProvider) {
      warnings.push('Using automatic provider selection - specify preferredProvider for deterministic routing');
    }

    return warnings;
  }

  // ===== APPROVAL MANAGEMENT ENDPOINTS =====

  /**
   * Check approval status
   */
  @Post('approval/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check token approval status' })
  @ApiResponse({
    status: 200,
    description: 'Approval status retrieved successfully',
  })
  async getApprovalStatus(@Body() request: ApprovalStatusRequestDto) {
    this.logger.log(`Checking approval status for token ${request.tokenAddress}`);
    
    try {
      return await this.approvalService.getApprovalStatus(
        request.chainId,
        request.tokenAddress,
        request.owner,
        request.spender,
        request.amount,
      );
    } catch (error) {
      this.logger.error(`Failed to get approval status: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      if (error.message.includes('Invalid token address')) {
        throw new BadRequestException({
          message: 'Invalid token address provided.',
          error: 'InvalidTokenAddress',
          details: 'The provided token address is not valid or does not exist on this chain.'
        });
      } else if (error.message.includes('Invalid wallet address')) {
        throw new BadRequestException({
          message: 'Invalid wallet address provided.',
          error: 'InvalidWalletAddress',
          details: 'The owner or spender address is not a valid Ethereum address.'
        });
      } else if (error.message.includes('network')) {
        throw new ServiceUnavailableException({
          message: 'Network error occurred while checking approval.',
          error: 'NetworkError',
          details: 'There was a network connectivity issue. Please try again.'
        });
      } else {
        throw new InternalServerErrorException({
          message: 'Failed to check approval status. Please try again.',
          error: 'ApprovalServiceError',
          details: 'An unexpected error occurred while checking approval status.'
        });
      }
    }
  }

  /**
   * Execute approval transaction
   */
  @Post('approval/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute token approval transaction' })
  @ApiResponse({
    status: 200,
    description: 'Approval executed successfully',
  })
  async executeApproval(@Body() request: ApprovalRequestDto) {
    this.logger.log(`Executing approval for token ${request.tokenAddress}`);
    
    try {
      return await this.approvalService.executeApproval(
        request.chainId,
        request.privateKey,
        request.tokenAddress,
        request.spender,
        request.amount,
      );
    } catch (error) {
      this.logger.error(`Failed to execute approval: ${error.message}`, error.stack);
      
      // Transform specific errors into appropriate HTTP exceptions
      if (error.message.includes('Insufficient funds') || error.message.includes('Insufficient balance')) {
        throw new BadRequestException({
          message: 'Insufficient funds for approval transaction. Please check your wallet balance.',
          error: 'InsufficientFunds',
          details: 'The wallet does not have enough balance to cover the approval transaction gas fees.'
        });
      } else if (error.message.includes('Invalid private key')) {
        throw new BadRequestException({
          message: 'Invalid private key provided.',
          error: 'InvalidPrivateKey',
          details: 'The provided private key is not valid or properly formatted.'
        });
      } else if (error.message.includes('Invalid token address')) {
        throw new BadRequestException({
          message: 'Invalid token address provided.',
          error: 'InvalidTokenAddress',
          details: 'The provided token address is not valid or does not exist on this chain.'
        });
      } else if (error.message.includes('Gas estimation failed')) {
        throw new BadRequestException({
          message: 'Gas estimation failed for approval transaction.',
          error: 'GasEstimationFailed',
          details: 'Unable to estimate gas for the approval transaction.'
        });
      } else if (error.message.includes('network')) {
        throw new ServiceUnavailableException({
          message: 'Network error occurred during approval.',
          error: 'NetworkError',
          details: 'There was a network connectivity issue. Please try again.'
        });
      } else {
        throw new InternalServerErrorException({
          message: 'Approval execution failed. Please try again.',
          error: 'ApprovalExecutionFailed',
          details: 'An unexpected error occurred during approval execution.'
        });
      }
    }
  }

  // ===== INFORMATION & UTILITY ENDPOINTS =====

  /**
   * Get supported chains from all aggregators
   */
  @Get('supported-chains')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get supported chains with detailed information',
    description: 'Retrieves detailed information about chains supported by all aggregators, including chain names, native currencies, and other metadata from ChainList API. This endpoint dynamically fetches supported chains from each aggregator API and enriches them with comprehensive chain data.'
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved supported chains with detailed information.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            supportedChains: {
              type: 'array',
              description: 'Array of enhanced chain information for all supported chains',
              items: {
                type: 'object',
                properties: {
                  chainId: { type: 'number', example: 1 },
                  name: { type: 'string', example: 'Ethereum Mainnet' },
                  shortName: { type: 'string', example: 'eth' },
                  nativeCurrency: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', example: 'Ether' },
                      symbol: { type: 'string', example: 'ETH' },
                      decimals: { type: 'number', example: 18 }
                    }
                  },
                  network: { type: 'string', example: 'mainnet' },
                  infoURL: { type: 'string', example: 'https://ethereum.org' },
                  explorers: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', example: 'Etherscan' },
                        url: { type: 'string', example: 'https://etherscan.io' },
                        standard: { type: 'string', example: 'EIP3091' }
                      }
                    }
                  },
                  icon: { type: 'string', example: 'ethereum' }
                }
              },
              example: [
                {
                  chainId: 1,
                  name: 'Ethereum Mainnet',
                  shortName: 'eth',
                  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                  network: 'mainnet',
                  infoURL: 'https://ethereum.org'
                },
                {
                  chainId: 137,
                  name: 'Polygon Mainnet',
                  shortName: 'matic',
                  nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
                  network: 'matic',
                  infoURL: 'https://polygon.technology'
                }
              ]
            },
            aggregatorChains: {
              type: 'object',
              description: 'Breakdown of enhanced chain information by aggregator',
              additionalProperties: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    chainId: { type: 'number' },
                    name: { type: 'string' },
                    shortName: { type: 'string' },
                    nativeCurrency: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        symbol: { type: 'string' },
                        decimals: { type: 'number' }
                      }
                    }
                  }
                }
              },
              example: {
                'ZeroX': [
                  {
                    chainId: 1,
                    name: 'Ethereum Mainnet',
                    shortName: 'eth',
                    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
                  }
                ],
                'Odos': [
                  {
                    chainId: 137,
                    name: 'Polygon Mainnet',
                    shortName: 'matic',
                    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 }
                  }
                ]
              }
            }
          }
        },
        timestamp: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
      }
    }
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error occurred while fetching supported chains.',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Failed to retrieve supported chains' },
        error: { type: 'string', example: 'SupportedChainsError' },
        details: { type: 'string', example: 'An unexpected error occurred while fetching supported chains from aggregators.' }
      }
    }
  })
  async getSupportedChains() {
    try {
      this.logger.log('Fetching supported chains from all aggregators...');
      
      // Get supported chains from quote service which will fetch from all aggregators
      const result = await this.quoteService.getSupportedChains();
      
      this.logger.log(`Successfully retrieved ${result.supportedChains.length} unique supported chains`);
      
      // Return raw data - ResponseTransformInterceptor will wrap it
      return result;
    } catch (error) {
      this.logger.error(`Failed to get supported chains: ${error.message}`, error.stack);
      
      throw new InternalServerErrorException({
        message: 'Failed to retrieve supported chains',
        error: 'SupportedChainsError',
        details: 'An unexpected error occurred while fetching supported chains from aggregators.'
      });
    }
  }

   /**
   * Get supported aggregators for a chain
   */
  @Get('aggregators')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get supported aggregators for a chain' })
  @ApiQuery({ name: 'chainId', description: 'Chain ID', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Supported aggregators retrieved successfully',
  })
  async getSupportedAggregators(@Query('chainId', ParseIntPipe) chainId: number): Promise<AggregatorType[]> {
    this.logger.log(`Getting supported aggregators for chain ${chainId}`);

    try {
      // Use aggregator manager for supported aggregators
      return this.aggregatorManager.getEnhancedSupportedAggregators(chainId);
    } catch (error) {
      this.logger.error(`Failed to get supported aggregators: ${error.message}`, error.stack);
      
      if (error.message.includes('Invalid chain ID') || error.message.includes('Unsupported chain')) {
        throw new BadRequestException({
          message: 'Invalid or unsupported chain ID.',
          error: 'InvalidChainId',
          details: 'The provided chain ID is not supported by the service.'
        });
      } else {
        throw new InternalServerErrorException({
          message: 'Failed to get supported aggregators. Please try again.',
          error: 'AggregatorServiceError',
          details: 'An unexpected error occurred while fetching supported aggregators.'
        });
      }
    }
  }

  /**
   * Health check endpoint
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Health check for universal swap service' })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
  })
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
}