import { Injectable, Logger } from '@nestjs/common';
import { 
  IOnchainAggregator, 
  IMetaAggregator, 
  ISolanaRouter, 
  INativeRouter,
  SwapRequest,
  SwapQuote,
  RouteRequest,
  RouteQuote,
  TransactionBuild,
  ProviderHealth,
  IProvider
} from '@swap/models/ports';
import { ZeroXService } from '@swap/services/providers/evm-aggregators/zero-x.service';
import { OneInchService } from '@swap/services/providers/evm-aggregators/oneinch.service';
import { LiFiService } from '@swap/services/providers/meta/lifi.service';
import { JupiterService } from '@swap/services/providers/solana/jupiter.service';
import { ThorChainService } from '@swap/services/providers/native-l1/thorchain.service';
import { ApprovalStrategy } from '@swap/models/swap-request.model';

/**
 * Enhanced aggregator manager that orchestrates multiple provider types
 * Uses the provider ports pattern for loose coupling
 */
@Injectable()
export class EnhancedAggregatorManagerService {
  private readonly logger = new Logger(EnhancedAggregatorManagerService.name);
  
  // Provider registries by type
  private readonly evmAggregators: Map<string, IOnchainAggregator> = new Map();
  private readonly metaAggregators: Map<string, IMetaAggregator> = new Map();
  private readonly solanaRouters: Map<string, ISolanaRouter> = new Map();
  private readonly nativeRouters: Map<string, INativeRouter> = new Map();
  
  // Provider health cache
  private readonly healthCache: Map<string, ProviderHealth> = new Map();
  private readonly healthCacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly zeroXService: ZeroXService,
    private readonly oneInchService: OneInchService,
    private readonly lifiService: LiFiService,
    private readonly jupiterService: JupiterService,
    private readonly thorChainService: ThorChainService,
  ) {
    this.initializeProviders();
  }

  /**
   * Initialize all providers in their respective registries
   */
  private initializeProviders(): void {
    // Register EVM aggregators
    this.evmAggregators.set(this.zeroXService.getProviderName(), this.zeroXService);
    this.evmAggregators.set(this.oneInchService.getProviderName(), this.oneInchService);

    // Register meta aggregators
    this.metaAggregators.set(this.lifiService.getProviderName(), this.lifiService);

    // Register Solana routers
    this.solanaRouters.set(this.jupiterService.getProviderName(), this.jupiterService);

    // Register native L1 routers
    this.nativeRouters.set(this.thorChainService.getProviderName(), this.thorChainService);

    this.logger.log(`Initialized providers: EVM(${this.evmAggregators.size}), Meta(${this.metaAggregators.size}), Solana(${this.solanaRouters.size}), Native(${this.nativeRouters.size})`);
  }

  /**
   * Get EVM swap quote using best available aggregator
   */
  async getEvmQuote(request: SwapRequest, preferredProvider?: string): Promise<SwapQuote> {
    const providers = await this.getHealthyEvmProviders(request.chainId);
    
    if (providers.length === 0) {
      throw new Error(`No healthy EVM aggregators available for chain ${request.chainId}`);
    }

    // Use preferred provider if specified and healthy
    if (preferredProvider && providers.some(p => p.getProviderName() === preferredProvider)) {
      const provider = providers.find(p => p.getProviderName() === preferredProvider);
      return provider!.getQuote(request);
    }

    // Try providers in order of health/preference
    let lastError: Error | null = null;
    for (const provider of providers) {
      try {
        this.logger.debug(`Attempting quote from ${provider.getProviderName()}`);
        return await provider.getQuote(request);
      } catch (error) {
        this.logger.warn(`Provider ${provider.getProviderName()} failed: ${error.message}`);
        lastError = error as Error;
        continue;
      }
    }

    throw new Error(`All EVM aggregators failed. Last error: ${lastError?.message}`);
  }

  /**
   * Get cross-chain routes using meta aggregators
   */
  async getCrossChainRoutes(request: RouteRequest, preferredProvider?: string): Promise<RouteQuote[]> {
    const providers = await this.getHealthyMetaProviders();
    
    if (providers.length === 0) {
      throw new Error('No healthy meta aggregators available');
    }

    // Use preferred provider if specified and healthy
    if (preferredProvider && providers.some(p => p.getProviderName() === preferredProvider)) {
      const provider = providers.find(p => p.getProviderName() === preferredProvider);
      return provider!.getRoutes(request);
    }

    // Aggregate routes from all providers
    const allRoutes: RouteQuote[] = [];
    const results = await Promise.allSettled(
      providers.map(provider => provider.getRoutes(request))
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allRoutes.push(...result.value);
      } else {
        this.logger.warn(`Meta aggregator ${providers[index].getProviderName()} failed: ${result.reason.message}`);
      }
    });

    // Sort by confidence and estimated output
    return allRoutes.sort((a, b) => {
      const confidenceDiff = (b.confidence || 0) - (a.confidence || 0);
      if (Math.abs(confidenceDiff) > 0.1) return confidenceDiff;
      
      return parseFloat(b.totalEstimatedOut) - parseFloat(a.totalEstimatedOut);
    });
  }

  /**
   * Get Solana swap quote
   */
  async getSolanaQuote(request: any, preferredProvider?: string): Promise<RouteQuote> {
    const providers = await this.getHealthySolanaProviders();
    
    if (providers.length === 0) {
      throw new Error('No healthy Solana routers available');
    }

    // Use preferred provider if specified and healthy
    if (preferredProvider && providers.some(p => p.getProviderName() === preferredProvider)) {
      const provider = providers.find(p => p.getProviderName() === preferredProvider);
      return provider!.quote(request);
    }

    // Try providers in order
    let lastError: Error | null = null;
    for (const provider of providers) {
      try {
        this.logger.debug(`Attempting Solana quote from ${provider.getProviderName()}`);
        return await provider.quote(request);
      } catch (error) {
        this.logger.warn(`Solana provider ${provider.getProviderName()} failed: ${error.message}`);
        lastError = error as Error;
        continue;
      }
    }

    throw new Error(`All Solana routers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Get native L1 quote (e.g., Bitcoin to EVM)
   */
  async getNativeQuote(request: any, preferredProvider?: string): Promise<RouteQuote> {
    const providers = await this.getHealthyNativeProviders(request.toChainId);
    
    if (providers.length === 0) {
      throw new Error(`No healthy native routers available for destination chain ${request.toChainId}`);
    }

    // Use preferred provider if specified and healthy
    if (preferredProvider && providers.some(p => p.getProviderName() === preferredProvider)) {
      const provider = providers.find(p => p.getProviderName() === preferredProvider);
      return provider!.quoteBtc(request);
    }

    // Try providers in order
    let lastError: Error | null = null;
    for (const provider of providers) {
      try {
        this.logger.debug(`Attempting native quote from ${provider.getProviderName()}`);
        return await provider.quoteBtc(request);
      } catch (error) {
        this.logger.warn(`Native provider ${provider.getProviderName()} failed: ${error.message}`);
        lastError = error as Error;
        continue;
      }
    }

    throw new Error(`All native routers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Build transaction for EVM swap
   */
  async buildEvmTransaction(request: SwapRequest, preferredProvider?: string): Promise<TransactionBuild> {
    const providers = await this.getHealthyEvmProviders(request.chainId);
    
    if (providers.length === 0) {
      throw new Error(`No healthy EVM aggregators available for chain ${request.chainId}`);
    }

    const provider = preferredProvider 
      ? providers.find(p => p.getProviderName() === preferredProvider) || providers[0]
      : providers[0];

    return provider.buildTx(request);
  }

  /**
   * Get spender address for approvals
   */
  async getSpenderAddress(chainId: number, strategy: ApprovalStrategy = ApprovalStrategy.ALLOWANCE_HOLDER, providerName?: string): Promise<string> {
    const providers = await this.getHealthyEvmProviders(chainId);
    
    if (providers.length === 0) {
      throw new Error(`No healthy EVM aggregators available for chain ${chainId}`);
    }

    // Prioritize 0x for strategy-specific spender addresses
    const zeroXProvider = providers.find(p => p.getProviderName() === '0x');
    if (zeroXProvider && 'getSpenderAddress' in zeroXProvider) {
      return (zeroXProvider as any).getSpenderAddress(chainId, strategy);
    }

    // Fallback to other providers
    const provider = providerName 
      ? providers.find(p => p.getProviderName() === providerName) || providers[0]
      : providers[0];

    if ('getSpenderAddress' in provider) {
      return (provider as any).getSpenderAddress(chainId);
    }

    throw new Error('No provider supports spender address retrieval');
  }

  /**
   * Get comprehensive health status of all providers
   */
  async getProvidersHealth(): Promise<Record<string, ProviderHealth[]>> {
    const health: Record<string, ProviderHealth[]> = {
      evm: [],
      meta: [],
      solana: [],
      native: [],
    };

    // Check EVM providers
    for (const provider of this.evmAggregators.values()) {
      health.evm.push(await this.getProviderHealth(provider));
    }

    // Check meta providers
    for (const provider of this.metaAggregators.values()) {
      health.meta.push(await this.getProviderHealth(provider));
    }

    // Check Solana providers
    for (const provider of this.solanaRouters.values()) {
      health.solana.push(await this.getProviderHealth(provider));
    }

    // Check native providers
    for (const provider of this.nativeRouters.values()) {
      health.native.push(await this.getProviderHealth(provider));
    }

    return health;
  }

  /**
   * Get healthy EVM providers for a specific chain
   */
  private async getHealthyEvmProviders(chainId: number): Promise<IOnchainAggregator[]> {
    const healthyProviders: IOnchainAggregator[] = [];
    
    for (const provider of this.evmAggregators.values()) {
      if (provider.supportsChain(chainId)) {
        const health = await this.getProviderHealth(provider);
        if (health.status === 'healthy') {
          healthyProviders.push(provider);
        }
      }
    }

    // Sort by latency (ascending)
    return healthyProviders.sort((a, b) => {
      const healthA = this.healthCache.get(a.getProviderName());
      const healthB = this.healthCache.get(b.getProviderName());
      return (healthA?.latency || 1000) - (healthB?.latency || 1000);
    });
  }

  /**
   * Get healthy meta aggregators
   */
  private async getHealthyMetaProviders(): Promise<IMetaAggregator[]> {
    const healthyProviders: IMetaAggregator[] = [];
    
    for (const provider of this.metaAggregators.values()) {
      const health = await this.getProviderHealth(provider);
      if (health.status === 'healthy') {
        healthyProviders.push(provider);
      }
    }

    return healthyProviders;
  }

  /**
   * Get healthy Solana routers
   */
  private async getHealthySolanaProviders(): Promise<ISolanaRouter[]> {
    const healthyProviders: ISolanaRouter[] = [];
    
    for (const provider of this.solanaRouters.values()) {
      const health = await this.getProviderHealth(provider);
      if (health.status === 'healthy') {
        healthyProviders.push(provider);
      }
    }

    return healthyProviders;
  }

  /**
   * Get healthy native L1 routers for a destination chain
   */
  private async getHealthyNativeProviders(destinationChainId?: number): Promise<INativeRouter[]> {
    const healthyProviders: INativeRouter[] = [];
    
    for (const provider of this.nativeRouters.values()) {
      if (!destinationChainId || provider.getSupportedDestinations().includes(destinationChainId)) {
        const health = await this.getProviderHealth(provider);
        if (health.status === 'healthy') {
          healthyProviders.push(provider);
        }
      }
    }

    return healthyProviders;
  }

  /**
   * Get provider health with caching
   */
  private async getProviderHealth(provider: IProvider): Promise<ProviderHealth> {
    const name = provider.getProviderName();
    const cached = this.healthCache.get(name);
    
    if (cached && (Date.now() - cached.lastCheck.getTime()) < this.healthCacheTimeout) {
      return cached;
    }

    try {
      const health = await provider.healthCheck();
      this.healthCache.set(name, health);
      return health;
    } catch (error) {
      const failedHealth: ProviderHealth = {
        name,
        status: 'unhealthy',
        lastCheck: new Date(),
        errorRate: 1,
      };
      this.healthCache.set(name, failedHealth);
      return failedHealth;
    }
  }

  /**
   * Get supported chains for EVM aggregators
   */
  getSupportedChains(): number[] {
    const chains = new Set<number>();
    
    for (const provider of this.evmAggregators.values()) {
      // Common chains to check
      const commonChains = [1, 10, 56, 137, 42161, 43114, 8453, 324, 59144];
      commonChains.forEach(chainId => {
        if (provider.supportsChain(chainId)) {
          chains.add(chainId);
        }
      });
    }

    return Array.from(chains).sort();
  }

  /**
   * Get provider configurations
   */
  getProviderConfigs(): Record<string, any> {
    const configs: Record<string, any> = {};

    for (const provider of this.evmAggregators.values()) {
      configs[`evm_${provider.getProviderName()}`] = provider.getConfig();
    }

    for (const provider of this.metaAggregators.values()) {
      configs[`meta_${provider.getProviderName()}`] = provider.getConfig();
    }

    for (const provider of this.solanaRouters.values()) {
      configs[`solana_${provider.getProviderName()}`] = provider.getConfig();
    }

    for (const provider of this.nativeRouters.values()) {
      configs[`native_${provider.getProviderName()}`] = provider.getConfig();
    }

    return configs;
  }
}