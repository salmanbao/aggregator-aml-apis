import { Injectable, Logger } from '@nestjs/common';
import { CustomHttpService } from '../../../shared/services/http.service';
import { SwapRequest, SwapQuote, AggregatorType } from '../../models/swap-request.model';
import { getChainConfig, getNativeTokenAddress } from '../../../shared/utils/chain.utils';
import { calculateMinReturn } from '../../../shared/utils/ethereum.utils';

/**
 * 0x Protocol aggregator service
 */
@Injectable()
export class ZeroXService {
  private readonly logger = new Logger(ZeroXService.name);
  private readonly baseUrl = 'https://api.0x.org';
  private readonly apiKey = process.env.ZEROX_API_KEY;

  constructor(private readonly httpService: CustomHttpService) {}

  /**
   * Get swap quote from 0x Protocol
   */
  async getQuote(request: SwapRequest): Promise<SwapQuote> {
    try {
      const chainConfig = getChainConfig(request.chainId);
      const url = `${this.baseUrl}/swap/v1/quote`;

      const params = this.buildQuoteParams(request);
      const headers = this.apiKey ? { '0x-api-key': this.apiKey } : {};

      this.logger.debug(`Getting 0x quote for chain ${request.chainId}`, params);

      const response = await this.httpService.get<any>(url, {
        headers,
        timeout: 10000,
      });

      return this.parseQuoteResponse(response, request);
    } catch (error) {
      this.logger.error(`Failed to get 0x quote: ${error.message}`, error.stack);
      throw new Error(`0x quote failed: ${error.message}`);
    }
  }

  /**
   * Build query parameters for 0x quote request
   */
  private buildQuoteParams(request: SwapRequest): Record<string, string> {
    const params: Record<string, string> = {
      sellToken: request.sellToken,
      buyToken: request.buyToken,
      sellAmount: request.sellAmount,
      taker: request.taker,
    };

    // Set recipient to taker if not provided (ensures funds go back to same wallet)
    if (request.recipient) {
      params.recipient = request.recipient;
    }

    // Add slippage if provided
    if (request.slippagePercentage !== undefined) {
      params.slippagePercentage = request.slippagePercentage.toString();
    }

    // Add deadline if provided
    if (request.deadline) {
      params.deadline = request.deadline.toString();
    }

    return params;
  }

  /**
   * Parse 0x quote response
   */
  private parseQuoteResponse(response: any, request: SwapRequest): SwapQuote {
    const minBuyAmount = request.slippagePercentage
      ? calculateMinReturn(response.buyAmount, request.slippagePercentage * 100)
      : response.buyAmount;

    return {
      sellToken: response.sellTokenAddress,
      buyToken: response.buyTokenAddress,
      sellAmount: response.sellAmount,
      buyAmount: response.buyAmount,
      minBuyAmount: minBuyAmount.toString(),
      gas: response.gas,
      gasPrice: response.gasPrice,
      to: response.to,
      data: response.data,
      value: response.value || '0',
      allowanceTarget: response.allowanceTarget,
      aggregator: AggregatorType.ZEROX,
      priceImpact: response.priceImpact,
      estimatedGas: response.estimatedGas,
    };
  }

  /**
   * Get spender address for approvals
   */
  async getSpenderAddress(chainId: number): Promise<string> {
    try {
      const url = `${this.baseUrl}/swap/v1/allowance-target`;
      const headers = this.apiKey ? { '0x-api-key': this.apiKey } : {};

      const response = await this.httpService.get<{ allowanceTarget: string }>(url, {
        headers,
        timeout: 5000,
      });

      return response.allowanceTarget;
    } catch (error) {
      this.logger.error(`Failed to get 0x spender address: ${error.message}`);
      throw new Error(`Failed to get 0x spender address: ${error.message}`);
    }
  }

  /**
   * Get token list for a chain
   */
  async getTokenList(chainId: number): Promise<any[]> {
    try {
      const url = `${this.baseUrl}/swap/v1/tokens`;
      const headers = this.apiKey ? { '0x-api-key': this.apiKey } : {};

      const response = await this.httpService.get<{ records: any[] }>(url, {
        headers,
        timeout: 10000,
      });

      return response.records;
    } catch (error) {
      this.logger.error(`Failed to get 0x token list: ${error.message}`);
      throw new Error(`Failed to get 0x token list: ${error.message}`);
    }
  }

  /**
   * Check if 0x supports a chain
   */
  isChainSupported(chainId: number): boolean {
    const supportedChains = [1, 137, 56, 42161, 10, 8453, 43114];
    return supportedChains.includes(chainId);
  }
}
