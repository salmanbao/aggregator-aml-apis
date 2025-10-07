import { Injectable, Logger } from '@nestjs/common';
import { ZeroXService } from './aggregators/zero-x.service';
import { OneInchService } from './aggregators/one-inch.service';
import { ParaSwapService } from './aggregators/paraswap.service';
import { CowService } from './aggregators/cow.service';
import { SwapRequest, SwapQuote, AggregatorType } from '../models/swap-request.model';

/**
 * Aggregator manager service that coordinates between different aggregators
 */
@Injectable()
export class AggregatorManagerService {
  private readonly logger = new Logger(AggregatorManagerService.name);
  private readonly aggregators: Map<AggregatorType, any> = new Map();

  constructor(
    private readonly zeroXService: ZeroXService,
    private readonly oneInchService: OneInchService,
    private readonly paraSwapService: ParaSwapService,
    private readonly cowService: CowService,
  ) {
    this.aggregators.set(AggregatorType.ZEROX, zeroXService);
    this.aggregators.set(AggregatorType.ONEINCH, oneInchService);
    this.aggregators.set(AggregatorType.PARASWAP, paraSwapService);
    this.aggregators.set(AggregatorType.COW, cowService);
  }

  /**
   * Get quote from specified aggregator
   */
  async getQuote(request: SwapRequest, aggregatorType?: AggregatorType): Promise<SwapQuote> {
    if (aggregatorType) {
      return this.getQuoteFromAggregator(request, aggregatorType);
    }

    // Get quotes from all supported aggregators and return the best one
    return this.getBestQuote(request);
  }

  /**
   * Get quote from specific aggregator
   */
  private async getQuoteFromAggregator(
    request: SwapRequest,
    aggregatorType: AggregatorType,
  ): Promise<SwapQuote> {
    const aggregator = this.aggregators.get(aggregatorType);
    if (!aggregator) {
      throw new Error(`Unsupported aggregator: ${aggregatorType}`);
    }

    if (!aggregator.isChainSupported(request.chainId)) {
      throw new Error(`Aggregator ${aggregatorType} does not support chain ${request.chainId}`);
    }

    return aggregator.getQuote(request);
  }

  /**
   * Get best quote from all supported aggregators
   */
  private async getBestQuote(request: SwapRequest): Promise<SwapQuote> {
    const quotes: Array<{ quote: SwapQuote; aggregator: AggregatorType }> = [];

    // Try to get quotes from all supported aggregators
    for (const [aggregatorType, aggregator] of this.aggregators) {
      try {
        if (aggregator.isChainSupported(request.chainId)) {
          const quote = await aggregator.getQuote(request);
          quotes.push({ quote, aggregator: aggregatorType });
        }
      } catch (error) {
        this.logger.warn(`Failed to get quote from ${aggregatorType}: ${error.message}`);
      }
    }

    if (quotes.length === 0) {
      throw new Error('No aggregators available for the requested chain');
    }

    // Return the quote with the highest buy amount (best price)
    const bestQuote = quotes.reduce((best, current) => {
      const bestAmount = BigInt(best.quote.buyAmount);
      const currentAmount = BigInt(current.quote.buyAmount);
      return currentAmount > bestAmount ? current : best;
    });

    this.logger.log(`Best quote from ${bestQuote.aggregator}: ${bestQuote.quote.buyAmount} tokens`);
    return bestQuote.quote;
  }

  /**
   * Get spender address for a specific aggregator
   */
  async getSpenderAddress(chainId: number, aggregatorType: AggregatorType): Promise<string> {
    const aggregator = this.aggregators.get(aggregatorType);
    if (!aggregator) {
      throw new Error(`Unsupported aggregator: ${aggregatorType}`);
    }

    if (!aggregator.isChainSupported(chainId)) {
      throw new Error(`Aggregator ${aggregatorType} does not support chain ${chainId}`);
    }

    return aggregator.getSpenderAddress(chainId);
  }

  /**
   * Get token list from a specific aggregator
   */
  async getTokenList(chainId: number, aggregatorType: AggregatorType): Promise<any[]> {
    const aggregator = this.aggregators.get(aggregatorType);
    if (!aggregator) {
      throw new Error(`Unsupported aggregator: ${aggregatorType}`);
    }

    if (!aggregator.isChainSupported(chainId)) {
      throw new Error(`Aggregator ${aggregatorType} does not support chain ${chainId}`);
    }

    return aggregator.getTokenList(chainId);
  }

  /**
   * Get supported aggregators for a chain
   */
  getSupportedAggregators(chainId: number): AggregatorType[] {
    const supported: AggregatorType[] = [];

    for (const [aggregatorType, aggregator] of this.aggregators) {
      if (aggregator.isChainSupported(chainId)) {
        supported.push(aggregatorType);
      }
    }

    return supported;
  }

  /**
   * Check if aggregator supports a chain
   */
  isAggregatorSupported(chainId: number, aggregatorType: AggregatorType): boolean {
    const aggregator = this.aggregators.get(aggregatorType);
    return aggregator ? aggregator.isChainSupported(chainId) : false;
  }
}
