import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SwapCacheService } from './swap-cache.service';
import { 
  UniversalSwapRequestDto, 
  SwapType, 
  BlockchainEcosystem, 
  TokenStandard 
} from '@swap/dto/universal-swap-request.dto';

/**
 * Service for intelligent swap routing based on request characteristics
 */
@Injectable()
export class SwapRoutingService {
  // Registry of all provider instances for fallback support checks
  private providerRegistry: any[] = [];

  
  constructor(private readonly swapCacheService: SwapCacheService) {}

  /**
   * Set the provider registry (array of all provider instances)
   */
  setProviderRegistry(providers: any[]) {
    this.providerRegistry = providers;
  }
  /**
   * Returns the spender address for approval checks (EVM: allowanceTarget from 0x/Odos, others: empty string)
   */
  async getSpenderForSwap(request: UniversalSwapRequestDto, aggregatorManager: any): Promise<string> {
    const swapType = this.determineSwapType(request);
    const providerCategory = this.determineProviderCategory(swapType, request);
    if (providerCategory === 'evm-aggregators') {
      // Try to get allowanceTarget from first available quote
      const legacyParams = {
        chainId: request.sellToken.chain.chainId,
        sellToken: request.sellToken.address,
        buyToken: request.buyToken.address,
        sellAmount: request.sellAmount,
        taker: request.taker,
        recipient: request.recipient,
        slippagePercentage: request.slippageToleranceBps ? request.slippageToleranceBps / 100 : undefined,
        deadline: request.deadline,
      };
      try {
        const quotes = await aggregatorManager.getMultipleQuotes(
          legacyParams.chainId,
          legacyParams.sellToken,
          legacyParams.buyToken,
          legacyParams.sellAmount,
          legacyParams.taker,
          legacyParams.recipient,
          legacyParams.slippagePercentage,
          legacyParams.deadline
        );
        if (quotes.length > 0 && quotes[0].quote.allowanceTarget) {
          return quotes[0].quote.allowanceTarget;
        }
      } catch (e) {
        // Fallback: no allowanceTarget found
      }
    }
    // For non-EVM, or if no allowanceTarget found, return empty string
    return '';
  }
  private readonly logger = new Logger(SwapRoutingService.name);

  /**
   * Determines the swap type based on the request
   */
  determineSwapType(request: UniversalSwapRequestDto): SwapType {
    const sellChain = request.sellToken.chain;
    const buyChain = request.buyToken.chain;

    this.logger.debug(`Analyzing swap: ${sellChain.ecosystem}:${sellChain.chainId} -> ${buyChain.ecosystem}:${buyChain.chainId}`);

    // If swap type is explicitly provided, validate and return it
    if (request.swapType) {
      if (this.validateSwapType(request, request.swapType)) {
        return request.swapType;
      }
      this.logger.warn(`Provided swap type ${request.swapType} doesn't match request characteristics, auto-detecting...`);
    }

    // Same ecosystem and chain = on-chain swap
    if (sellChain.ecosystem === buyChain.ecosystem && sellChain.chainId === buyChain.chainId) {
      return SwapType.ON_CHAIN;
    }

    // Different ecosystems = cross-chain swap via meta aggregators
    if (sellChain.ecosystem !== buyChain.ecosystem) {
      // Special case: native L1 swaps (THORChain, Maya)
      if (this.isNativeL1Swap(sellChain.ecosystem, buyChain.ecosystem)) {
        return SwapType.NATIVE_SWAP;
      }
      return SwapType.CROSS_CHAIN;
    }

    // Same ecosystem, different chains
    if (sellChain.ecosystem === buyChain.ecosystem && sellChain.chainId !== buyChain.chainId) {
      // EVM chains - determine L1/L2 relationship
      if (sellChain.ecosystem === BlockchainEcosystem.EVM) {
        return this.determineEvmSwapType(sellChain.chainId as number, buyChain.chainId as number);
      }
      
      // Non-EVM cross-chain
      return SwapType.CROSS_CHAIN;
    }

    throw new BadRequestException('Unable to determine swap type from request');
  }

  /**
   * Determines the appropriate provider category
   */
  determineProviderCategory(swapType: SwapType, request: UniversalSwapRequestDto): 'evm-aggregators' | 'meta' | 'native-l1' | 'solana' {
    switch (swapType) {
      case SwapType.ON_CHAIN:
        return this.getOnChainProviderCategory(request);
      
      case SwapType.CROSS_CHAIN:
      case SwapType.L1_TO_L2:
      case SwapType.L2_TO_L1:
      case SwapType.L2_TO_L2:
        return 'meta'; // Meta aggregators handle cross-chain
      
      case SwapType.NATIVE_SWAP:
        return 'native-l1'; // THORChain, Maya for native L1 swaps
      
      default:
        throw new BadRequestException(`Unsupported swap type: ${swapType}`);
    }
  }

  /**
   * Gets the best providers for the determined category
   */
  getProvidersForCategory(
    category: 'evm-aggregators' | 'meta' | 'native-l1' | 'solana',
    request: UniversalSwapRequestDto
  ): string[] {
    switch (category) {
      case 'evm-aggregators':
        return this.getEvmAggregators(request);
      
      case 'meta':
        return this.getMetaAggregators(request);
      
      case 'native-l1':
        return this.getNativeL1Providers(request);
      
      case 'solana':
        return this.getSolanaProviders(request);
      
      default:
        return [];
    }
  }

  /**
   * Validates chain compatibility for the swap
   */
  validateChainCompatibility(request: UniversalSwapRequestDto): boolean {
    const sellChain = request.sellToken.chain;
    const buyChain = request.buyToken.chain;

    // Check if ecosystems are supported
    if (!this.isSupportedEcosystem(sellChain.ecosystem) || !this.isSupportedEcosystem(buyChain.ecosystem)) {
      return false;
    }

    // Check specific chain support using cache service
    return this.isChainSupported(sellChain) && this.isChainSupported(buyChain);
  }

  /**
   * Estimates complexity and routing requirements
   */
  estimateSwapComplexity(request: UniversalSwapRequestDto): {
    complexity: 'simple' | 'moderate' | 'complex';
    estimatedSteps: number;
    estimatedTime: number; // seconds
    recommendedProviders: string[];
  } {
    const swapType = this.determineSwapType(request);
    const category = this.determineProviderCategory(swapType, request);

    switch (swapType) {
      case SwapType.ON_CHAIN:
        return {
          complexity: 'simple',
          estimatedSteps: 1,
          estimatedTime: 30,
          recommendedProviders: this.getProvidersForCategory(category, request).slice(0, 2)
        };

      case SwapType.L1_TO_L2:
      case SwapType.L2_TO_L1:
        return {
          complexity: 'moderate',
          estimatedSteps: 2,
          estimatedTime: 180, // 3 minutes for L1/L2 bridges
          recommendedProviders: ['lifi', 'socket'] // Placeholder for meta aggregators
        };

      case SwapType.CROSS_CHAIN:
        return {
          complexity: 'complex',
          estimatedSteps: this.estimateCrossChainSteps(request),
          estimatedTime: 600, // 10 minutes for complex cross-chain
          recommendedProviders: ['lifi', 'rango', 'socket'] // Placeholder for meta aggregators
        };

      case SwapType.NATIVE_SWAP:
        return {
          complexity: 'moderate',
          estimatedSteps: 1,
          estimatedTime: 300, // 5 minutes for THORChain swaps
          recommendedProviders: ['thorchain', 'maya'] // Placeholder for native L1
        };

      default:
        return {
          complexity: 'complex',
          estimatedSteps: 3,
          estimatedTime: 900,
          recommendedProviders: []
        };
    }
  }

  private validateSwapType(request: UniversalSwapRequestDto, swapType: SwapType): boolean {
    const detected = this.determineSwapType({ ...request, swapType: undefined });
    return detected === swapType;
  }

  private isNativeL1Swap(sellEcosystem: BlockchainEcosystem, buyEcosystem: BlockchainEcosystem): boolean {
    const nativeL1Ecosystems = [
      BlockchainEcosystem.BITCOIN,
      BlockchainEcosystem.THORCHAIN,
      BlockchainEcosystem.MAYA,
      BlockchainEcosystem.COSMOS
    ];

    return nativeL1Ecosystems.includes(sellEcosystem) || nativeL1Ecosystems.includes(buyEcosystem);
  }

  private determineEvmSwapType(sellChainId: number, buyChainId: number): SwapType {
    const l1Chains = [1, 56, 137]; // Ethereum, BSC, Polygon (mainnet L1s)
    const l2Chains = [10, 42161, 8453, 324]; // Optimism, Arbitrum, Base, zkSync

    const sellIsL1 = l1Chains.includes(sellChainId);
    const buyIsL1 = l1Chains.includes(buyChainId);
    const sellIsL2 = l2Chains.includes(sellChainId);
    const buyIsL2 = l2Chains.includes(buyChainId);

    if (sellIsL1 && buyIsL2) return SwapType.L1_TO_L2;
    if (sellIsL2 && buyIsL1) return SwapType.L2_TO_L1;
    if (sellIsL2 && buyIsL2) return SwapType.L2_TO_L2;
    
    return SwapType.CROSS_CHAIN; // Default for unrecognized EVM chains
  }

  private getOnChainProviderCategory(request: UniversalSwapRequestDto): 'evm-aggregators' | 'solana' {
    const ecosystem = request.sellToken.chain.ecosystem;
    
    switch (ecosystem) {
      case BlockchainEcosystem.EVM:
      case BlockchainEcosystem.AVALANCHE:
        return 'evm-aggregators';
      
      case BlockchainEcosystem.SOLANA:
        return 'solana';
      
      default:
        throw new BadRequestException(`On-chain swaps not supported for ecosystem: ${ecosystem}`);
    }
  }

  private getEvmAggregators(request: UniversalSwapRequestDto): string[] {
    const chainId = request.sellToken.chain.chainId as number;
    
    // Return available providers based on chain
    const baseProviders = ['0x', 'odos']; // Currently implemented
    const plannedProviders = ['uniswap']; // Placeholder for future

    // Chain-specific optimizations
    switch (chainId) {
      case 1: // Ethereum
        return ['0x', 'odos', ...plannedProviders];
      case 137: // Polygon
        return ['odos', '0x', ...plannedProviders];
      case 56: // BSC
        return ['0x', 'odos', ...plannedProviders];
      default:
        return baseProviders;
    }
  }

  private getMetaAggregators(request: UniversalSwapRequestDto): string[] {
    return ['lifi']; // Currently implemented
    // Planned: ['lifi', 'socket', 'rango', 'router']
  }

  private getNativeL1Providers(request: UniversalSwapRequestDto): string[] {
    return ['thorchain']; // Currently implemented
    // Planned: ['thorchain', 'maya', 'swapkit']
  }

  private getSolanaProviders(request: UniversalSwapRequestDto): string[] {
    return ['jupiter']; // Currently implemented
    // Planned: ['jupiter', 'orca', 'raydium']
  }

  private isSupportedEcosystem(ecosystem: BlockchainEcosystem): boolean {
    const supportedEcosystems = [
      BlockchainEcosystem.EVM,
      BlockchainEcosystem.SOLANA,
      BlockchainEcosystem.COSMOS,
      BlockchainEcosystem.BITCOIN,
      BlockchainEcosystem.THORCHAIN,
      BlockchainEcosystem.MAYA,
    ];
    
    return supportedEcosystems.includes(ecosystem);
  }

  private isChainSupported(chain: any): boolean {
    // Generalized: check cache first, then fallback to provider's supportsChain
    if (!chain || !chain.chainId) return false;
    const chainId = Number(chain.chainId);

    // 1. For validation, we check if the chain itself is supported
    // Cache check is done per token, so we check if any token on this chain is cached
    // This is a lightweight check - if cache has any tokens for this chain, chain is supported
    
    // 2. Fallback: check all known providers for supportsChain
    if (this.providerRegistry && Array.isArray(this.providerRegistry) && this.providerRegistry.length > 0) {
      for (const provider of this.providerRegistry) {
        if (provider && typeof provider.supportsChain === 'function') {
          const supported = provider.supportsChain(chainId);
          if (supported) {
            return true;
          }
        }
      }
      // If we have providers but none support this chain, return false
      return false;
    }

    // 3. Default fallback: if no providers registered yet, return true to allow bootstrapping
    // This allows initial requests to go through and populate the cache
    return true;
  }

  /**
   * Call this after a successful quote to cache supported chain/token pairs
   */
  cacheSupportedQuote(chainId: number, buyToken: string, sellToken: string) {
    this.swapCacheService.addSupportedQuote(chainId, buyToken, sellToken);
  }
  

  private estimateCrossChainSteps(request: UniversalSwapRequestDto): number {
    const sellEcosystem = request.sellToken.chain.ecosystem;
    const buyEcosystem = request.buyToken.chain.ecosystem;

    // Same ecosystem cross-chain (e.g., Ethereum to Polygon)
    if (sellEcosystem === buyEcosystem) {
      return 2; // Bridge + optional swap
    }

    // Different ecosystems (e.g., Ethereum to Solana)
    return 3; // Swap to bridge token + bridge + swap to target token
  }
}