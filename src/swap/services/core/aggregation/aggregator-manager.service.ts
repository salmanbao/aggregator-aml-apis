import { Injectable, Logger } from '@nestjs/common';
import { SwapRequest, SwapQuote, AggregatorType, ApprovalStrategy } from '@swap/models/swap-request.model';
import { 
  IOnchainAggregator, 
  IMetaAggregator, 
  ISolanaRouter, 
  INativeRouter,
  RouteRequest,
  RouteQuote,
  TransactionBuild,
  ProviderHealth,
  IProvider
} from '@swap/models/ports';
import { SwapQuote as PortsSwapQuote, SwapRequest as PortsSwapRequest } from '@swap/models/ports';
import { IAggregatorRegistry, ProviderCategory } from './aggregator-registry.interface';

/**
 * Unified aggregator manager service that coordinates with multiple provider types
 * Supports legacy EVM aggregators (0x Protocol, Odos) with backward compatibility
 * Enhanced with multi-provider architecture: Meta aggregators, Solana routers, Native L1 routers
 * Uses provider ports pattern for loose coupling while maintaining legacy API compatibility
 * 
 * NOW WITH SELF-REGISTRATION: Providers register themselves automatically via IAggregatorRegistry
 */
@Injectable()
export class AggregatorManagerService implements IAggregatorRegistry {
  private readonly logger = new Logger(AggregatorManagerService.name);
  
  // Legacy aggregator registry for backward compatibility
  private readonly aggregators: Map<AggregatorType, any> = new Map();
  
  // Enhanced provider registries by type
  private readonly evmAggregators: Map<string, IOnchainAggregator> = new Map();
  private readonly metaAggregators: Map<string, IMetaAggregator> = new Map();
  private readonly solanaRouters: Map<string, ISolanaRouter> = new Map();
  private readonly nativeRouters: Map<string, INativeRouter> = new Map();
  
  // Provider health cache
  private readonly healthCache: Map<string, ProviderHealth> = new Map();
  private readonly healthCacheTimeout = 5 * 60 * 1000; // 5 minutes
  
  // Track registration stats
  private registrationComplete = false;

  constructor() {
    this.logger.log('🚀 AggregatorManagerService initialized - awaiting provider self-registration');
  }

  // ============================================================================
  // SELF-REGISTRATION API (IAggregatorRegistry implementation)
  // ============================================================================

  /**
   * Register an EVM aggregator (called by providers themselves)
   */
  registerEvmAggregator(provider: IOnchainAggregator): void {
    const name = provider.getProviderName();
    
    if (this.evmAggregators.has(name)) {
      this.logger.warn(`⚠️ EVM aggregator '${name}' already registered, skipping duplicate`);
      return;
    }
    
    this.evmAggregators.set(name, provider);
    
    // Also register in legacy map if it's 0x or Odos
    this.registerInLegacyMap(name, provider);
    
    this.logger.log(`✅ Self-registered EVM aggregator: ${name}`);
  }

  /**
   * Register a meta aggregator (called by providers themselves)
   */
  registerMetaAggregator(provider: IMetaAggregator): void {
    const name = provider.getProviderName();
    
    if (this.metaAggregators.has(name)) {
      this.logger.warn(`⚠️ Meta aggregator '${name}' already registered, skipping duplicate`);
      return;
    }
    
    this.metaAggregators.set(name, provider);
    this.logger.log(`✅ Self-registered Meta aggregator: ${name}`);
  }

  /**
   * Register a Solana router (called by providers themselves)
   */
  registerSolanaRouter(provider: ISolanaRouter): void {
    const name = provider.getProviderName();
    
    if (this.solanaRouters.has(name)) {
      this.logger.warn(`⚠️ Solana router '${name}' already registered, skipping duplicate`);
      return;
    }
    
    this.solanaRouters.set(name, provider);
    this.logger.log(`✅ Self-registered Solana router: ${name}`);
  }

  /**
   * Register a native L1 router (called by providers themselves)
   */
  registerNativeRouter(provider: INativeRouter): void {
    const name = provider.getProviderName();
    
    if (this.nativeRouters.has(name)) {
      this.logger.warn(`⚠️ Native router '${name}' already registered, skipping duplicate`);
      return;
    }
    
    this.nativeRouters.set(name, provider);
    this.logger.log(`✅ Self-registered Native router: ${name}`);
  }

  /**
   * Generic registration method (auto-detects category)
   */
  registerProvider(provider: any, category: ProviderCategory): void {
    switch (category) {
      case ProviderCategory.EVM_AGGREGATOR:
        this.registerEvmAggregator(provider);
        break;
      case ProviderCategory.META_AGGREGATOR:
        this.registerMetaAggregator(provider);
        break;
      case ProviderCategory.SOLANA_ROUTER:
        this.registerSolanaRouter(provider);
        break;
      case ProviderCategory.NATIVE_ROUTER:
        this.registerNativeRouter(provider);
        break;
      default:
        this.logger.error(`Unknown provider category: ${category}`);
    }
  }

  /**
   * Mark registration as complete and log summary
   */
  onRegistrationComplete(): void {
    if (this.registrationComplete) return;
    
    this.registrationComplete = true;
    this.logger.log(
      `📊 Provider registration complete - ` +
      `Legacy(${this.aggregators.size}), ` +
      `EVM(${this.evmAggregators.size}), ` +
      `Meta(${this.metaAggregators.size}), ` +
      `Solana(${this.solanaRouters.size}), ` +
      `Native(${this.nativeRouters.size})`
    );
    
    // Log registered providers
    if (this.evmAggregators.size > 0) {
      this.logger.log(`  📍 EVM Aggregators: ${Array.from(this.evmAggregators.keys()).join(', ')}`);
    }
    if (this.metaAggregators.size > 0) {
      this.logger.log(`  🌉 Meta Aggregators: ${Array.from(this.metaAggregators.keys()).join(', ')}`);
    }
    if (this.solanaRouters.size > 0) {
      this.logger.log(`  ☀️ Solana Routers: ${Array.from(this.solanaRouters.keys()).join(', ')}`);
    }
    if (this.nativeRouters.size > 0) {
      this.logger.log(`  ⛰️ Native Routers: ${Array.from(this.nativeRouters.keys()).join(', ')}`);
    }
  }

  /**
   * Register provider in legacy map for backward compatibility
   */
  private registerInLegacyMap(name: string, provider: any): void {
    const lowerName = name.toLowerCase();
    
    if (lowerName === '0x') {
      this.aggregators.set(AggregatorType.ZEROX, provider);
      this.logger.debug(`  ↳ Also registered in legacy map as ZEROX`);
    } else if (lowerName === 'odos') {
      this.aggregators.set(AggregatorType.ODOS, provider);
      this.logger.debug(`  ↳ Also registered in legacy map as ODOS`);
    }
  }

  // ============================================================================
  // TYPE CONVERSION UTILITIES
  // ============================================================================

  /**
   * Convert legacy SwapRequest to ports SwapRequest
   */
  private convertToPortsRequest(request: SwapRequest): PortsSwapRequest {
    return {
      ...request,
      aggregator: request.aggregator || 'default'
    };
  }

  /**
   * Convert ports SwapQuote to legacy SwapQuote
   */
  private convertToLegacyQuote(quote: PortsSwapQuote, providerName: string): SwapQuote {
    // Map provider name to AggregatorType
    let aggregatorType: AggregatorType;
    switch (providerName.toLowerCase()) {
      case '0x':
        aggregatorType = AggregatorType.ZEROX;
        break;
      case 'odos':
        aggregatorType = AggregatorType.ODOS;
        break;
      default:
        aggregatorType = AggregatorType.ZEROX; // Default fallback
    }

    return {
      ...quote,
      aggregator: aggregatorType
    };
  }

  /**
   * Get quote from specified aggregator (defaults to 0x for backward compatibility)
   * Enhanced version with dynamic provider selection based on chain support and health
   */
  async getQuote(request: SwapRequest, aggregatorType?: AggregatorType, strictValidation?: boolean): Promise<SwapQuote> {
    // If aggregatorType is specified, try to honor the preference but fallback intelligently
    if (aggregatorType) {
      const providerName = this.mapAggregatorTypeToProviderName(aggregatorType);
      
      try {
        // Try preferred provider first (with health monitoring)
        return await this.getEvmQuote(request, providerName);
      } catch (enhancedError) {
        this.logger.warn(`Preferred provider ${aggregatorType} failed, using dynamic selection: ${enhancedError.message}`);
        
        // Fallback to dynamic selection if preferred provider fails
        return await this.getDynamicQuote(request, strictValidation);
      }
    }
    
    // No aggregator specified - use fully dynamic selection
    return await this.getDynamicQuote(request, strictValidation);
  }

  /**
   * Get price from specified aggregator (defaults to 0x for backward compatibility)
   * Enhanced version with dynamic provider selection
   */
  async getPrice(request: SwapRequest, aggregatorType?: AggregatorType, approvalStrategy?: ApprovalStrategy): Promise<any> {
    // If aggregatorType is specified, try to honor preference but fallback intelligently
    if (aggregatorType) {
      const providerName = this.mapAggregatorTypeToProviderName(aggregatorType);
      
      try {
        // Try preferred provider first
        const quote = await this.getEvmQuote(request, providerName);
        return this.convertQuoteToPrice(quote);
      } catch (enhancedError) {
        this.logger.warn(`Preferred provider ${aggregatorType} failed for price, using dynamic selection: ${enhancedError.message}`);
        
        // Fallback to dynamic selection
        const quote = await this.getDynamicQuote(request);
        return this.convertQuoteToPrice(quote);
      }
    }
    
    // No aggregator specified - use fully dynamic selection
    const quote = await this.getDynamicQuote(request);
    return this.convertQuoteToPrice(quote);
  }

  /**
   * Dynamic quote selection - chooses best provider at runtime based on:
   * 1. Chain support
   * 2. Provider health
   * 3. Historical performance (latency)
   * 4. Provider-specific optimizations
   */
  private async getDynamicQuote(request: SwapRequest, strictValidation?: boolean): Promise<SwapQuote> {
    // Get all providers that support this chain
    const supportedProviders = await this.getProvidersForChain(request.chainId);
    
    if (supportedProviders.length === 0) {
      throw new Error(`No providers support chain ${request.chainId}. Supported chains: ${this.getAllSupportedChains().join(', ')}`);
    }

    // Filter to only healthy providers
    const healthyProviders = await this.filterHealthyProviders(supportedProviders);
    
    if (healthyProviders.length === 0) {
      this.logger.warn(`No healthy providers for chain ${request.chainId}, attempting with all providers as fallback`);
      // Fallback: try all providers even if health check failed
      return await this.tryProvidersWithFallback(supportedProviders, request, strictValidation);
    }

    // Sort providers by performance and suitability
    const rankedProviders = await this.rankProvidersByPerformance(healthyProviders, request);
    
    this.logger.debug(`Dynamic provider selection for chain ${request.chainId}: ${rankedProviders.map(p => p.provider.getProviderName()).join(' > ')}`);

    // Try providers in ranked order
    return await this.tryProvidersInOrder(rankedProviders.map(p => p.provider), request, strictValidation);
  }

  /**
   * Get all providers that support a specific chain
   */
  private async getProvidersForChain(chainId: number): Promise<IOnchainAggregator[]> {
    const supportedProviders: IOnchainAggregator[] = [];
    
    for (const provider of this.evmAggregators.values()) {
      if (provider.supportsChain(chainId)) {
        supportedProviders.push(provider);
      }
    }

    return supportedProviders;
  }

  /**
   * Filter providers to only include healthy ones
   */
  private async filterHealthyProviders(providers: IOnchainAggregator[]): Promise<IOnchainAggregator[]> {
    const healthyProviders: IOnchainAggregator[] = [];
    
    for (const provider of providers) {
      const health = await this.getProviderHealth(provider);
      if (health.status === 'healthy') {
        healthyProviders.push(provider);
      } else {
        this.logger.debug(`Provider ${provider.getProviderName()} is unhealthy: ${health.status}`);
      }
    }

    return healthyProviders;
  }

  /**
   * Rank providers by performance and suitability for the request
   */
  private async rankProvidersByPerformance(
    providers: IOnchainAggregator[], 
    request: SwapRequest
  ): Promise<Array<{ provider: IOnchainAggregator; score: number; reason: string }>> {
    const ranked: Array<{ provider: IOnchainAggregator; score: number; reason: string }> = [];
    
    for (const provider of providers) {
      const score = await this.calculateProviderScore(provider, request);
      const reason = this.getProviderScoreReason(provider, request, score);
      ranked.push({ provider, score, reason });
    }

    // Sort by score (higher is better)
    ranked.sort((a, b) => b.score - a.score);
    
    // Log ranking for debugging
    ranked.forEach((item, index) => {
      this.logger.debug(`Rank ${index + 1}: ${item.provider.getProviderName()} (score: ${item.score}) - ${item.reason}`);
    });

    return ranked;
  }

  /**
   * Calculate performance score for a provider
   */
  private async calculateProviderScore(provider: IOnchainAggregator, request: SwapRequest): Promise<number> {
    let score = 100; // Base score
    
    // Health bonus
    const health = await this.getProviderHealth(provider);
    if (health.status === 'healthy') {
      score += 50;
      
      // Latency bonus (lower latency = higher score)
      if (health.latency) {
        const latencyBonus = Math.max(0, 100 - health.latency); // 100ms = 0 bonus, 0ms = 100 bonus
        score += latencyBonus;
      }
      
      // Error rate penalty
      if (health.errorRate !== undefined) {
        const errorPenalty = health.errorRate * 100; // 0.1 error rate = 10 point penalty
        score -= errorPenalty;
      }
    } else {
      score -= 100; // Heavy penalty for unhealthy providers
    }

    // Provider-specific bonuses
    const providerName = provider.getProviderName().toLowerCase();
    
    // Chain-specific optimizations
    if (request.chainId === 1) { // Ethereum Mainnet
      if (providerName === '0x') score += 20; // 0x is typically well-optimized for Ethereum
    } else if (request.chainId === 137) { // Polygon
      if (providerName === 'odos') score += 15; // Odos might have better Polygon support
    }

    // Trade size considerations
    if (request.sellAmount) {
      const amount = parseFloat(request.sellAmount);
      if (amount > 1e21) { // Large trades (>1000 tokens assuming 18 decimals)
        if (providerName === '0x') score += 10; // 0x might handle large trades better
      }
    }

    // Feature-specific bonuses
    if (request.approvalStrategy === ApprovalStrategy.PERMIT2) {
      if (providerName === '0x') score += 25; // 0x has better permit2 support
    }

    return Math.max(0, score); // Ensure non-negative score
  }

  /**
   * Get human-readable reason for provider score
   */
  private getProviderScoreReason(provider: IOnchainAggregator, request: SwapRequest, score: number): string {
    const providerName = provider.getProviderName();
    const reasons: string[] = [];
    
    if (score >= 150) reasons.push('excellent health & performance');
    else if (score >= 120) reasons.push('good health & performance');
    else if (score >= 100) reasons.push('healthy');
    else if (score >= 50) reasons.push('degraded performance');
    else reasons.push('poor health');

    // Add specific reasons
    if (request.chainId === 1 && providerName.toLowerCase() === '0x') {
      reasons.push('optimized for Ethereum');
    }
    if (request.approvalStrategy === ApprovalStrategy.PERMIT2 && providerName.toLowerCase() === '0x') {
      reasons.push('permit2 support');
    }

    return reasons.join(', ');
  }

  /**
   * Try providers in order until one succeeds
   */
  private async tryProvidersInOrder(
    providers: IOnchainAggregator[], 
    request: SwapRequest, 
    strictValidation?: boolean
  ): Promise<SwapQuote> {
    const portsRequest = this.convertToPortsRequest(request);
    let lastError: Error | null = null;

    for (const provider of providers) {
      try {
        this.logger.debug(`Attempting dynamic quote from ${provider.getProviderName()}`);
        const quote = await provider.getQuote(portsRequest);
        const legacyQuote = this.convertToLegacyQuote(quote, provider.getProviderName());
        
        this.logger.log(`✅ Dynamic selection chose ${provider.getProviderName()} for chain ${request.chainId}`);
        return legacyQuote;
      } catch (error) {
        this.logger.warn(`❌ Provider ${provider.getProviderName()} failed: ${error.message}`);
        lastError = error as Error;
        continue;
      }
    }

    throw new Error(`All providers failed for chain ${request.chainId}. Last error: ${lastError?.message}`);
  }

  /**
   * Try providers with intelligent fallback (including unhealthy ones as last resort)
   */
  private async tryProvidersWithFallback(
    providers: IOnchainAggregator[], 
    request: SwapRequest, 
    strictValidation?: boolean
  ): Promise<SwapQuote> {
    const portsRequest = this.convertToPortsRequest(request);
    let lastError: Error | null = null;

    for (const provider of providers) {
      try {
        this.logger.debug(`Attempting fallback quote from ${provider.getProviderName()}`);
        const quote = await provider.getQuote(portsRequest);
        const legacyQuote = this.convertToLegacyQuote(quote, provider.getProviderName());
        
        this.logger.log(`✅ Fallback selection chose ${provider.getProviderName()} for chain ${request.chainId}`);
        return legacyQuote;
      } catch (error) {
        this.logger.warn(`❌ Fallback provider ${provider.getProviderName()} failed: ${error.message}`);
        lastError = error as Error;
        continue;
      }
    }

    throw new Error(`All providers (including fallback) failed for chain ${request.chainId}. Last error: ${lastError?.message}`);
  }

  /**
   * Get all supported chains across all providers
   */
  private getAllSupportedChains(): number[] {
    const chains = new Set<number>();
    
    for (const provider of this.evmAggregators.values()) {
      // Common chains to check (could be expanded)
      const commonChains = [1, 10, 56, 137, 42161, 43114, 8453, 324, 59144, 100, 250, 1284, 1285];
      commonChains.forEach(chainId => {
        if (provider.supportsChain(chainId)) {
          chains.add(chainId);
        }
      });
    }

    return Array.from(chains).sort();
  }

  /**
   * Legacy quote method (original implementation)
   */
  private async getLegacyQuote(request: SwapRequest, aggregatorType: AggregatorType, strictValidation?: boolean): Promise<SwapQuote> {
    // Validate aggregator is supported
    if (!this.aggregators.has(aggregatorType)) {
      throw new Error(`Unsupported aggregator: ${aggregatorType}`);
    }

    this.logger.debug(`Getting legacy quote from ${aggregatorType} for chain ${request.chainId}${strictValidation === false ? ' (relaxed validation)' : ''}`);
    return this.getQuoteFromAggregator(request, aggregatorType, strictValidation);
  }

  /**
   * Legacy price method (original implementation)
   */
  private async getLegacyPrice(request: SwapRequest, aggregatorType: AggregatorType, approvalStrategy?: ApprovalStrategy): Promise<any> {
    // Validate aggregator is supported
    if (!this.aggregators.has(aggregatorType)) {
      throw new Error(`Unsupported aggregator: ${aggregatorType}`);
    }

    this.logger.debug(`Getting legacy price from ${aggregatorType} for chain ${request.chainId}`);
    return this.getPriceFromAggregator(request, aggregatorType, approvalStrategy);
  }

  /**
   * Map AggregatorType enum to provider name string
   */
  private mapAggregatorTypeToProviderName(aggregatorType: AggregatorType): string {
    switch (aggregatorType) {
      case AggregatorType.ZEROX:
        return '0x';
      case AggregatorType.ODOS:
        return 'odos';
      default:
        return '0x'; // Default fallback
    }
  }

  /**
   * Convert SwapQuote to price-like response
   */
  private convertQuoteToPrice(quote: SwapQuote): any {
    return {
      sellToken: quote.sellToken,
      buyToken: quote.buyToken,
      sellAmount: quote.sellAmount,
      buyAmount: quote.buyAmount,
      price: quote.buyAmount && quote.sellAmount 
        ? (parseFloat(quote.buyAmount) / parseFloat(quote.sellAmount)).toString()
        : '0',
      priceImpact: quote.priceImpact,
      sources: [], // Could be populated from aggregator data
      allowanceTarget: quote.allowanceTarget,
      aggregator: quote.aggregator,
      approvalStrategy: quote.approvalStrategy,
    };
  }

  /**
   * Get quote from specific aggregator
   */
  private async getQuoteFromAggregator(
    request: SwapRequest,
    aggregatorType: AggregatorType,
    strictValidation?: boolean,
  ): Promise<SwapQuote> {
    const aggregator = this.aggregators.get(aggregatorType);
    if (!aggregator) {
      throw new Error(`Unsupported aggregator: ${aggregatorType}`);
    }

    if (!aggregator.supportsChain(request.chainId)) {
      throw new Error(`Aggregator ${aggregatorType} does not support chain ${request.chainId}`);
    }

    // Handle 0x Protocol specific strategy methods
    if (aggregatorType === AggregatorType.ZEROX) {
      if (request.approvalStrategy === ApprovalStrategy.ALLOWANCE_HOLDER) {
        return aggregator.getAllowanceHolderQuote(request);
      } else if (request.approvalStrategy === ApprovalStrategy.PERMIT2) {
        return aggregator.getPermit2Quote(request);
      } else {
        // Default to allowance holder for backwards compatibility, pass strictValidation
        return aggregator.getQuote(request, strictValidation);
      }
    } else {
      // For other aggregators (like Odos), use standard getQuote method with strictValidation
      return aggregator.getQuote(request, strictValidation);
    }
  }

  /**
   * Get price from specific aggregator
   */
  private async getPriceFromAggregator(
    request: SwapRequest,
    aggregatorType: AggregatorType,
    approvalStrategy?: ApprovalStrategy,
  ): Promise<any> {
    const aggregator = this.aggregators.get(aggregatorType);
    if (!aggregator) {
      throw new Error(`Unsupported aggregator: ${aggregatorType}`);
    }

    if (!aggregator.supportsChain(request.chainId)) {
      throw new Error(`Aggregator ${aggregatorType} does not support chain ${request.chainId}`);
    }

    // Handle 0x Protocol specific strategy methods
    if (aggregatorType === AggregatorType.ZEROX) {
      if (approvalStrategy === ApprovalStrategy.ALLOWANCE_HOLDER) {
        return aggregator.getAllowanceHolderPrice(request);
      } else if (approvalStrategy === ApprovalStrategy.PERMIT2) {
        return aggregator.getPermit2Price(request);
      } else {
        // Default to permit2 for backwards compatibility
        return aggregator.getPrice(request);
      }
    } else {
      // For other aggregators, return quote data as price (no separate price endpoint)
      return aggregator.getQuote(request);
    }
  }

  /**
   * Get spender address for specified aggregator (defaults to 0x)
   */
  async getSpenderAddress(chainId: number, aggregatorType?: AggregatorType): Promise<string> {
    const selectedAggregator = aggregatorType || AggregatorType.ZEROX;
    
    if (!this.aggregators.has(selectedAggregator)) {
      throw new Error(`Unsupported aggregator: ${selectedAggregator}`);
    }

    const aggregator = this.aggregators.get(selectedAggregator);
    if (!aggregator) {
      throw new Error(`${selectedAggregator} service not available`);
    }

    if (!aggregator.supportsChain(chainId)) {
      throw new Error(`${selectedAggregator} does not support chain ${chainId}`);
    }

    // Only 0x Protocol has getSpenderAddress method
    if (selectedAggregator === AggregatorType.ZEROX && aggregator.getSpenderAddress) {
      return aggregator.getSpenderAddress(chainId);
    }
    
    // For other aggregators, spender is typically the router address
    throw new Error(`Spender address not available for ${selectedAggregator}. Use router address from quote.`);
  }

  /**
   * Get token list from specified aggregator (defaults to 0x)
   */
  async getTokenList(chainId: number, aggregatorType?: AggregatorType): Promise<any[]> {
    const selectedAggregator = aggregatorType || AggregatorType.ZEROX;
    
    if (!this.aggregators.has(selectedAggregator)) {
      throw new Error(`Unsupported aggregator: ${selectedAggregator}`);
    }

    const aggregator = this.aggregators.get(selectedAggregator);
    if (!aggregator) {
      throw new Error(`${selectedAggregator} service not available`);
    }

    if (!aggregator.supportsChain(chainId)) {
      throw new Error(`${selectedAggregator} does not support chain ${chainId}`);
    }

    // Only 0x Protocol has getTokenList method
    if (selectedAggregator === AggregatorType.ZEROX && aggregator.getTokenList) {
      return aggregator.getTokenList(chainId);
    }
    
    // For other aggregators, return empty array or fetch from external source
    return [];
  }

  /**
   * Get supported aggregators for a chain
   */
  getSupportedAggregators(chainId: number): AggregatorType[] {
    const supported: AggregatorType[] = [];
    
    for (const [aggregatorType, aggregator] of this.aggregators) {
      if (aggregator && aggregator.supportsChain(chainId)) {
        supported.push(aggregatorType);
        this.logger.debug(`Aggregator ${aggregatorType} is supported for chain ${chainId}`);
      }
    }

    return supported;
  }

  /**
   * Check if aggregator supports a chain
   */
  isAggregatorSupported(chainId: number, aggregatorType: AggregatorType): boolean {
    const aggregator = this.aggregators.get(aggregatorType);
    return aggregator ? aggregator.supportsChain(chainId) : false;
  }

  /**
   * Get all registered aggregators
   */
  getAllAggregators() {
    return Array.from(this.aggregators.values());
  }

  // ============================================================================
  // ENHANCED PROVIDER METHODS
  // ============================================================================

  /**
   * Get EVM swap quote using dynamic provider selection
   * If no preferred provider specified, uses intelligent runtime selection
   */
  async getEvmQuote(request: SwapRequest, preferredProvider?: string): Promise<SwapQuote> {
    // If preferred provider is specified, try it first but fallback to dynamic selection
    if (preferredProvider) {
      const providers = await this.getHealthyEvmProviders(request.chainId);
      const preferredProviderInstance = providers.find(p => p.getProviderName() === preferredProvider);
      
      if (preferredProviderInstance) {
        try {
          const portsRequest = this.convertToPortsRequest(request);
          const quote = await preferredProviderInstance.getQuote(portsRequest);
          this.logger.log(`✅ Preferred provider ${preferredProvider} succeeded for chain ${request.chainId}`);
          return this.convertToLegacyQuote(quote, preferredProvider);
        } catch (error) {
          this.logger.warn(`❌ Preferred provider ${preferredProvider} failed, falling back to dynamic selection: ${error.message}`);
          // Continue to dynamic selection below
        }
      } else {
        this.logger.warn(`⚠️ Preferred provider ${preferredProvider} not available or unhealthy for chain ${request.chainId}, using dynamic selection`);
      }
    }

    // Dynamic provider selection - no hardcoded preferences
    return await this.getDynamicQuote(request);
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

    const portsRequest = this.convertToPortsRequest(request);
    return provider.buildTx(portsRequest);
  }

  /**
   * Get enhanced spender address for approvals (supports strategy-specific addresses)
   */
  async getEnhancedSpenderAddress(chainId: number, strategy: ApprovalStrategy = ApprovalStrategy.ALLOWANCE_HOLDER, providerName?: string): Promise<string> {
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
   * Enhanced multiple quotes from different aggregators with dynamic provider selection
   */
  async getMultipleQuotes(
    chainId: number,
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    taker: string,
    recipient?: string,
    slippagePercentage?: number,
    deadline?: number,
  ): Promise<Array<{ aggregator: AggregatorType; quote: SwapQuote }>> {
    const request: SwapRequest = {
      chainId,
      sellToken,
      buyToken,
      sellAmount,
      taker,
      recipient,
      slippagePercentage,
      deadline,
    };

    // Get all providers that support this chain (not just healthy ones for comparison)
    const supportedProviders = await this.getProvidersForChain(chainId);

    if (supportedProviders.length === 0) {
      throw new Error(`No providers support chain ${chainId}. Supported chains: ${this.getAllSupportedChains().join(', ')}`);
    }

    this.logger.debug(`Getting multiple quotes from ${supportedProviders.length} providers for chain ${chainId}: ${supportedProviders.map(p => p.getProviderName()).join(', ')}`);

    const results: Array<{ aggregator: AggregatorType; quote: SwapQuote }> = [];
    const portsRequest = this.convertToPortsRequest(request);

    // Try each provider in parallel
    const quotes = await Promise.allSettled(
      supportedProviders.map(async (provider) => {
        try {
          const quote = await provider.getQuote(portsRequest,false);
          const legacyQuote = this.convertToLegacyQuote(quote, provider.getProviderName());
          return {
            aggregator: legacyQuote.aggregator,
            quote: legacyQuote,
          };
        } catch (error) {
          this.logger.warn(`Provider ${provider.getProviderName()} failed for multiple quotes: ${error.message}`);
          throw error;
        }
      })
    );

    quotes.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
        this.logger.debug(`✅ ${supportedProviders[index].getProviderName()} provided quote: ${result.value.quote.buyAmount} tokens`);
      } else {
        this.logger.warn(`❌ ${supportedProviders[index].getProviderName()} failed: ${result.reason.message}`);
      }
    });

    if (results.length === 0) {
      throw new Error(`All ${supportedProviders.length} providers failed to provide quotes for chain ${chainId}`);
    }

    this.logger.log(`✅ Got ${results.length}/${supportedProviders.length} quotes for chain ${chainId}`);
    return results;
  }

  /**
   * Enhanced best quote selection with health monitoring
   */
  async getBestQuote(
    chainId: number,
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    taker: string,
    recipient?: string,
    slippagePercentage?: number,
    deadline?: number,
  ): Promise<{ aggregator: AggregatorType; quote: SwapQuote }> {
    const multipleQuotes = await this.getMultipleQuotes(
      chainId,
      sellToken,
      buyToken,
      sellAmount,
      taker,
      recipient,
      slippagePercentage,
      deadline,
    );

    // Find the quote with the highest buyAmount
    const bestQuote = multipleQuotes.reduce((best, current) => {
      const bestBuyAmount = parseFloat(best.quote.buyAmount);
      const currentBuyAmount = parseFloat(current.quote.buyAmount);
      return currentBuyAmount > bestBuyAmount ? current : best;
    });

    return bestQuote;
  }

  /**
   * Enhanced quote comparison with health monitoring
   */
  async compareQuotes(
    chainId: number,
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    taker: string,
    recipient?: string,
    slippagePercentage?: number,
    deadline?: number,
  ): Promise<{
    quotes: Array<{ aggregator: AggregatorType; quote: SwapQuote }>;
    bestAggregator: AggregatorType;
    priceDifference: string;
  }> {
    const quotes = await this.getMultipleQuotes(
      chainId,
      sellToken,
      buyToken,
      sellAmount,
      taker,
      recipient,
      slippagePercentage,
      deadline,
    );

    if (quotes.length === 0) {
      throw new Error('No quotes available for comparison');
    }

    // Find best and calculate price difference
    const bestQuote = quotes.reduce((best, current) => {
      const bestBuyAmount = parseFloat(best.quote.buyAmount);
      const currentBuyAmount = parseFloat(current.quote.buyAmount);
      return currentBuyAmount > bestBuyAmount ? current : best;
    });

    const worstQuote = quotes.reduce((worst, current) => {
      const worstBuyAmount = parseFloat(worst.quote.buyAmount);
      const currentBuyAmount = parseFloat(current.quote.buyAmount);
      return currentBuyAmount < worstBuyAmount ? current : worst;
    });

    const bestAmount = parseFloat(bestQuote.quote.buyAmount);
    const worstAmount = parseFloat(worstQuote.quote.buyAmount);
    const priceDifference = ((bestAmount - worstAmount) / worstAmount * 100).toFixed(2);

    return {
      quotes,
      bestAggregator: bestQuote.aggregator,
      priceDifference: `${priceDifference}%`,
    };
  }

  /**
   * Enhanced supported aggregators with dynamic chain-based discovery
   */
  getEnhancedSupportedAggregators(chainId: number): AggregatorType[] {
    const supported: AggregatorType[] = [];
    
    this.logger.debug(`Discovering supported aggregators for chain ${chainId}...`);
    
    // Dynamic discovery from enhanced registry
    for (const [providerName, provider] of this.evmAggregators) {
      if (provider && provider.supportsChain(chainId)) {
        const aggregatorType = this.mapProviderNameToAggregatorType(providerName);
        if (aggregatorType && !supported.includes(aggregatorType)) {
          supported.push(aggregatorType);
          this.logger.debug(`✅ Dynamic discovery: ${aggregatorType} (${providerName}) supports chain ${chainId}`);
        }
      } else {
        this.logger.debug(`❌ ${providerName} does not support chain ${chainId}`);
      }
    }

    // If no providers found in enhanced registry, check legacy (should not happen after merge)
    if (supported.length === 0) {
      this.logger.warn(`No enhanced providers found for chain ${chainId}, checking legacy registry...`);
      for (const [aggregatorType, aggregator] of this.aggregators) {
        if (aggregator && aggregator.supportsChain(chainId)) {
          supported.push(aggregatorType);
          this.logger.debug(`✅ Legacy fallback: ${aggregatorType} supports chain ${chainId}`);
        }
      }
    }

    if (supported.length === 0) {
      this.logger.warn(`No aggregators support chain ${chainId}. Supported chains: ${this.getAllSupportedChains().join(', ')}`);
    } else {
      this.logger.log(`Found ${supported.length} aggregators for chain ${chainId}: ${supported.join(', ')}`);
    }

    return supported;
  }

  /**
   * Get runtime provider recommendations for a specific request
   */
  async getProviderRecommendations(request: SwapRequest): Promise<Array<{
    provider: string;
    score: number;
    reason: string;
    supported: boolean;
    healthy: boolean;
  }>> {
    const recommendations: Array<{
      provider: string;
      score: number;
      reason: string;
      supported: boolean;
      healthy: boolean;
    }> = [];

    for (const [providerName, provider] of this.evmAggregators) {
      const supported = provider.supportsChain(request.chainId);
      let healthy = false;
      let score = 0;
      let reason = '';

      if (supported) {
        const health = await this.getProviderHealth(provider);
        healthy = health.status === 'healthy';
        
        if (healthy) {
          score = await this.calculateProviderScore(provider, request);
          reason = this.getProviderScoreReason(provider, request, score);
        } else {
          reason = `unhealthy: ${health.status}`;
        }
      } else {
        reason = `does not support chain ${request.chainId}`;
      }

      recommendations.push({
        provider: providerName,
        score,
        reason,
        supported,
        healthy,
      });
    }

    // Sort by score (highest first)
    recommendations.sort((a, b) => b.score - a.score);

    return recommendations;
  }

  /**
   * Map provider name to AggregatorType enum
   */
  private mapProviderNameToAggregatorType(providerName: string): AggregatorType | null {
    switch (providerName.toLowerCase()) {
      case '0x':
        return AggregatorType.ZEROX;
      case 'odos':
        return AggregatorType.ODOS;
      default:
        return null;
    }
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

  // ============================================================================
  // ENHANCED PROVIDER HEALTH MANAGEMENT
  // ============================================================================

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
}
