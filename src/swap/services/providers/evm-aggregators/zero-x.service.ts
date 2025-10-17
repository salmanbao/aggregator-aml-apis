import { Injectable, Logger, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { CustomHttpService } from '@shared/services/http.service';
import { ApprovalStrategy } from '@swap/models/swap-request.model';
import { 
  IOnchainAggregator, 
  SwapRequest, 
  SwapQuote, 
  TransactionBuild, 
  ProviderConfig,
  ProviderHealth,
  IProvider,
  Permit2Data 
} from '@swap/models/ports';
import { 
  ZeroXQuoteResponse,
  ApiErrorResponse,
  isApiErrorResponse,
  ZeroXTokenInfo,
  ZeroXTokenListResponse,
} from '@swap/models/aggregator-responses';
import { NATIVE_TOKEN_ADDRESS, USDT_ADDRESS } from '@shared/utils/chain.utils';
import type { IAggregatorRegistry } from '@swap/services/core/aggregation/aggregator-registry.interface';
import { AggregatorManagerService } from '@swap/services/core/aggregation/aggregator-manager.service';

/**
 * 0x Protocol v2 aggregator service implementing IOnchainAggregator port
 * Supports both AllowanceHolder and Permit2 approval strategies
 * NOW WITH SELF-REGISTRATION: Automatically registers itself with AggregatorManagerService
 */
@Injectable()
export class ZeroXService implements IOnchainAggregator, IProvider, OnModuleInit {
  private readonly logger = new Logger(ZeroXService.name);
  private readonly baseUrl = 'https://api.0x.org';
  private readonly apiKey = process.env.ZEROX_API_KEY;
  
  
  // Cache for AllowanceHolder addresses to avoid repeated API calls
  private readonly allowanceTargetCache = new Map<number, { address: string; timestamp: number }>();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly supportedChains = [1, 10, 14, 56, 130, 137, 143, 480, 5000, 8453, 9745, 10143, 34443, 42161, 43114, 59144, 81457, 534352, 57073, 80094];

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
   * Get provider name for identification
   */
  getProviderName(): string {
    return '0x';
  }

  /**
   * Check if provider supports the given chain
   */
  supportsChain(chainId: number): boolean {
    // 0x Protocol v2 supports these chains (hardcoded fallback)
    return this.supportedChains.includes(chainId);
  }

  /**
   * Get all supported chains dynamically from 0x API
   */
  async getSupportedChains(): Promise<number[]> {
    try {
      const url = `${this.baseUrl}/swap/chains`;
      const headers = this.buildHeaders();

      this.logger.debug('Fetching supported chains from 0x API');

      const response = await this.httpService.get<{ chains: Array<{ chainId: number }> }>(url, {
        headers,
        timeout: 10000,
      });

      const chainIds = response.chains?.map(record => record.chainId) || [];
      
      this.logger.debug(`0x API returned ${chainIds.length} supported chains: ${chainIds.join(', ')}`);
      
      return chainIds.filter(chainId => chainId > 0);
    } catch (error) {
      this.logger.warn(`Failed to fetch supported chains from 0x API: ${error.message}, using hardcoded list`);
      
      // Fallback to hardcoded list
      return this.supportedChains;
    }
  }

  /**
   * Get swap quote - implements IOnchainAggregator interface
   */
  async getQuote(request: SwapRequest, strictValidation: boolean = true): Promise<SwapQuote> {
    const strategy = request.approvalStrategy || ApprovalStrategy.ALLOWANCE_HOLDER;
    return this.getQuoteWithStrategy(request, strategy, strictValidation);
  }

  /**
   * Build transaction data - implements IOnchainAggregator interface
   */
  async buildTx(request: SwapRequest): Promise<TransactionBuild> {
    const quote = await this.getQuote(request);
    return {
      to: quote.to,
      data: quote.data,
      value: quote.value,
      gasLimit: quote.gas,
      gasPrice: quote.gasPrice,
    };
  }

  /**
   * Provider health check
   */
  async healthCheck(): Promise<ProviderHealth> {
    const startTime = Date.now();
    try {
      // Simple health check with ETH price query
      await this.httpService.get(`${this.baseUrl}/swap/permit2/price?chainId=1&sellToken=${NATIVE_TOKEN_ADDRESS}&buyToken=${USDT_ADDRESS}&sellAmount=1000000000000000000`, {
        headers: this.buildHeaders(),
        timeout: 5000,
      });
      
      const latency = Date.now() - startTime;
      return {
        name: this.getProviderName(),
        status: 'healthy',
        latency,
        lastCheck: new Date(),
        errorRate: 0,
      };
    } catch (error) {
      return {
        name: this.getProviderName(),
        status: 'unhealthy',
        lastCheck: new Date(),
        errorRate: 1,
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
      apiKey: this.apiKey ? '***' : undefined,
      enabled: true,
      rateLimit: {
        requests: 10,
        perSeconds: 1,
      },
      timeout: 15000,
      retries: 3,
    };
  }

  /**
   * Clear the allowance target cache (useful for testing or when addresses change)
   */
  clearAllowanceTargetCache(): void {
    this.allowanceTargetCache.clear();
    this.logger.debug('AllowanceTarget cache cleared');
  }

  /**
   * Get swap quote using AllowanceHolder strategy (Recommended)
   */
  async getAllowanceHolderQuote(request: SwapRequest): Promise<SwapQuote> {
    return this.getQuoteWithStrategy(request, ApprovalStrategy.ALLOWANCE_HOLDER, true); // Always strict for direct calls
  }

  /**
   * Get swap quote using Permit2 strategy (Advanced)
   */
  async getPermit2Quote(request: SwapRequest): Promise<SwapQuote> {
    return this.getQuoteWithStrategy(request, ApprovalStrategy.PERMIT2, true); // Always strict for direct calls
  }

  /**
   * Get price using AllowanceHolder strategy (Recommended)
   */
  async getAllowanceHolderPrice(request: SwapRequest): Promise<any> {
    return this.getPriceWithStrategy(request, ApprovalStrategy.ALLOWANCE_HOLDER);
  }

  /**
   * Get price using Permit2 strategy (Advanced)
   */
  async getPermit2Price(request: SwapRequest): Promise<any> {
    return this.getPriceWithStrategy(request, ApprovalStrategy.PERMIT2);
  }

  /**
   * Get price for backwards compatibility (defaults to Permit2)
   */
  async getPrice(request: SwapRequest): Promise<any> {
    return this.getPriceWithStrategy(request, ApprovalStrategy.PERMIT2);
  }

  /**
   * Get swap quote with specified approval strategy
   */
  async getQuoteWithStrategy(request: SwapRequest, strategy: ApprovalStrategy, strictValidation: boolean = true): Promise<SwapQuote> {
    try {
      const url = `${this.baseUrl}/swap/${strategy}/quote?`;
      const params = this.buildQuoteParams(request);
      const headers = this.buildHeaders();
      const quoteParams = new URLSearchParams({...params});
      
      this.logger.debug(`Getting 0x v2 ${strategy} quote for chain ${request.chainId}`, params);
      const response = await this.httpService.get<ZeroXQuoteResponse>(url + quoteParams.toString(), {
        headers,
        timeout: 15000,
      });
      
      // Validate response before parsing - use strict or relaxed validation
      this.validateQuoteResponse(response, request, strictValidation);

      return this.parseQuoteResponse(response, request, strategy);
    } catch (error) {
      this.logger.error(`Failed to get 0x v2 ${strategy} quote: ${error.message}`, error.stack);
      
      // Use specific error handling
      if (error.response || error.request) {
        this.handleApiError(error, `getQuoteWithStrategy(${strategy})`);
      }
      
      throw new Error(`0x v2 ${strategy} quote failed: ${error.message}`);
    }
  }

  /**
   * Get spender address for approvals (strategy-specific)
   */
  async getSpenderAddress(chainId: number, strategy: ApprovalStrategy = ApprovalStrategy.ALLOWANCE_HOLDER): Promise<string> {
    try {
      if (strategy === ApprovalStrategy.PERMIT2) {
        // Permit2 contract is deployed at the same address across all chains
        return '0x000000000022D473030F116dDEE9F6B43aC78BA3';
      } else {
        // For AllowanceHolder, get the address dynamically from quote response
        return await this.getAllowanceHolderAddressDynamic(chainId);
      }
    } catch (error) {
      this.logger.error(`Failed to get spender address for ${strategy}: ${error.message}`);
      throw new Error(`Failed to get spender address for ${strategy}: ${error.message}`);
    }
  }

  /**
   * Check if a strategy is supported on a chain
   */
  isStrategySupported(chainId: number, strategy: ApprovalStrategy): boolean {
    if (!this.supportsChain(chainId)) {
      return false;
    }

    if (strategy === ApprovalStrategy.PERMIT2) {
      // Permit2 is supported on all chains that 0x supports
      return true;
    } else if (strategy === ApprovalStrategy.ALLOWANCE_HOLDER) {
      // AllowanceHolder is supported on most chains, but not all
      try {
        this.getAllowanceHolderAddressFallback(chainId);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Get token list for a chain (0x v2)
   */
  async getTokenList(chainId: number): Promise<ZeroXTokenInfo[]> {
    try {
      const url = `${this.baseUrl}/swap/v1/tokens`;
      const headers = this.buildHeaders();

      const response = await this.httpService.get<ZeroXTokenListResponse>(url, {
        headers,
        timeout: 10000,
      });

      return response.records || [];
    } catch (error) {
      this.logger.error(`Failed to get 0x v2 token list: ${error.message}`);
      throw new Error(`Failed to get 0x v2 token list: ${error.message}`);
    }
  }

  /**
   * Get price quote with specified approval strategy
   */
  async getPriceWithStrategy(request: SwapRequest, strategy: ApprovalStrategy): Promise<any> {
    try {
      const url = `${this.baseUrl}/swap/${strategy}/price`;
      const params = this.buildQuoteParams(request);
      const headers = this.buildHeaders();
      const queryParams = new URLSearchParams(params);

      this.logger.debug(`Getting 0x v2 ${strategy} price for chain ${request.chainId}`, params);

      const response = await this.httpService.get<any>(url + '?' + queryParams.toString(), {
        headers,
        timeout: 10000,
      });

      return response;
    } catch (error) {
      this.logger.error(`Failed to get 0x v2 ${strategy} price: ${error.message}`, error.stack);
      throw new Error(`0x v2 ${strategy} price failed: ${error.message}`);
    }
  }

  /**
   * Build query parameters for 0x v2 quote request
   */
  private buildQuoteParams(request: SwapRequest): Record<string, string> {
    const params: Record<string, string> = {
      chainId: request.chainId.toString(),
      sellToken: request.sellToken,
      buyToken: request.buyToken,
      sellAmount: request.sellAmount,
      taker: request.taker,
    };

    // Add slippage in basis points (0x v2 uses bps instead of percentage)
    if (request.slippagePercentage !== undefined) {
      const slippageBps = Math.round(request.slippagePercentage * 100);
      params.slippageBps = slippageBps.toString();
    }

    // Add txOrigin if taker is different from recipient (for smart contracts)
    if (request.recipient && request.recipient !== request.taker) {
      params.txOrigin = request.recipient;
    }

    return params;
  }

  /**
   * Build headers for 0x v2 API requests
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      '0x-version': 'v2',
    };

    if (this.apiKey) {
      headers['0x-api-key'] = this.apiKey;
    }

    return headers;
  }

  /**
   * Parse 0x v2 quote response
   */
  private parseQuoteResponse(response: ZeroXQuoteResponse, request: SwapRequest, strategy: ApprovalStrategy): SwapQuote {
    // Handle 0x v2 response format
    const minBuyAmount = response.minBuyAmount || response.buyAmount;

    // Extract permit2 data if available for gasless approvals (Permit2 strategy only)
    let permit2Data: Permit2Data | undefined = undefined;
    if (strategy === ApprovalStrategy.PERMIT2 && response.permit2?.eip712) {
      permit2Data = {
        type: response.permit2.type,
        hash: response.permit2.hash,
        eip712: response.permit2.eip712
      };
      this.logger.debug('Permit2 data extracted from 0x response', { 
        type: permit2Data.type,
        hash: permit2Data.hash,
        strategy
      });
    }

    // Extract transaction data (to, data, value, gas, gasPrice)
    const transaction = response.transaction;

    return {
      sellToken: response.sellToken,
      buyToken: response.buyToken,
      sellAmount: response.sellAmount,
      buyAmount: response.buyAmount,
      minBuyAmount: minBuyAmount.toString(),
      gas: transaction.gas || response.gas || response.estimatedGas || '',
      gasPrice: transaction.gasPrice || response.gasPrice,
      to: transaction.to,
      data: transaction.data,
      value: transaction.value,
      allowanceTarget: response.allowanceTarget,
      aggregator: this.getProviderName(),
      priceImpact: response.priceImpact,
      estimatedGas: response.estimatedGas || response.gas,
      permit2: permit2Data,
      approvalStrategy: strategy,
    };
  }

  /**
   * Get AllowanceHolder contract address dynamically from 0x API
   * This is the recommended approach per 0x documentation
   */
  private async getAllowanceHolderAddressDynamic(chainId: number): Promise<string> {
    try {
      // Check cache first
      const cached = this.allowanceTargetCache.get(chainId);
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
        this.logger.debug(`Using cached AllowanceHolder address for chain ${chainId}: ${cached.address}`);
        return cached.address;
      }

      // Make a small quote request to get the current allowanceTarget
      const url = `${this.baseUrl}/swap/allowance-holder/quote`;
      const params = new URLSearchParams({
        chainId: chainId.toString(),
        sellToken: NATIVE_TOKEN_ADDRESS, // Use native token (ETH, BNB, etc.)
        buyToken: USDT_ADDRESS, // Use a common stable token
        sellAmount: '1000000000000000000', // 1 token
        taker: '0x0000000000000000000000000000000000000000', // Dummy address for quote
      });

      const headers = this.buildHeaders();
      
      this.logger.debug(`Getting dynamic AllowanceHolder address for chain ${chainId}`);
      
      const response = await this.httpService.get<any>(url + '?' + params.toString(), {
        headers,
        timeout: 10000,
      });

      if (response.allowanceTarget) {
        const address = response.allowanceTarget;
        
        // Cache the result
        this.allowanceTargetCache.set(chainId, {
          address,
          timestamp: Date.now()
        });
        
        this.logger.debug(`Dynamic AllowanceHolder address for chain ${chainId}: ${address} (cached)`);
        return address;
      } else {
        // Fallback to hardcoded addresses if allowanceTarget is not in response
        this.logger.warn(`No allowanceTarget in response for chain ${chainId}, falling back to hardcoded address`);
        return this.getAllowanceHolderAddressFallback(chainId);
      }
    } catch (error) {
      this.logger.warn(`Failed to get dynamic AllowanceHolder address for chain ${chainId}: ${error.message}, falling back to hardcoded`);
      // Fallback to hardcoded addresses if API call fails
      return this.getAllowanceHolderAddressFallback(chainId);
    }
  }

  /**
   * Get AllowanceHolder contract address for a specific chain (fallback method)
   * These are backup addresses in case the dynamic method fails
   */
  private getAllowanceHolderAddressFallback(chainId: number): string {
    // AllowanceHolder contract addresses by hardfork type (as of last update)
    // Note: These may become outdated - dynamic method above is preferred
    const cancunChains = [1, 10, 56, 137, 8453, 11155111, 42161, 43114, 81457];
    const shanghaiChains = [5000, 534352];
    const londonChains = [59144];

    if (cancunChains.includes(chainId)) {
      return '0x0000000000001fF3684f28c67538d4D072C22734';
    } else if (shanghaiChains.includes(chainId)) {
      return '0x0000000000005E88410CcDFaDe4a5EfaE4b49562';
    } else if (londonChains.includes(chainId)) {
      return '0x000000000000175a8b9bC6d539B3708EEd92EA6c';
    } else {
      throw new Error(`AllowanceHolder not supported on chain ${chainId}`);
    }
  }

  /**
   * Validate quote response and handle edge cases
   */
  private validateQuoteResponse(response: ZeroXQuoteResponse | ApiErrorResponse, request: SwapRequest, strictValidation: boolean = true): void {
    if (!response) {
      throw new Error('Empty response from 0x API');
    }

    // Check if it's an error response
    if (isApiErrorResponse(response)) {
      const errors = response.detail.map(d => d.msg).join(', ');
      throw new Error(`0x API error: ${errors}`);
    }

    if (!response.buyAmount || !response.sellAmount) {
      throw new Error('Invalid quote response: missing buyAmount or sellAmount');
    }

    if (!response.transaction.to || !response.transaction.data) {
      throw new Error('Invalid quote response: missing transaction data');
    }

    // Check for liquidity issues - more relaxed when not doing strict validation
    if (response.issues) {
      // Handle both array and object formats for issues
      if (Array.isArray(response.issues)) {
        const issues = response.issues;
        // Always check for critical liquidity issues
        if (issues.includes('INSUFFICIENT_LIQUIDITY')) {
          if (strictValidation) {
            throw new Error('Insufficient liquidity for this trade');
          } else {
            this.logger.warn('Insufficient liquidity detected in quote - may affect execution');
          }
        }
        if (issues.includes('INVALID_SOURCES')) {
          if (strictValidation) {
            throw new Error('Invalid liquidity sources');
          } else {
            this.logger.warn('Invalid liquidity sources detected in quote');
          }
        }
      } else {
        // Handle object format
        const issues = response.issues;
        // For balance/allowance issues, only warn during quote comparison
        if (issues.balance || issues.allowance) {
          if (strictValidation) {
            throw new Error('Balance or allowance issues detected');
          } else {
            this.logger.warn('Balance or allowance issues detected in quote - will need to be resolved before execution');
          }
        }
        if (issues.simulationIncomplete) {
          this.logger.warn('Simulation incomplete for this trade');
        }
      }
    }

    // Check if liquidity is available - more relaxed for quote comparison
    if (response.liquidityAvailable === false) {
      if (strictValidation) {
        throw new Error('No liquidity available for this trade');
      } else {
        this.logger.warn('No liquidity available according to 0x - quote may not be executable');
      }
    }

    // Validate minimum buy amount
    const minBuyAmount = BigInt(response.minBuyAmount || response.buyAmount);
    const buyAmount = BigInt(response.buyAmount);
    
    if (minBuyAmount > buyAmount) {
      throw new Error('Invalid quote: minBuyAmount greater than buyAmount');
    }

    this.logger.debug(`Quote validation passed for ${request.sellToken} -> ${request.buyToken}${strictValidation ? ' (strict)' : ' (relaxed)'}`);
  }

  /**
   * Handle API errors with specific error messages
   */
  private handleApiError(error: any, context: string): never {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      // Check if it's a structured API error response
      if (isApiErrorResponse(data)) {
        const errors = data.detail.map(d => d.msg).join(', ');
        throw new Error(`${context}: ${errors}`);
      }

      switch (status) {
        case 400:
          throw new Error(`Bad request: ${data?.message || 'Invalid parameters'}`);
        case 401:
          throw new Error('Unauthorized: Invalid API key');
        case 403:
          throw new Error('Forbidden: API key does not have required permissions');
        case 404:
          throw new Error('Not found: Endpoint or resource not found');
        case 429:
          throw new Error('Rate limited: Too many requests');
        case 500:
          throw new Error('Internal server error: 0x API is experiencing issues');
        case 503:
          throw new Error('Service unavailable: 0x API is temporarily down');
        default:
          throw new Error(`API error (${status}): ${data?.message || 'Unknown error'}`);
      }
    } else if (error.request) {
      throw new Error('Network error: Unable to reach 0x API');
    } else {
      throw new Error(`Request setup error: ${error.message}`);
    }
  }
}