import { Injectable, Logger } from '@nestjs/common';
import { CustomHttpService } from '../../../shared/services/http.service';
import { SwapRequest, SwapQuote, AggregatorType, Permit2Data, ApprovalStrategy } from '../../models/swap-request.model';
import { getChainConfig } from '../../../shared/utils/chain.utils';

/**
 * 0x Protocol v2 aggregator service with support for both AllowanceHolder and Permit2
 */
@Injectable()
export class ZeroXService {
  private readonly logger = new Logger(ZeroXService.name);
  private readonly baseUrl = 'https://api.0x.org';
  private readonly apiKey = process.env.ZEROX_API_KEY;

  constructor(private readonly httpService: CustomHttpService) {}

  /**
   * Get swap quote from 0x Protocol v2 (Permit2 endpoint)
   * @deprecated Use getQuoteWithStrategy() instead for better control
   */
  async getQuote(request: SwapRequest): Promise<SwapQuote> {
    return this.getQuoteWithStrategy(request, ApprovalStrategy.PERMIT2);
  }

  /**
   * Get swap quote using AllowanceHolder strategy (Recommended)
   */
  async getAllowanceHolderQuote(request: SwapRequest): Promise<SwapQuote> {
    return this.getQuoteWithStrategy(request, ApprovalStrategy.ALLOWANCE_HOLDER);
  }

  /**
   * Get swap quote using Permit2 strategy (Advanced)
   */
  async getPermit2Quote(request: SwapRequest): Promise<SwapQuote> {
    return this.getQuoteWithStrategy(request, ApprovalStrategy.PERMIT2);
  }

  /**
   * Get swap quote with specified approval strategy
   */
  async getQuoteWithStrategy(request: SwapRequest, strategy: ApprovalStrategy): Promise<SwapQuote> {
    try {
      const url = `${this.baseUrl}/swap/${strategy}/quote?`;
      const params = this.buildQuoteParams(request);
      const headers = this.buildHeaders();
      const quoteParams = new URLSearchParams({...params});
      
      this.logger.debug(`Getting 0x v2 ${strategy} quote for chain ${request.chainId}`, params);
      const response = await this.httpService.get<any>(url + quoteParams.toString(), {
        headers,
        timeout: 15000,
      });
      
      // Validate response before parsing
      this.validateQuoteResponse(response, request);

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
   * Build query parameters for 0x v2 quote request
   */
  private buildQuoteParams(request: SwapRequest): Record<string,  string> {
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
  private parseQuoteResponse(response: any, request: SwapRequest, strategy: ApprovalStrategy = ApprovalStrategy.PERMIT2): SwapQuote {
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
    } else if (strategy === ApprovalStrategy.ALLOWANCE_HOLDER) {
      // AllowanceHolder doesn't use permit2 data - uses traditional allowances
      this.logger.debug('AllowanceHolder strategy - no permit2 data needed', { strategy });
    }

    // Extract transaction data (to, data, value, gas, gasPrice)
    const transaction = response.transaction || {
      to: response.to,
      data: response.data,
      value: response.value || '0',
      gas: response.gas || response.estimatedGas,
      gasPrice: response.gasPrice
    };

    return {
      sellToken: response.sellToken || response.sellTokenAddress,
      buyToken: response.buyToken || response.buyTokenAddress,
      sellAmount: response.sellAmount,
      buyAmount: response.buyAmount,
      minBuyAmount: minBuyAmount.toString(),
      gas: transaction.gas,
      gasPrice: transaction.gasPrice,
      to: transaction.to,
      data: transaction.data,
      value: transaction.value,
      allowanceTarget: response.allowanceTarget,
      aggregator: AggregatorType.ZEROX,
      priceImpact: response.priceImpact,
      estimatedGas: response.estimatedGas || response.gas,
      permit2: permit2Data, // Include permit2 data for gasless approvals (Permit2 only)
      approvalStrategy: strategy, // Include the strategy used for this quote
    };
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
        // AllowanceHolder addresses are chain-specific
        return this.getAllowanceHolderAddress(chainId);
      }
    } catch (error) {
      this.logger.error(`Failed to get spender address for ${strategy}: ${error.message}`);
      throw new Error(`Failed to get spender address for ${strategy}: ${error.message}`);
    }
  }

  /**
   * Get AllowanceHolder contract address for a specific chain
   */
  private getAllowanceHolderAddress(chainId: number): string {
    // AllowanceHolder contract addresses by hardfork type
    const cancunChains = [1, 11155111, 137, 8453, 10, 42161, 43114, 81457, 56]; // Ethereum, Sepolia, Polygon, Base, Optimism, Arbitrum, Avalanche, Blast, BNB
    const shanghaiChains = [534352, 5000]; // Scroll, Mantle
    const londonChains = [59144]; // Linea

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
   * Check if a strategy is supported on a chain
   */
  isStrategySupported(chainId: number, strategy: ApprovalStrategy): boolean {
    if (!this.isChainSupported(chainId)) {
      return false;
    }

    if (strategy === ApprovalStrategy.PERMIT2) {
      // Permit2 is supported on all chains that 0x supports
      return true;
    } else if (strategy === ApprovalStrategy.ALLOWANCE_HOLDER) {
      // AllowanceHolder is supported on most chains, but not all
      try {
        this.getAllowanceHolderAddress(chainId);
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
  async getTokenList(chainId: number): Promise<any[]> {
    try {
      const url = `${this.baseUrl}/swap/v1/tokens`;
      const headers = this.buildHeaders();

      const response = await this.httpService.get<{ records: any[] }>(url, {
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
   * Get price quote (indicative price without transaction data)
   * @deprecated Use getPriceWithStrategy() instead for better control
   */
  async getPrice(request: SwapRequest): Promise<any> {
    return this.getPriceWithStrategy(request, ApprovalStrategy.PERMIT2);
  }

  /**
   * Get AllowanceHolder price quote (Recommended)
   */
  async getAllowanceHolderPrice(request: SwapRequest): Promise<any> {
    return this.getPriceWithStrategy(request, ApprovalStrategy.ALLOWANCE_HOLDER);
  }

  /**
   * Get Permit2 price quote (Advanced)
   */
  async getPermit2Price(request: SwapRequest): Promise<any> {
    return this.getPriceWithStrategy(request, ApprovalStrategy.PERMIT2);
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
   * Check if 0x supports a chain
   */
  isChainSupported(chainId: number): boolean {
    // 0x Protocol v2 supports Ethereum Mainnet and several L2s/sidechains
    // This list can be expanded based on 0x documentation
    const supportedChains = [1, 137, 56, 42161, 10, 8453, 43114];
    return supportedChains.includes(chainId);
  }

  /**
   * Validate quote response and handle edge cases
   */
  private validateQuoteResponse(response: any, request: SwapRequest): void {
    if (!response) {
      throw new Error('Empty response from 0x API');
    }

    if (!response.buyAmount || !response.sellAmount) {
      throw new Error('Invalid quote response: missing buyAmount or sellAmount');
    }

    if (!response.transaction.to || !response.transaction.data) {
      throw new Error('Invalid quote response: missing transaction data');
    }

    // Check for liquidity issues
    if (response.issues && response.issues.length > 0) {
      const issues = response.issues;
      if (issues.includes('INSUFFICIENT_LIQUIDITY')) {
        throw new Error('Insufficient liquidity for this trade');
      }
      if (issues.includes('INVALID_SOURCES')) {
        throw new Error('Invalid liquidity sources');
      }
    }

    // Check if liquidity is available
    if (response.liquidityAvailable === false) {
      throw new Error('No liquidity available for this trade');
    }

    // Validate minimum buy amount
    const minBuyAmount = BigInt(response.minBuyAmount || response.buyAmount);
    const buyAmount = BigInt(response.buyAmount);
    
    if (minBuyAmount > buyAmount) {
      throw new Error('Invalid quote: minBuyAmount greater than buyAmount');
    }

    this.logger.debug(`Quote validation passed for ${request.sellToken} -> ${request.buyToken}`);
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
