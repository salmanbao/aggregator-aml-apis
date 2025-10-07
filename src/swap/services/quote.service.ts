import { Injectable, Logger } from '@nestjs/common';
import { AggregatorManagerService } from './aggregator-manager.service';
import { SwapRequest, SwapQuote, AggregatorType } from '../models/swap-request.model';
import {
  validateChainId,
  validateTokenAddress,
  validateWalletAddress,
  validateAmount,
  validateSlippage,
  validateDeadline,
} from '../../shared/utils/validation.utils';

/**
 * Quote service for getting swap quotes from aggregators
 */
@Injectable()
export class QuoteService {
  private readonly logger = new Logger(QuoteService.name);

  constructor(private readonly aggregatorManager: AggregatorManagerService) {}

  /**
   * Get swap quote
   */
  async getQuote(
    chainId: number,
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    taker: string,
    recipient?: string,
    slippagePercentage?: number,
    deadline?: number,
    aggregatorType?: AggregatorType,
  ): Promise<SwapQuote> {
    try {
      // Validate inputs
      this.validateQuoteInputs(
        chainId,
        sellToken,
        buyToken,
        sellAmount,
        taker,
        slippagePercentage,
        deadline,
      );

      // Build swap request
      const swapRequest: SwapRequest = {
        chainId,
        sellToken,
        buyToken,
        sellAmount,
        taker,
        recipient: recipient || taker, // Ensure funds go back to same wallet
        slippagePercentage,
        deadline,
        aggregator: aggregatorType,
      };

      // Get quote from aggregator
      const quote = await this.aggregatorManager.getQuote(swapRequest, aggregatorType);

      this.logger.log(
        `Quote obtained: ${quote.sellAmount} ${quote.sellToken} -> ${quote.buyAmount} ${quote.buyToken}`,
      );

      return quote;
    } catch (error) {
      this.logger.error(`Failed to get quote: ${error.message}`, error.stack);
      throw new Error(`Failed to get quote: ${error.message}`);
    }
  }

  /**
   * Get quotes from multiple aggregators
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
    try {
      // Validate inputs
      this.validateQuoteInputs(
        chainId,
        sellToken,
        buyToken,
        sellAmount,
        taker,
        slippagePercentage,
        deadline,
      );

      const supportedAggregators = this.aggregatorManager.getSupportedAggregators(chainId);
      const quotes: Array<{ aggregator: AggregatorType; quote: SwapQuote }> = [];

      // Get quotes from all supported aggregators
      for (const aggregatorType of supportedAggregators) {
        try {
          const quote = await this.getQuote(
            chainId,
            sellToken,
            buyToken,
            sellAmount,
            taker,
            recipient,
            slippagePercentage,
            deadline,
            aggregatorType,
          );

          quotes.push({ aggregator: aggregatorType, quote });
        } catch (error) {
          this.logger.warn(`Failed to get quote from ${aggregatorType}: ${error.message}`);
        }
      }

      if (quotes.length === 0) {
        throw new Error('No quotes available from any aggregator');
      }

      // Sort by buy amount (best price first)
      quotes.sort((a, b) => {
        const amountA = BigInt(a.quote.buyAmount);
        const amountB = BigInt(b.quote.buyAmount);
        return amountA > amountB ? -1 : amountA < amountB ? 1 : 0;
      });

      return quotes;
    } catch (error) {
      this.logger.error(`Failed to get multiple quotes: ${error.message}`, error.stack);
      throw new Error(`Failed to get multiple quotes: ${error.message}`);
    }
  }

  /**
   * Get best quote from all aggregators
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
    try {
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

      // Return the first quote (already sorted by best price)
      const bestQuote = quotes[0];

      this.logger.log(
        `Best quote from ${bestQuote.aggregator}: ${bestQuote.quote.buyAmount} tokens`,
      );

      return bestQuote;
    } catch (error) {
      this.logger.error(`Failed to get best quote: ${error.message}`, error.stack);
      throw new Error(`Failed to get best quote: ${error.message}`);
    }
  }

  /**
   * Compare quotes from different aggregators
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
    try {
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

      if (quotes.length < 2) {
        return {
          quotes,
          bestAggregator: quotes[0]?.aggregator || AggregatorType.ZEROX,
          priceDifference: '0',
        };
      }

      const bestQuote = quotes[0];
      const worstQuote = quotes[quotes.length - 1];

      const bestAmount = BigInt(bestQuote.quote.buyAmount);
      const worstAmount = BigInt(worstQuote.quote.buyAmount);
      const priceDifference = ((bestAmount - worstAmount) * BigInt(10000)) / worstAmount;

      return {
        quotes,
        bestAggregator: bestQuote.aggregator,
        priceDifference: priceDifference.toString(),
      };
    } catch (error) {
      this.logger.error(`Failed to compare quotes: ${error.message}`, error.stack);
      throw new Error(`Failed to compare quotes: ${error.message}`);
    }
  }

  /**
   * Validate quote inputs
   */
  private validateQuoteInputs(
    chainId: number,
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    taker: string,
    slippagePercentage?: number,
    deadline?: number,
  ): void {
    validateChainId(chainId);
    validateTokenAddress(sellToken);
    validateTokenAddress(buyToken);
    validateWalletAddress(taker);
    validateAmount(sellAmount);

    if (slippagePercentage !== undefined) {
      validateSlippage(slippagePercentage);
    }

    if (deadline !== undefined) {
      validateDeadline(deadline);
    }

    if (sellToken === buyToken) {
      throw new Error('Sell token and buy token cannot be the same');
    }
  }

  /**
   * Get supported aggregators for a chain
   */
  getSupportedAggregators(chainId: number): AggregatorType[] {
    return this.aggregatorManager.getSupportedAggregators(chainId);
  }

  /**
   * Check if aggregator supports a chain
   */
  isAggregatorSupported(chainId: number, aggregatorType: AggregatorType): boolean {
    return this.aggregatorManager.isAggregatorSupported(chainId, aggregatorType);
  }
}
