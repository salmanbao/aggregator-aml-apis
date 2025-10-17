import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { CustomHttpService } from '@shared/services/http.service';
import { SwapRequest, SwapQuote, AggregatorType } from '@swap/models/swap-request.model';
import { IOnchainAggregator, TransactionBuild, ProviderConfig, ProviderHealth } from '@swap/models/ports';
import { 
  OdosQuoteResponse, 
  OdosAssembleResponse, 
  ApiErrorResponse,
  isApiErrorResponse 
} from '@swap/models/aggregator-responses';
import type { IAggregatorRegistry } from '@swap/services/core/aggregation/aggregator-registry.interface';
import { AggregatorManagerService } from '@swap/services/core/aggregation/aggregator-manager.service';

/**
 * Odos quote with timestamp for expiry tracking
 */
interface OdosQuoteWithTimestamp {
  response: OdosQuoteResponse;
  timestamp: number;
}

/**
 * Odos Smart Order Routing (SOR) aggregator service
 * Implements Odos API v2 with /sor/quote/v2 and /sor/assemble endpoints
 * NOW WITH SELF-REGISTRATION: Automatically registers itself with AggregatorManagerService
 * 
 * @see https://docs.odos.xyz/build/quickstart/sor
 */
@Injectable()
export class OdosService implements IOnchainAggregator, OnModuleInit {
  private readonly logger = new Logger(OdosService.name);
  private readonly baseUrl = 'https://api.odos.xyz';
  private readonly referralCode = parseInt(process.env.ODOS_REFERRAL_CODE || '0', 10);
  private readonly quoteExpiryMs = 55000; // 55 seconds to allow for assembly time (Odos quotes expire in 60s)
  private readonly supportedChainsHardcoded = [
      1,     // Ethereum Mainnet
      10,    // Optimism
      56,    // BNB Smart Chain
      130,   // Unichain
      137,   // Polygon
      146,   // Sonic Mainnet
      250,   // Fantom
      254,   // Fraxtal
      324,    // zkSync Era
      5000,   // Mantle
      8453,  // Base
      34443, // Mode
      42161, // Arbitrum One
      43114, // Avalanche
      59144, // Linea
      534352, // Scroll
    ]

  constructor(
    private readonly httpService: CustomHttpService,
    @Optional() @Inject(AggregatorManagerService) private readonly registry?: IAggregatorRegistry
  ) {}

  /**
   * Self-register with aggregator manager on module initialization
   */
  onModuleInit() {
    if (this.registry) {
      this.registry.registerEvmAggregator(this);
      this.logger.debug(`${this.getProviderName()} self-registered with aggregator manager`);
    } else {
      this.logger.warn(`${this.getProviderName()} could not find registry to self-register`);
    }
  }

  /**
   * Get swap quote from Odos Smart Order Routing v2
   */
  async getQuote(request: SwapRequest, strictValidation: boolean = true): Promise<SwapQuote> {
    try {
      this.logger.debug(`Getting Odos SOR quote for chain ${request.chainId}`, {
        sellToken: request.sellToken,
        buyToken: request.buyToken,
        sellAmount: request.sellAmount
      });

      // Step 1: Get quote from /sor/quote/v2 with timestamp tracking
      const quoteWithTimestamp = await this.getOdosQuoteWithTimestamp(request, strictValidation);
      
      // Step 2: Assemble transaction from /sor/assemble with expiry check
      const assembleResponse = await this.assembleTransactionWithRetry(
        quoteWithTimestamp.response.pathId, 
        request.taker,
        quoteWithTimestamp.timestamp,
        request
      );

      // Step 3: Parse and return SwapQuote
      const result = this.parseSwapQuote(quoteWithTimestamp.response, assembleResponse, request);
      
      this.logger.debug('Odos quote pipeline completed successfully', {
        pathId: quoteWithTimestamp.response.pathId,
        buyAmount: result.buyAmount,
        aggregator: result.aggregator
      });

      return result;

    } catch (error) {
      this.logger.error(`Failed to get Odos SOR quote: ${error.message}`, error.stack);
      
      if (error.response || error.request) {
        this.handleApiError(error, 'getQuote');
      }
      
      throw new Error(`Odos SOR quote failed: ${error.message}`);
    }
  }

  /**
   * Build transaction data for execution (uses assembled transaction from Odos)
   */
  async buildTx(request: SwapRequest): Promise<TransactionBuild> {
    try {
      const quote = await this.getQuote(request);
      
      return {
        to: quote.to,
        data: quote.data,
        value: quote.value,
        gasLimit: quote.gas,
        gasPrice: quote.gasPrice,
        maxFeePerGas: quote.maxFeePerGas,
        maxPriorityFeePerGas: quote.maxPriorityFeePerGas
      };
    } catch (error) {
      this.logger.error(`Failed to build Odos transaction: ${error.message}`);
      throw new Error(`Odos transaction build failed: ${error.message}`);
    }
  }

  /**
   * Check if Odos supports the given chain
   */
  supportsChain(chainId: number): boolean {
    // Odos supports 16+ blockchain protocols as mentioned in their docs
    // Based on common chains supported by major aggregators (hardcoded fallback)
    ;
    
    return this.supportedChainsHardcoded.includes(chainId);
  }

  /**
   * Get all supported chains dynamically from Odos API
   */
  async getSupportedChains(): Promise<number[]> {
    try {
      const url = `${this.baseUrl}/info/chains`;

      this.logger.debug('Fetching supported chains from Odos API');

      const response = await this.httpService.get<{ chains: number[] }>(url, {
        timeout: 10000,
      });

      // Handle both array response and object with array response
      const chains = Array.isArray(response) ? response : response;
      const chainIds = chains?.chains || [];
      
      this.logger.debug(`Odos API returned ${chainIds.length} supported chains: ${chainIds.join(', ')}`);
      
      return chainIds.filter(chainId => chainId > 0);
    } catch (error) {
      this.logger.warn(`Failed to fetch supported chains from Odos API: ${error.message}, using hardcoded list`);
      
      // Fallback to hardcoded list
      return this.supportedChainsHardcoded;
    }
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return 'Odos';
  }

  /**
   * Health check for Odos API
   */
  async healthCheck(): Promise<ProviderHealth> {
    const startTime = Date.now();
    
    try {
      // Simple health check - get supported tokens for Ethereum
      await this.httpService.get(`${this.baseUrl}/info/tokens/1`, {
        timeout: 5000,
      });
      
      const latency = Date.now() - startTime;
      
      return {
        name: this.getProviderName(),
        status: 'healthy',
        latency,
        lastCheck: new Date(),
        errorRate: 0
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      
      return {
        name: this.getProviderName(),
        status: 'unhealthy',
        latency,
        lastCheck: new Date(),
        errorRate: 1
      };
    }
  }

  /**
   * Get provider configuration
   */
  getConfig(): ProviderConfig {
    return {
      name: this.getProviderName(),
      baseUrl: this.baseUrl,
      enabled: true,
      timeout: 15000,
      retries: 2,
      rateLimit: {
        requests: 100,
        perSeconds: 60
      }
    };
  }

  /**
   * Step 1: Get quote from Odos /sor/quote/v2 endpoint with timestamp tracking
   */
  private async getOdosQuoteWithTimestamp(request: SwapRequest, strictValidation: boolean = true): Promise<OdosQuoteWithTimestamp> {
    const url = `${this.baseUrl}/sor/quote/v2`;
    
    const requestBody = {
      chainId: request.chainId,
      inputTokens: [
        {
          tokenAddress: request.sellToken,
          amount: request.sellAmount
        }
      ],
      outputTokens: [
        {
          tokenAddress: request.buyToken,
          proportion: 1 // 100% to single output token
        }
      ],
      slippageLimitPercent: request.slippagePercentage || 0.5, // Default 0.5%
      userAddr: request.taker,
      referralCode: this.referralCode,
      disableRFQs: true, // Maximize reliability as recommended
      compact: true // Enable compact call data as recommended
    };

    this.logger.debug('Requesting Odos quote', { url, requestBody });

    const timestamp = Date.now();
    const response = await this.httpService.post<OdosQuoteResponse>(url, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    this.validateQuoteResponse(response, strictValidation);
    
    this.logger.debug('Odos quote received', { 
      pathId: response.pathId, 
      timestamp,
      expiresAt: new Date(timestamp + 60000).toISOString()
    });

    return { response, timestamp };
  }

  /**
   * Step 1 (Legacy): Get quote from Odos /sor/quote/v2 endpoint - kept for backward compatibility
   */
  private async getOdosQuote(request: SwapRequest, strictValidation: boolean = true): Promise<OdosQuoteResponse> {
    const quoteWithTimestamp = await this.getOdosQuoteWithTimestamp(request, strictValidation);
    return quoteWithTimestamp.response;
  }

  /**
   * Step 2: Assemble transaction from Odos /sor/assemble endpoint with retry logic
   */
  private async assembleTransactionWithRetry(
    pathId: string, 
    userAddr: string, 
    quoteTimestamp: number, 
    originalRequest: SwapRequest
  ): Promise<OdosAssembleResponse> {
    try {
      // Check if quote is still valid before assembly
      this.validateQuoteExpiry(quoteTimestamp);
      
      return await this.assembleTransaction(pathId, userAddr);
    } catch (error) {
      // If assembly fails due to expired pathId, auto-refresh quote and retry once
      if (this.isQuoteExpiredError(error) || this.isQuoteExpired(quoteTimestamp)) {
        this.logger.warn('Quote expired, refreshing and retrying assembly', { 
          pathId, 
          quoteAge: Date.now() - quoteTimestamp 
        });
        
        // Get fresh quote
        const freshQuote = await this.getOdosQuoteWithTimestamp(originalRequest);
        
        // Retry assembly with fresh pathId
        return await this.assembleTransaction(freshQuote.response.pathId, userAddr);
      }
      
      throw error;
    }
  }

  /**
   * Step 2 (Core): Assemble transaction from Odos /sor/assemble endpoint
   */
  private async assembleTransaction(pathId: string, userAddr: string): Promise<OdosAssembleResponse> {
    const url = `${this.baseUrl}/sor/assemble`;
    
    const requestBody = {
      userAddr,
      pathId,
      simulate: false // Set to true only if not doing own gas estimation
    };

    this.logger.debug('Assembling Odos transaction', { url, pathId, userAddr });

    const response = await this.httpService.post<OdosAssembleResponse>(url, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    this.validateAssembleResponse(response);
    return response;
  }

  /**
   * Parse Odos responses into SwapQuote format
   */
  private parseSwapQuote(quoteResponse: OdosQuoteResponse, assembleResponse: OdosAssembleResponse, request: SwapRequest): SwapQuote {
    const transaction = assembleResponse.transaction;
    
    // Extract output amount from quote response
    const outputAmount = quoteResponse.outAmounts?.[0] || '0';
    const minOutputAmount = this.calculateMinOutput(outputAmount, request.slippagePercentage || 0.5);

    return {
      sellToken: request.sellToken,
      buyToken: request.buyToken,
      sellAmount: request.sellAmount,
      buyAmount: outputAmount,
      minBuyAmount: minOutputAmount,
      gas: transaction.gas || transaction.gasLimit || '0',
      gasPrice: transaction.gasPrice || transaction.maxFeePerGas,
      to: transaction.to,
      data: transaction.data,
      value: transaction.value || '0',
      allowanceTarget: transaction.to, // Router address for approvals
      aggregator: AggregatorType.ODOS,
      priceImpact: quoteResponse.priceImpact?.toString(),
      estimatedGas: transaction.gas || transaction.gasLimit || '0',
      // Enhanced gas handling for EIP-1559 networks
      maxFeePerGas: transaction.maxFeePerGas,
      maxPriorityFeePerGas: transaction.maxPriorityFeePerGas
    };
  }

  /**
   * Calculate minimum output amount considering slippage
   */
  private calculateMinOutput(outputAmount: string, slippagePercentage: number): string {
    const output = BigInt(outputAmount);
    const slippageMultiplier = 1 - (slippagePercentage / 100);
    const minOutput = BigInt(Math.floor(Number(output) * slippageMultiplier));
    return minOutput.toString();
  }

  /**
   * Validate quote response from Odos
   */
  private validateQuoteResponse(response: any, strictValidation: boolean = true): void {
    if (!response) {
      throw new Error('Empty response from Odos quote API');
    }

    // Check if it's an error response
    if (isApiErrorResponse(response)) {
      const errors = response.detail.map(d => d.msg).join(', ');
      throw new Error(`Odos API error: ${errors}`);
    }

    if (!response.pathId) {
      throw new Error('Invalid quote response: missing pathId');
    }

    if (!response.outAmounts || response.outAmounts.length === 0) {
      throw new Error('Invalid quote response: missing outAmounts');
    }

    // Check for insufficient liquidity - more relaxed when not doing strict validation
    if (response.outAmounts[0] === '0') {
      if (strictValidation) {
        throw new Error('Insufficient liquidity for this trade on Odos');
      } else {
        this.logger.warn('Insufficient liquidity detected in Odos quote - may affect execution');
      }
    }

    this.logger.debug('Odos quote validation passed', {
      pathId: response.pathId,
      outAmount: response.outAmounts[0],
      strict: strictValidation
    });
  }

  /**
   * Validate assemble response from Odos
   */
  private validateAssembleResponse(response: any): void {
    if (!response) {
      throw new Error('Empty response from Odos assemble API');
    }

    // Check if it's an error response
    if (isApiErrorResponse(response)) {
      const errors = response.detail.map(d => d.msg).join(', ');
      throw new Error(`Odos assemble API error: ${errors}`);
    }

    if (!response.transaction) {
      throw new Error('Invalid assemble response: missing transaction');
    }

    const tx = response.transaction;
    if (!tx.to || !tx.data) {
      throw new Error('Invalid assemble response: missing transaction.to or transaction.data');
    }

    this.logger.debug('Odos assemble validation passed', {
      to: tx.to,
      value: tx.value,
      gasEstimate: tx.gas || tx.gasLimit
    });
  }

  /**
   * Validate quote expiry to ensure pathId is still valid
   */
  private validateQuoteExpiry(quoteTimestamp: number): void {
    const now = Date.now();
    const quoteAge = now - quoteTimestamp;
    
    if (quoteAge > this.quoteExpiryMs) {
      throw new Error(`Quote has expired (age: ${Math.round(quoteAge / 1000)}s). Odos quotes expire after 60 seconds.`);
    }
    
    this.logger.debug('Quote expiry validation passed', { 
      quoteAge: Math.round(quoteAge / 1000),
      remainingTime: Math.round((this.quoteExpiryMs - quoteAge) / 1000)
    });
  }

  /**
   * Check if quote has expired based on timestamp
   */
  private isQuoteExpired(quoteTimestamp: number): boolean {
    const now = Date.now();
    const quoteAge = now - quoteTimestamp;
    return quoteAge > this.quoteExpiryMs;
  }

  /**
   * Check if error is related to quote expiry
   */
  private isQuoteExpiredError(error: any): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    return (
      errorMessage.includes('pathid') ||
      errorMessage.includes('path id') ||
      errorMessage.includes('expired') ||
      errorMessage.includes('invalid path') ||
      errorMessage.includes('not found')
    );
  }

  /**
   * Handle API errors with specific error messages
   */
  private handleApiError(error: any, context: string): never {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 400:
          throw new Error(`Bad request: ${data?.message || 'Invalid parameters for Odos API'}`);
        case 401:
          throw new Error('Unauthorized: Invalid API credentials for Odos');
        case 403:
          throw new Error('Forbidden: API access denied for Odos');
        case 404:
          throw new Error('Not found: Odos API endpoint not found');
        case 422:
          throw new Error(`Unprocessable entity: ${data?.message || 'Invalid request data for Odos'}`);
        case 429:
          throw new Error('Rate limited: Too many requests to Odos API');
        case 500:
          throw new Error('Internal server error: Odos API is experiencing issues');
        case 503:
          throw new Error('Service unavailable: Odos API is temporarily down');
        default:
          throw new Error(`Odos API error (${status}): ${data?.message || 'Unknown error'}`);
      }
    } else if (error.request) {
      throw new Error('Network error: Unable to reach Odos API');
    } else {
      throw new Error(`Request setup error: ${error.message}`);
    }
  }
}