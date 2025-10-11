import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { EnhancedAggregatorManagerService } from '@swap/services/core/aggregation/enhanced-aggregator-manager.service';
import type { SwapRequest } from '../models/swap-request.model';
import type { 
  RouteRequest, 
  SolanaQuoteRequest, 
  NativeQuoteRequest, 
  ProviderHealth,
  SwapQuote
} from '../models/ports';

/**
 * Enhanced swap controller exposing multi-provider capabilities
 */
@ApiTags('Enhanced Swap')
@Controller('swap/enhanced')
export class EnhancedSwapController {
  private readonly logger = new Logger(EnhancedSwapController.name);

  constructor(
    private readonly enhancedAggregatorManager: EnhancedAggregatorManagerService,
  ) {}

  /**
   * Get provider health status
   */
  @Get('providers/health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get health status of all providers',
    description: 'Returns real-time health status of EVM aggregators, meta aggregators, Solana routers, and native L1 routers'
  })
  @ApiResponse({
    status: 200,
    description: 'Provider health retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        evm: { type: 'array', items: { type: 'object' } },
        meta: { type: 'array', items: { type: 'object' } },
        solana: { type: 'array', items: { type: 'object' } },
        native: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  async getProvidersHealth(): Promise<Record<string, ProviderHealth[]>> {
    this.logger.log('Getting provider health status');
    
    try {
      return await this.enhancedAggregatorManager.getProvidersHealth();
    } catch (error) {
      this.logger.error(`Failed to get provider health: ${error.message}`, error.stack);
      throw new InternalServerErrorException({
        message: 'Failed to get provider health status.',
        error: 'ProviderHealthError',
        details: 'An error occurred while checking provider health.'
      });
    }
  }

  /**
   * Get provider configurations
   */
  @Get('providers/config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get provider configurations',
    description: 'Returns configuration details for all registered providers including rate limits and capabilities'
  })
  @ApiResponse({
    status: 200,
    description: 'Provider configs retrieved successfully',
  })
  async getProviderConfigs(): Promise<Record<string, any>> {
    this.logger.log('Getting provider configurations');
    
    try {
      return this.enhancedAggregatorManager.getProviderConfigs();
    } catch (error) {
      this.logger.error(`Failed to get provider configs: ${error.message}`, error.stack);
      throw new InternalServerErrorException({
        message: 'Failed to get provider configurations.',
        error: 'ProviderConfigError',
        details: 'An error occurred while fetching provider configurations.'
      });
    }
  }

  /**
   * Get supported chains across all providers
   */
  @Get('providers/supported-chains')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get supported chains',
    description: 'Returns list of blockchain networks supported by EVM aggregators'
  })
  @ApiResponse({
    status: 200,
    description: 'Supported chains retrieved successfully',
    schema: {
      type: 'array',
      items: { type: 'number' },
    },
  })
  async getSupportedChains(): Promise<number[]> {
    this.logger.log('Getting supported chains');
    
    try {
      return this.enhancedAggregatorManager.getSupportedChains();
    } catch (error) {
      this.logger.error(`Failed to get supported chains: ${error.message}`, error.stack);
      throw new InternalServerErrorException({
        message: 'Failed to get supported chains.',
        error: 'SupportedChainsError',
        details: 'An error occurred while fetching supported chains.'
      });
    }
  }

  /**
   * Get cross-chain routes
   */
  @Post('cross-chain/routes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get cross-chain swap routes',
    description: 'Get available cross-chain routes using meta aggregators like LI.FI'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fromChainId: { type: 'number', example: 1 },
        toChainId: { type: 'number', example: 137 },
        fromToken: { type: 'string', example: '0xA0b86a33E6E2A3E6B3A7E5E5D5C5F5E5E5E5E5E5' },
        toToken: { type: 'string', example: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' },
        amount: { type: 'string', example: '1000000000000000000' },
        slippageBps: { type: 'number', example: 100 },
        userAddress: { type: 'string', example: '0x742d35Cc6634C0532925a3b8D8f323C34A5d4000' },
        recipient: { type: 'string', example: '0x742d35Cc6634C0532925a3b8D8f323C34A5d4000' },
      },
      required: ['fromChainId', 'toChainId', 'fromToken', 'toToken', 'amount', 'slippageBps'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Cross-chain routes retrieved successfully',
  })
  async getCrossChainRoutes(@Body() request: RouteRequest): Promise<any> {
    this.logger.log(`Getting cross-chain routes from chain ${request.fromChainId} to ${request.toChainId}`);
    
    try {
      return await this.enhancedAggregatorManager.getCrossChainRoutes(request);
    } catch (error) {
      this.logger.error(`Failed to get cross-chain routes: ${error.message}`, error.stack);
      
      if (error.message.includes('No healthy meta aggregators')) {
        throw new ServiceUnavailableException({
          message: 'No cross-chain aggregators available.',
          error: 'NoMetaAggregators',
          details: 'All cross-chain aggregators are currently unavailable.'
        });
      } else if (error.message.includes('Unsupported chain')) {
        throw new BadRequestException({
          message: 'Unsupported chain for cross-chain routing.',
          error: 'UnsupportedChain',
          details: 'The specified chain pair is not supported for cross-chain swaps.'
        });
      } else {
        throw new InternalServerErrorException({
          message: 'Failed to get cross-chain routes.',
          error: 'CrossChainRoutesError',
          details: 'An error occurred while fetching cross-chain routes.'
        });
      }
    }
  }

  /**
   * Get Solana swap quote
   */
  @Post('solana/quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get Solana swap quote',
    description: 'Get swap quote for Solana tokens using Jupiter aggregator'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fromMint: { type: 'string', example: 'So11111111111111111111111111111111111111112' },
        toMint: { type: 'string', example: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
        amount: { type: 'string', example: '1000000000' },
        slippageBps: { type: 'number', example: 50 },
        userPublicKey: { type: 'string', example: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK' },
        platformFeeBps: { type: 'number', example: 0 },
      },
      required: ['fromMint', 'toMint', 'amount', 'slippageBps'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Solana quote retrieved successfully',
  })
  async getSolanaQuote(@Body() request: SolanaQuoteRequest): Promise<any> {
    this.logger.log(`Getting Solana quote for ${request.fromMint} -> ${request.toMint}`);
    
    try {
      return await this.enhancedAggregatorManager.getSolanaQuote(request);
    } catch (error) {
      this.logger.error(`Failed to get Solana quote: ${error.message}`, error.stack);
      
      if (error.message.includes('No healthy Solana routers')) {
        throw new ServiceUnavailableException({
          message: 'No Solana routers available.',
          error: 'NoSolanaRouters',
          details: 'All Solana routers are currently unavailable.'
        });
      } else if (error.message.includes('Invalid mint address')) {
        throw new BadRequestException({
          message: 'Invalid Solana token mint address.',
          error: 'InvalidMintAddress',
          details: 'One or both token mint addresses are invalid.'
        });
      } else {
        throw new InternalServerErrorException({
          message: 'Failed to get Solana quote.',
          error: 'SolanaQuoteError',
          details: 'An error occurred while fetching Solana swap quote.'
        });
      }
    }
  }

  /**
   * Get native L1 quote (Bitcoin to EVM)
   */
  @Post('native/quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get native L1 cross-chain quote',
    description: 'Get cross-chain quote for Bitcoin to EVM tokens using THORChain'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        toChainId: { type: 'number', example: 1 },
        toToken: { type: 'string', example: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
        amountSats: { type: 'string', example: '10000000' },
        userAddress: { type: 'string', example: '0x742d35Cc6634C0532925a3b8D8f323C34A5d4000' },
        memo: { type: 'string', example: '' },
      },
      required: ['toChainId', 'toToken', 'amountSats'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Native quote retrieved successfully',
  })
  async getNativeQuote(@Body() request: NativeQuoteRequest): Promise<any> {
    this.logger.log(`Getting native quote for ${request.amountSats} sats to chain ${request.toChainId}`);
    
    try {
      return await this.enhancedAggregatorManager.getNativeQuote(request);
    } catch (error) {
      this.logger.error(`Failed to get native quote: ${error.message}`, error.stack);
      
      if (error.message.includes('No healthy native routers')) {
        throw new ServiceUnavailableException({
          message: 'No native routers available.',
          error: 'NoNativeRouters',
          details: 'All native L1 routers are currently unavailable.'
        });
      } else if (error.message.includes('Unsupported destination chain')) {
        throw new BadRequestException({
          message: 'Unsupported destination chain for native routing.',
          error: 'UnsupportedDestination',
          details: 'The specified destination chain is not supported for native L1 swaps.'
        });
      } else {
        throw new InternalServerErrorException({
          message: 'Failed to get native quote.',
          error: 'NativeQuoteError',
          details: 'An error occurred while fetching native L1 quote.'
        });
      }
    }
  }

  /**
   * Compare quotes across multiple providers
   */
  @Post('multi-provider/compare')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Compare quotes across providers',
    description: 'Get and compare quotes from multiple EVM aggregators to find the best rate'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        chainId: { type: 'number', example: 1 },
        sellToken: { type: 'string', example: '0xA0b86a33E6E2A3E6B3A7E5E5D5C5F5E5E5E5E5E5' },
        buyToken: { type: 'string', example: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
        sellAmount: { type: 'string', example: '1000000000000000000' },
        taker: { type: 'string', example: '0x742d35Cc6634C0532925a3b8D8f323C34A5d4000' },
        slippagePercentage: { type: 'number', example: 1 },
      },
      required: ['chainId', 'sellToken', 'buyToken', 'sellAmount', 'taker'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Provider comparison completed successfully',
  })
  async compareProviders(@Body() request: SwapRequest): Promise<any> {
    this.logger.log(`Comparing providers for ${request.sellToken} -> ${request.buyToken}`);
    
    try {
      const providers = await this.enhancedAggregatorManager['getHealthyEvmProviders'](request.chainId);
      const results: Array<{
        provider: string;
        quote?: SwapQuote;
        error?: string;
        success: boolean;
      }> = [];
      
      for (const provider of providers) {
        try {
          const quote = await provider.getQuote(request);
          results.push({
            provider: provider.getProviderName(),
            quote,
            success: true,
          });
        } catch (error) {
          results.push({
            provider: provider.getProviderName(),
            error: error.message,
            success: false,
          });
        }
      }
      
      // Find best quote by buy amount
      const successfulQuotes = results.filter(r => r.success && r.quote);
      const bestQuote = successfulQuotes.reduce((best, current) => {
        if (!best.quote || !current.quote) return current;
        return parseFloat(current.quote.buyAmount) > parseFloat(best.quote.buyAmount) ? current : best;
      }, successfulQuotes[0] || { provider: 'none', quote: undefined });
      
      return {
        results,
        bestProvider: bestQuote?.provider || 'none',
        totalProviders: providers.length,
        successfulProviders: successfulQuotes.length,
      };
    } catch (error) {
      this.logger.error(`Failed to compare providers: ${error.message}`, error.stack);
      
      throw new InternalServerErrorException({
        message: 'Failed to compare providers.',
        error: 'ProviderComparisonError',
        details: 'An error occurred while comparing provider quotes.'
      });
    }
  }
}