import { Injectable, Logger } from '@nestjs/common';
import { CustomHttpService } from '../../../shared/services/http.service';
import { SwapRequest, SwapQuote, AggregatorType } from '../../models/swap-request.model';
import { calculateMinReturn } from '../../../shared/utils/ethereum.utils';

/**
 * 1inch aggregator service
 */
@Injectable()
export class OneInchService {
  private readonly logger = new Logger(OneInchService.name);
  private readonly baseUrl = 'https://api.1inch.io/v6.1';
  private readonly apiKey = process.env.ONEINCH_API_KEY;

  constructor(private readonly httpService: CustomHttpService) {}

  /**
   * Get swap quote from 1inch
   */
  async getQuote(request: SwapRequest): Promise<SwapQuote> {
    try {
      const url = `${this.baseUrl}/${request.chainId}/swap`;

      const params = this.buildQuoteParams(request);
      const headers = this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {};

      this.logger.debug(`Getting 1inch quote for chain ${request.chainId}`, params);

      const response = await this.httpService.get<any>(url, {
        headers,
        timeout: 10000,
      });

      return this.parseQuoteResponse(response, request);
    } catch (error) {
      this.logger.error(`Failed to get 1inch quote: ${error.message}`, error.stack);
      throw new Error(`1inch quote failed: ${error.message}`);
    }
  }

  /**
   * Build query parameters for 1inch quote request
   */
  private buildQuoteParams(request: SwapRequest): Record<string, string> {
    const params: Record<string, string> = {
      fromTokenAddress: request.sellToken,
      toTokenAddress: request.buyToken,
      amount: request.sellAmount,
      fromAddress: request.taker,
    };

    // Set recipient to taker if not provided (ensures funds go back to same wallet)
    if (request.recipient) {
      params.destReceiver = request.recipient;
    }

    // Add slippage if provided
    if (request.slippagePercentage !== undefined) {
      params.slippage = request.slippagePercentage.toString();
    }

    // Add deadline if provided
    if (request.deadline) {
      params.deadline = request.deadline.toString();
    }

    return params;
  }

  /**
   * Parse 1inch quote response
   */
  private parseQuoteResponse(response: any, request: SwapRequest): SwapQuote {
    const minBuyAmount = request.slippagePercentage
      ? calculateMinReturn(response.toTokenAmount, request.slippagePercentage * 100)
      : response.toTokenAmount;

    return {
      sellToken: response.fromToken.address,
      buyToken: response.toToken.address,
      sellAmount: response.fromTokenAmount,
      buyAmount: response.toTokenAmount,
      minBuyAmount: minBuyAmount.toString(),
      gas: response.tx.gas,
      gasPrice: response.tx.gasPrice,
      to: response.tx.to,
      data: response.tx.data,
      value: response.tx.value || '0',
      allowanceTarget: response.tx.to, // 1inch router is the spender
      aggregator: AggregatorType.ONEINCH,
      priceImpact: response.estimatedGas,
      estimatedGas: response.estimatedGas,
    };
  }

  /**
   * Get spender address for approvals
   */
  async getSpenderAddress(chainId: number): Promise<string> {
    try {
      const url = `${this.baseUrl}/${chainId}/approve/spender`;
      const headers = this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {};

      const response = await this.httpService.get<{ address: string }>(url, {
        headers,
        timeout: 5000,
      });

      return response.address;
    } catch (error) {
      this.logger.error(`Failed to get 1inch spender address: ${error.message}`);
      throw new Error(`Failed to get 1inch spender address: ${error.message}`);
    }
  }

  /**
   * Get token list for a chain
   */
  async getTokenList(chainId: number): Promise<any[]> {
    try {
      const url = `${this.baseUrl}/${chainId}/tokens`;
      const headers = this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {};

      const response = await this.httpService.get<{ tokens: Record<string, any> }>(url, {
        headers,
        timeout: 10000,
      });

      return Object.values(response.tokens);
    } catch (error) {
      this.logger.error(`Failed to get 1inch token list: ${error.message}`);
      throw new Error(`Failed to get 1inch token list: ${error.message}`);
    }
  }

  /**
   * Check if 1inch supports a chain
   */
  isChainSupported(chainId: number): boolean {
    const supportedChains = [1, 137, 56, 42161, 10, 8453, 43114, 250, 25, 1284];
    return supportedChains.includes(chainId);
  }
}
