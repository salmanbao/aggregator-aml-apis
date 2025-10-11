import { Injectable, Logger } from '@nestjs/common';
import { ZeroXService } from '@swap/services/providers/evm-aggregators/zero-x.service';
import { SwapRequest, SwapQuote, AggregatorType, ApprovalStrategy } from '@swap/models/swap-request.model';

/**
 * Aggregator manager service that coordinates with 0x Protocol v2
 */
@Injectable()
export class AggregatorManagerService {
  private readonly logger = new Logger(AggregatorManagerService.name);
  private readonly aggregators: Map<AggregatorType, any> = new Map();

  constructor(
    private readonly zeroXService: ZeroXService,
  ) {
    this.aggregators.set(AggregatorType.ZEROX, this.zeroXService);
  }

  /**
   * Get quote from 0x Protocol v2 with approval strategy support
   */
  async getQuote(request: SwapRequest, aggregatorType?: AggregatorType): Promise<SwapQuote> {
    // Only support 0x Protocol v2
    if (aggregatorType && aggregatorType !== AggregatorType.ZEROX) {
      throw new Error(`Only 0x Protocol is supported. Requested: ${aggregatorType}`);
    }

    return this.getQuoteFromAggregator(request, AggregatorType.ZEROX);
  }

  /**
   * Get price from 0x Protocol v2 with approval strategy support
   */
  async getPrice(request: SwapRequest, aggregatorType?: AggregatorType, approvalStrategy?: ApprovalStrategy): Promise<any> {
    // Only support 0x Protocol v2
    if (aggregatorType && aggregatorType !== AggregatorType.ZEROX) {
      throw new Error(`Only 0x Protocol is supported. Requested: ${aggregatorType}`);
    }

    return this.getPriceFromAggregator(request, AggregatorType.ZEROX, approvalStrategy);
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

    if (!aggregator.supportsChain(request.chainId)) {
      throw new Error(`Aggregator ${aggregatorType} does not support chain ${request.chainId}`);
    }

    // Use strategy-specific method if available
    if (request.approvalStrategy === ApprovalStrategy.ALLOWANCE_HOLDER) {
      return aggregator.getAllowanceHolderQuote(request);
    } else if (request.approvalStrategy === ApprovalStrategy.PERMIT2) {
      return aggregator.getPermit2Quote(request);
    } else {
      // Default to permit2 for backwards compatibility
      return aggregator.getQuote(request);
    }
  }

  /**
   * Get price from specific aggregator
   */
  private async getPriceFromAggregator(
    request: SwapRequest,
    aggregatorType: AggregatorType,
    approvalStrategy?: ApprovalStrategy,
  ): Promise<any> {
    const aggregator = this.aggregators.get(aggregatorType);
    if (!aggregator) {
      throw new Error(`Unsupported aggregator: ${aggregatorType}`);
    }

    if (!aggregator.supportsChain(request.chainId)) {
      throw new Error(`Aggregator ${aggregatorType} does not support chain ${request.chainId}`);
    }

    // Use strategy-specific method if available
    if (approvalStrategy === ApprovalStrategy.ALLOWANCE_HOLDER) {
      return aggregator.getAllowanceHolderPrice(request);
    } else if (approvalStrategy === ApprovalStrategy.PERMIT2) {
      return aggregator.getPermit2Price(request);
    } else {
      // Default to permit2 for backwards compatibility
      return aggregator.getPrice(request);
    }
  }

  /**
   * Get best quote from 0x Protocol v2
   */
  private async getBestQuote(request: SwapRequest): Promise<SwapQuote> {
    // Only use 0x Protocol v2
    const aggregator = this.aggregators.get(AggregatorType.ZEROX);
    
    if (!aggregator) {
      throw new Error('0x Protocol service not available');
    }

    if (!aggregator.supportsChain(request.chainId)) {
      throw new Error(`0x Protocol does not support chain ${request.chainId}`);
    }

    try {
      const quote = await aggregator.getQuote(request);
      this.logger.log(`0x Protocol v2 quote: ${quote.buyAmount} tokens`);
      return quote;
    } catch (error) {
      this.logger.error(`Failed to get quote from 0x Protocol: ${error.message}`);
      throw new Error(`0x Protocol quote failed: ${error.message}`);
    }
  }

  /**
   * Get spender address for 0x Protocol
   */
  async getSpenderAddress(chainId: number, aggregatorType: AggregatorType): Promise<string> {
    if (aggregatorType !== AggregatorType.ZEROX) {
      throw new Error(`Only 0x Protocol is supported. Requested: ${aggregatorType}`);
    }

    const aggregator = this.aggregators.get(AggregatorType.ZEROX);
    if (!aggregator) {
      throw new Error('0x Protocol service not available');
    }

    if (!aggregator.supportsChain(chainId)) {
      throw new Error(`0x Protocol does not support chain ${chainId}`);
    }

    return aggregator.getSpenderAddress(chainId);
  }

  /**
   * Get token list from 0x Protocol
   */
  async getTokenList(chainId: number, aggregatorType: AggregatorType): Promise<any[]> {
    if (aggregatorType !== AggregatorType.ZEROX) {
      throw new Error(`Only 0x Protocol is supported. Requested: ${aggregatorType}`);
    }

    const aggregator = this.aggregators.get(AggregatorType.ZEROX);
    if (!aggregator) {
      throw new Error('0x Protocol service not available');
    }

    if (!aggregator.supportsChain(chainId)) {
      throw new Error(`0x Protocol does not support chain ${chainId}`);
    }

    return aggregator.getTokenList(chainId);
  }

  /**
   * Get supported aggregators for a chain (only 0x Protocol)
   */
  getSupportedAggregators(chainId: number): AggregatorType[] {
    const aggregator = this.aggregators.get(AggregatorType.ZEROX);
    if (aggregator && aggregator.supportsChain(chainId)) {
      this.logger.log(`Aggregator ${AggregatorType.ZEROX} is supported for chain ${chainId}`);
      return [AggregatorType.ZEROX];
    }

    return [];
  }

  /**
   * Check if aggregator supports a chain (only 0x Protocol)
   */
  isAggregatorSupported(chainId: number, aggregatorType: AggregatorType): boolean {
    if (aggregatorType !== AggregatorType.ZEROX) {
      return false;
    }

    const aggregator = this.aggregators.get(AggregatorType.ZEROX);
    return aggregator ? aggregator.supportsChain(chainId) : false;
  }
}
