import { Injectable, Logger } from '@nestjs/common';
import { CustomHttpService } from '../../../shared/services/http.service';
import { SwapRequest, SwapQuote, AggregatorType } from '../../models/swap-request.model';
import { getChainConfig } from '../../../shared/utils/chain.utils';

/**
 * 0x Protocol v2 aggregator service
 */
@Injectable()
export class ZeroXService {
  private readonly logger = new Logger(ZeroXService.name);
  private readonly baseUrl = 'https://api.0x.org';
  private readonly apiKey = process.env.ZEROX_API_KEY;

  constructor(private readonly httpService: CustomHttpService) {}

  /**
   * Get swap quote from 0x Protocol v2
   */
  async getQuote(request: SwapRequest): Promise<SwapQuote> {
    try {
      const url = `${this.baseUrl}/swap/permit2/quote?`;

      const params = this.buildQuoteParams(request);
      const headers = this.buildHeaders();
      const quoteParams = new URLSearchParams({...params});
      

      this.logger.debug(`Getting 0x v2 quote for chain ${request.chainId}`, params);
      const response = await this.httpService.get<any>(url + quoteParams.toString(), {
        headers,
        timeout: 15000,
      });

      // Validate response before parsing
      this.validateQuoteResponse(response, request);

      return this.parseQuoteResponse(response, request);
    } catch (error) {
      this.logger.error(`Failed to get 0x v2 quote: ${error.message}`, error.stack);
      
      // Use specific error handling
      if (error.response || error.request) {
        this.handleApiError(error, 'getQuote');
      }
      
      throw new Error(`0x v2 quote failed: ${error.message}`);
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
  private parseQuoteResponse(response: any, request: SwapRequest): SwapQuote {
    // Handle 0x v2 response format
    const minBuyAmount = response.minBuyAmount || response.buyAmount;

    return {
      sellToken: response.sellToken || response.sellTokenAddress,
      buyToken: response.buyToken || response.buyTokenAddress,
      sellAmount: response.sellAmount,
      buyAmount: response.buyAmount,
      minBuyAmount: minBuyAmount.toString(),
      gas: response.gas || response.estimatedGas,
      gasPrice: response.gasPrice,
      to: response.to,
      data: response.data,
      value: response.value || '0',
      allowanceTarget: response.allowanceTarget,
      aggregator: AggregatorType.ZEROX,
      priceImpact: response.priceImpact,
      estimatedGas: response.estimatedGas || response.gas,
    };
  }

  /**
   * Get spender address for approvals (0x v2 uses Permit2)
   */
  async getSpenderAddress(chainId: number): Promise<string> {
    try {
      // For 0x v2 with Permit2, the spender is typically the 0x Exchange Proxy
      // We can get this from the quote response or use a known address
      const chainConfig = getChainConfig(chainId);
      
      // Known 0x Exchange Proxy addresses for different chains
      const exchangeProxyAddresses: Record<number, string> = {
        1: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // Ethereum
        137: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // Polygon
        56: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // BSC
        42161: '0xdef1c0ded9bec7f1a1679833240f027b25eff', // Arbitrum
        10: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // Optimism
        8453: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // Base
        43114: '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // Avalanche
      };

      const spenderAddress = exchangeProxyAddresses[chainId];
      if (!spenderAddress) {
        throw new Error(`Unsupported chain ID: ${chainId}`);
      }

      this.logger.debug(`Using 0x Exchange Proxy address for chain ${chainId}: ${spenderAddress}`);
      return spenderAddress;
    } catch (error) {
      this.logger.error(`Failed to get 0x spender address: ${error.message}`);
      throw new Error(`Failed to get 0x spender address: ${error.message}`);
    }
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
   */
  async getPrice(request: SwapRequest): Promise<any> {
    try {
      const url = `${this.baseUrl}/swap/v2/price`;
      const params = this.buildQuoteParams(request);
      const headers = this.buildHeaders();

      this.logger.debug(`Getting 0x v2 price for chain ${request.chainId}`, params);

      const response = await this.httpService.get<any>(url, {
        headers,
        timeout: 10000,
      });

      return response;
    } catch (error) {
      this.logger.error(`Failed to get 0x v2 price: ${error.message}`, error.stack);
      throw new Error(`0x v2 price failed: ${error.message}`);
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
