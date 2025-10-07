import { Injectable, Logger } from '@nestjs/common';
import { CustomHttpService } from '../../../shared/services/http.service';
import { SwapRequest, SwapQuote, AggregatorType } from '../../models/swap-request.model';
import { calculateMinReturn } from '../../../shared/utils/ethereum.utils';

/**
 * CoW Protocol aggregator service (intent-based)
 */
@Injectable()
export class CowService {
  private readonly logger = new Logger(CowService.name);
  private readonly baseUrl = 'https://api.cow.fi';
  private readonly apiKey = process.env.COW_API_KEY;

  constructor(private readonly httpService: CustomHttpService) {}

  /**
   * Get swap quote from CoW Protocol
   */
  async getQuote(request: SwapRequest): Promise<SwapQuote> {
    try {
      const url = `${this.baseUrl}/${this.getNetworkName(request.chainId)}/api/v1/quote`;

      const body = this.buildQuoteBody(request);
      const headers = this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {};

      this.logger.debug(`Getting CoW quote for chain ${request.chainId}`, body);

      const response = await this.httpService.post<any>(url, body, {
        headers,
        timeout: 10000,
      });

      return this.parseQuoteResponse(response, request);
    } catch (error) {
      this.logger.error(`Failed to get CoW quote: ${error.message}`, error.stack);
      throw new Error(`CoW quote failed: ${error.message}`);
    }
  }

  /**
   * Build request body for CoW quote
   */
  private buildQuoteBody(request: SwapRequest): any {
    return {
      sellToken: request.sellToken,
      buyToken: request.buyToken,
      sellAmount: request.sellAmount,
      kind: 'sell',
      from: request.taker,
      receiver: request.recipient || request.taker, // Ensure funds go back to same wallet
      validTo: request.deadline || Math.floor(Date.now() / 1000) + 1800, // 30 minutes default
      appData: '0x0000000000000000000000000000000000000000000000000000000000000000',
      partiallyFillable: false,
      sellTokenBalance: 'erc20',
      buyTokenBalance: 'erc20',
    };
  }

  /**
   * Parse CoW quote response
   */
  private parseQuoteResponse(response: any, request: SwapRequest): SwapQuote {
    const minBuyAmount = request.slippagePercentage
      ? calculateMinReturn(response.quote.buyAmount, request.slippagePercentage * 100)
      : response.quote.buyAmount;

    return {
      sellToken: response.quote.sellToken,
      buyToken: response.quote.buyToken,
      sellAmount: response.quote.sellAmount,
      buyAmount: response.quote.buyAmount,
      minBuyAmount: minBuyAmount.toString(),
      gas: response.quote.feeAmount,
      gasPrice: '0', // CoW is gasless
      to: response.quote.to,
      data: response.quote.data,
      value: response.quote.value || '0',
      allowanceTarget: response.quote.allowanceTarget,
      aggregator: AggregatorType.COW,
      priceImpact: response.quote.priceImpact,
      estimatedGas: '0', // CoW is gasless
    };
  }

  /**
   * Get network name for CoW API
   */
  private getNetworkName(chainId: number): string {
    const networkMap: Record<number, string> = {
      1: 'mainnet',
      100: 'gnosis',
      5: 'goerli',
    };

    const networkName = networkMap[chainId];
    if (!networkName) {
      throw new Error(`CoW Protocol does not support chain ${chainId}`);
    }

    return networkName;
  }

  /**
   * Get spender address for approvals (CoW uses settlement contract)
   */
  async getSpenderAddress(chainId: number): Promise<string> {
    try {
      const networkName = this.getNetworkName(chainId);
      const url = `${this.baseUrl}/${networkName}/api/v1/contracts`;

      const headers = this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {};

      const response = await this.httpService.get<any>(url, {
        headers,
        timeout: 5000,
      });

      return response.settlementContract;
    } catch (error) {
      this.logger.error(`Failed to get CoW spender address: ${error.message}`);
      throw new Error(`Failed to get CoW spender address: ${error.message}`);
    }
  }

  /**
   * Get token list for a chain
   */
  async getTokenList(chainId: number): Promise<any[]> {
    try {
      const networkName = this.getNetworkName(chainId);
      const url = `${this.baseUrl}/${networkName}/api/v1/tokens`;

      const headers = this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {};

      const response = await this.httpService.get<{ tokens: any[] }>(url, {
        headers,
        timeout: 10000,
      });

      return response.tokens;
    } catch (error) {
      this.logger.error(`Failed to get CoW token list: ${error.message}`);
      throw new Error(`Failed to get CoW token list: ${error.message}`);
    }
  }

  /**
   * Check if CoW Protocol supports a chain
   */
  isChainSupported(chainId: number): boolean {
    const supportedChains = [1, 100, 5]; // Mainnet, Gnosis, Goerli
    return supportedChains.includes(chainId);
  }
}
