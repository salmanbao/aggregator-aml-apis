import { Injectable, Logger, BadRequestException } from '@nestjs/common';
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
      
      // If it's a validation error (from our validation functions), throw BadRequestException
      if (this.isValidationError(error)) {
        throw new BadRequestException(error.message);
      }
      
      // For other errors, throw a generic error
      throw new Error(`Failed to get quote: ${error.message}`);
    }
  }

  /**
   * Get quotes from 0x Protocol v2
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

      // Only get quote from 0x Protocol v2
      const quote = await this.getQuote(
        chainId,
        sellToken,
        buyToken,
        sellAmount,
        taker,
        recipient,
        slippagePercentage,
        deadline,
        AggregatorType.ZEROX,
      );

      return [{ aggregator: AggregatorType.ZEROX, quote }];
    } catch (error) {
      this.logger.error(`Failed to get 0x quote: ${error.message}`, error.stack);
      
      // If it's a validation error, throw BadRequestException
      if (this.isValidationError(error)) {
        throw new BadRequestException(error.message);
      }
      
      throw new Error(`Failed to get 0x quote: ${error.message}`);
    }
  }

  /**
   * Get best quote from 0x Protocol v2
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

      // Return the 0x quote
      const bestQuote = quotes[0];

      this.logger.log(
        `Best quote from ${bestQuote.aggregator}: ${bestQuote.quote.buyAmount} tokens`,
      );

      return bestQuote;
    } catch (error) {
      this.logger.error(`Failed to get best quote: ${error.message}`, error.stack);
      
      // If it's a validation error, throw BadRequestException
      if (this.isValidationError(error)) {
        throw new BadRequestException(error.message);
      }
      
      throw new Error(`Failed to get best quote: ${error.message}`);
    }
  }

  /**
   * Compare quotes from 0x Protocol v2 (simplified since only one aggregator)
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

      // Since we only have 0x Protocol, return the single quote
      return {
        quotes,
        bestAggregator: AggregatorType.ZEROX,
        priceDifference: '0', // No comparison since only one aggregator
      };
    } catch (error) {
      this.logger.error(`Failed to compare quotes: ${error.message}`, error.stack);
      
      // If it's a validation error, throw BadRequestException
      if (this.isValidationError(error)) {
        throw new BadRequestException(error.message);
      }
      
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
   * Get supported aggregators for a chain (only 0x Protocol)
   */
  getSupportedAggregators(chainId: number): AggregatorType[] {
    return this.aggregatorManager.getSupportedAggregators(chainId);
  }

  /**
   * Check if aggregator supports a chain (only 0x Protocol)
   */
  isAggregatorSupported(chainId: number, aggregatorType: AggregatorType): boolean {
    return this.aggregatorManager.isAggregatorSupported(chainId, aggregatorType);
  }

  /**
   * Check if an error is a validation error (should return 400 status)
   */
  private isValidationError(error: any): boolean {
    const validationErrorMessages = [
      'Invalid chain ID',
      'Invalid token address',
      'Invalid wallet address', 
      'Invalid amount',
      'Invalid slippage',
      'Deadline must be',
      'Sell token and buy token cannot be the same',
    ];
    
    return validationErrorMessages.some(msg => 
      error?.message?.includes(msg)
    );
  }
}

