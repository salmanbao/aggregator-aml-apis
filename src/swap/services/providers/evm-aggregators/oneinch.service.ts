import { Injectable, Logger } from '@nestjs/common';
import { CustomHttpService } from '../../../../shared/services/http.service';
import { 
  IOnchainAggregator, 
  SwapRequest, 
  SwapQuote, 
  TransactionBuild, 
  ProviderConfig,
  ProviderHealth,
  IProvider 
} from '../../../models/ports';

/**
 * 1inch v5 aggregator service implementing IOnchainAggregator port
 */
@Injectable()
export class OneInchService implements IOnchainAggregator, IProvider {
  private readonly logger = new Logger(OneInchService.name);
  private readonly baseUrl = 'https://api.1inch.dev';
  private readonly apiKey = process.env.ONEINCH_API_KEY;

  constructor(private readonly httpService: CustomHttpService) {}

  /**
   * Get provider name for identification
   */
  getProviderName(): string {
    return '1inch';
  }

  /**
   * Check if provider supports the given chain
   */
  supportsChain(chainId: number): boolean {
    // 1inch v5 supported chains
    const supportedChains = [1, 10, 56, 137, 324, 8453, 42161, 43114, 59144];
    return supportedChains.includes(chainId);
  }

  /**
   * Get swap quote - implements IOnchainAggregator interface
   */
  async getQuote(request: SwapRequest): Promise<SwapQuote> {
    try {
      const url = `${this.baseUrl}/swap/v5.0/${request.chainId}/quote`;
      const params = this.buildQuoteParams(request);
      const headers = this.buildHeaders();

      this.logger.debug(`Getting 1inch quote for chain ${request.chainId}`, params);
      
      const queryParams = new URLSearchParams(params);
      const response = await this.httpService.get<any>(url + '?' + queryParams.toString(), {
        headers,
        timeout: 15000,
      });

      return this.parseQuoteResponse(response, request);
    } catch (error) {
      this.logger.error(`Failed to get 1inch quote: ${error.message}`, error.stack);
      this.handleApiError(error);
      throw new Error(`1inch quote failed: ${error.message}`);
    }
  }

  /**
   * Build transaction data - implements IOnchainAggregator interface
   */
  async buildTx(request: SwapRequest): Promise<TransactionBuild> {
    try {
      const url = `${this.baseUrl}/swap/v5.0/${request.chainId}/swap`;
      const params = this.buildSwapParams(request);
      const headers = this.buildHeaders();

      this.logger.debug(`Building 1inch transaction for chain ${request.chainId}`, params);
      
      const queryParams = new URLSearchParams(params);
      const response = await this.httpService.get<any>(url + '?' + queryParams.toString(), {
        headers,
        timeout: 15000,
      });

      return {
        to: response.tx.to,
        data: response.tx.data,
        value: response.tx.value,
        gasLimit: response.tx.gas,
        gasPrice: response.tx.gasPrice,
      };
    } catch (error) {
      this.logger.error(`Failed to build 1inch transaction: ${error.message}`, error.stack);
      this.handleApiError(error);
      throw new Error(`1inch transaction build failed: ${error.message}`);
    }
  }

  /**
   * Provider health check
   */
  async healthCheck(): Promise<ProviderHealth> {
    const startTime = Date.now();
    try {
      await this.httpService.get(`${this.baseUrl}/swap/v5.0/1/healthcheck`, {
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
      enabled: !!this.apiKey,
      rateLimit: {
        requests: 10,
        perSeconds: 1,
      },
      timeout: 15000,
      retries: 3,
    };
  }

  /**
   * Get spender address for approvals
   */
  async getSpenderAddress(chainId: number): Promise<string> {
    try {
      const url = `${this.baseUrl}/swap/v5.0/${chainId}/approve/spender`;
      const headers = this.buildHeaders();

      const response = await this.httpService.get<{ address: string }>(url, {
        headers,
        timeout: 10000,
      });

      return response.address;
    } catch (error) {
      this.logger.error(`Failed to get 1inch spender address: ${error.message}`);
      throw new Error(`Failed to get 1inch spender address: ${error.message}`);
    }
  }

  /**
   * Build quote parameters for 1inch API
   */
  private buildQuoteParams(request: SwapRequest): Record<string, any> {
    const params: Record<string, any> = {
      fromTokenAddress: request.sellToken,
      toTokenAddress: request.buyToken,
      amount: request.sellAmount,
    };

    if (request.slippagePercentage !== undefined) {
      params.slippage = request.slippagePercentage;
    }

    return params;
  }

  /**
   * Build swap parameters for 1inch API
   */
  private buildSwapParams(request: SwapRequest): Record<string, any> {
    const params: Record<string, any> = {
      fromTokenAddress: request.sellToken,
      toTokenAddress: request.buyToken,
      amount: request.sellAmount,
      fromAddress: request.taker,
      slippage: request.slippagePercentage || 1,
    };

    if (request.recipient && request.recipient !== request.taker) {
      params.destReceiver = request.recipient;
    }

    return params;
  }

  /**
   * Build headers for 1inch API requests
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * Parse 1inch quote response
   */
  private parseQuoteResponse(response: any, request: SwapRequest): SwapQuote {
    return {
      sellToken: request.sellToken,
      buyToken: request.buyToken,
      sellAmount: request.sellAmount,
      buyAmount: response.toTokenAmount,
      minBuyAmount: response.toTokenAmount, // 1inch already includes slippage
      gas: response.estimatedGas || '200000',
      to: '', // Quote doesn't include transaction data
      data: '0x',
      value: '0',
      aggregator: this.getProviderName(),
      priceImpact: response.priceImpact,
      estimatedGas: response.estimatedGas,
    };
  }

  /**
   * Handle API errors with specific error messages
   */
  private handleApiError(error: any): never {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 400:
          throw new Error(`Bad request: ${data?.description || 'Invalid parameters'}`);
        case 401:
          throw new Error('Unauthorized: Invalid API key');
        case 403:
          throw new Error('Forbidden: API key does not have required permissions');
        case 429:
          throw new Error('Rate limited: Too many requests');
        case 500:
          throw new Error('Internal server error: 1inch API is experiencing issues');
        default:
          throw new Error(`API error (${status}): ${data?.description || 'Unknown error'}`);
      }
    } else if (error.request) {
      throw new Error('Network error: Unable to reach 1inch API');
    } else {
      throw new Error(`Request setup error: ${error.message}`);
    }
  }
}