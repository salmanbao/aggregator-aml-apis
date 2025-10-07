import { Injectable, Logger } from '@nestjs/common';
import { CustomHttpService } from '../../../shared/services/http.service';
import { SwapRequest, SwapQuote, AggregatorType } from '../../models/swap-request.model';
import { calculateMinReturn } from '../../../shared/utils/ethereum.utils';

/**
 * ParaSwap aggregator service
 */
@Injectable()
export class ParaSwapService {
  private readonly logger = new Logger(ParaSwapService.name);
  private readonly baseUrl = 'https://apiv5.paraswap.io';
  private readonly apiKey = process.env.PARASWAP_API_KEY;

  constructor(private readonly httpService: CustomHttpService) {}

  /**
   * Get swap quote from ParaSwap
   */
  async getQuote(request: SwapRequest): Promise<SwapQuote> {
    try {
      // First get price route
      const priceRoute = await this.getPriceRoute(request);
      
      // Then build transaction
      const transaction = await this.buildTransaction(request, priceRoute);

      return this.parseQuoteResponse(transaction, priceRoute, request);
    } catch (error) {
      this.logger.error(`Failed to get ParaSwap quote: ${error.message}`, error.stack);
      throw new Error(`ParaSwap quote failed: ${error.message}`);
    }
  }

  /**
   * Get price route from ParaSwap
   */
  private async getPriceRoute(request: SwapRequest): Promise<any> {
    const url = `${this.baseUrl}/prices`;

    const params = this.buildPriceRouteParams(request);
    const headers = this.apiKey ? { 'X-API-KEY': this.apiKey } : {};

    this.logger.debug(`Getting ParaSwap price route for chain ${request.chainId}`, params);

    const response = await this.httpService.get<any>(url, {
      headers,
      timeout: 10000,
    });

    return response.priceRoute;
  }

  /**
   * Build transaction from price route
   */
  private async buildTransaction(request: SwapRequest, priceRoute: any): Promise<any> {
    const url = `${this.baseUrl}/transactions/${request.chainId}`;

    const body = {
      srcToken: request.sellToken,
      destToken: request.buyToken,
      srcAmount: request.sellAmount,
      destAmount: priceRoute.destAmount,
      priceRoute: priceRoute,
      userAddress: request.taker,
      partner: 'paraswap',
      slippage: request.slippagePercentage || 0.5,
      receiver: request.recipient || request.taker, // Ensure funds go back to same wallet
    };

    const headers = {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { 'X-API-KEY': this.apiKey } : {}),
    };

    this.logger.debug(`Building ParaSwap transaction for chain ${request.chainId}`, body);

    const response = await this.httpService.post<any>(url, body, {
      headers,
      timeout: 10000,
    });

    return response;
  }

  /**
   * Build query parameters for ParaSwap price route request
   */
  private buildPriceRouteParams(request: SwapRequest): Record<string, string> {
    const params: Record<string, string> = {
      srcToken: request.sellToken,
      destToken: request.buyToken,
      amount: request.sellAmount,
      srcDecimals: '18', // Default, should be fetched from token info
      destDecimals: '18', // Default, should be fetched from token info
      side: 'SELL',
      network: request.chainId.toString(),
      includeContractMethods: 'direct',
    };

    // Add slippage if provided
    if (request.slippagePercentage !== undefined) {
      params.maxImpactReached = 'false';
    }

    return params;
  }

  /**
   * Parse ParaSwap quote response
   */
  private parseQuoteResponse(transaction: any, priceRoute: any, request: SwapRequest): SwapQuote {
    const minBuyAmount = request.slippagePercentage
      ? calculateMinReturn(priceRoute.destAmount, request.slippagePercentage * 100)
      : priceRoute.destAmount;

    return {
      sellToken: request.sellToken,
      buyToken: request.buyToken,
      sellAmount: request.sellAmount,
      buyAmount: priceRoute.destAmount,
      minBuyAmount: minBuyAmount.toString(),
      gas: transaction.gas,
      gasPrice: transaction.gasPrice,
      to: transaction.to,
      data: transaction.data,
      value: transaction.value || '0',
      allowanceTarget: transaction.to, // ParaSwap router is the spender
      aggregator: AggregatorType.PARASWAP,
      priceImpact: priceRoute.priceImpact,
      estimatedGas: transaction.gas,
    };
  }

  /**
   * Get spender address for approvals
   */
  async getSpenderAddress(chainId: number): Promise<string> {
    try {
      const url = `${this.baseUrl}/tokens/${chainId}`;
      const headers = this.apiKey ? { 'X-API-KEY': this.apiKey } : {};

      const response = await this.httpService.get<any>(url, {
        headers,
        timeout: 5000,
      });

      // ParaSwap uses AugustusSwapper as the spender
      return response.augustusSwapper;
    } catch (error) {
      this.logger.error(`Failed to get ParaSwap spender address: ${error.message}`);
      throw new Error(`Failed to get ParaSwap spender address: ${error.message}`);
    }
  }

  /**
   * Get token list for a chain
   */
  async getTokenList(chainId: number): Promise<any[]> {
    try {
      const url = `${this.baseUrl}/tokens/${chainId}`;
      const headers = this.apiKey ? { 'X-API-KEY': this.apiKey } : {};

      const response = await this.httpService.get<{ tokens: any[] }>(url, {
        headers,
        timeout: 10000,
      });

      return response.tokens;
    } catch (error) {
      this.logger.error(`Failed to get ParaSwap token list: ${error.message}`);
      throw new Error(`Failed to get ParaSwap token list: ${error.message}`);
    }
  }

  /**
   * Check if ParaSwap supports a chain
   */
  isChainSupported(chainId: number): boolean {
    const supportedChains = [1, 137, 56, 42161, 10, 8453, 43114, 250, 25, 1284, 100];
    return supportedChains.includes(chainId);
  }
}
