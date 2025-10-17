import { Injectable, Logger } from '@nestjs/common';
import { Permit2Service } from './permit2.service';
import { SwapQuote, Permit2Data } from '@swap/models/swap-request.model';

/**
 * Permit2 workflow service for demonstrating gasless approval flow
 * 
 * This service provides helper methods to:
 * 1. Check if permit2 data is available in quote
 * 2. Sign permit2 EIP-712 data 
 * 3. Append signature to transaction data
 * 4. Prepare final transaction for submission
 */
@Injectable()
export class Permit2WorkflowService {
  private readonly logger = new Logger(Permit2WorkflowService.name);

  constructor(private readonly permit2Service: Permit2Service) {}

  /**
   * Check if quote contains permit2 data for gasless approval
   */
  hasPermit2Data(quote: SwapQuote): boolean {
    return quote.permit2 !== null && quote.permit2 !== undefined;
  }

  /**
   * Complete permit2 workflow: sign permit2 data and prepare transaction
   * 
   * Example usage:
   * ```typescript
   * const quote = await quoteService.getQuote(...);
   * if (permit2WorkflowService.hasPermit2Data(quote)) {
   *   const { transactionData, signature } = await permit2WorkflowService.processPermit2Quote(
   *     quote, 
   *     'your-private-key', 
   *     1 // chainId
   *   );
   *   // Submit transaction with modified transactionData
   * }
   * ```
   */
  async processPermit2Quote(
    quote: SwapQuote,
    privateKey: string,
    chainId: number
  ): Promise<{
    originalTxData: string;
    signature: string;
    modifiedTxData: string;
    permit2Data: Permit2Data;
  }> {
    if (!this.hasPermit2Data(quote)) {
      throw new Error('Quote does not contain permit2 data');
    }

    const permit2Data = quote.permit2!;

    this.logger.debug('Processing permit2 quote', {
      permitType: permit2Data.type,
      permitHash: permit2Data.hash,
      primaryType: permit2Data.eip712.primaryType
    });

    try {
      // Step 1: Sign the permit2 EIP-712 data
      this.logger.debug('Signing permit2 EIP-712 data...');
      const signature = await this.permit2Service.signPermit2Data(
        chainId,
        privateKey,
        permit2Data
      );

      // Step 2: Append signature to transaction data
      this.logger.debug('Appending signature to transaction data...');
      const modifiedTxData = await this.permit2Service.appendSignatureToTxData(
        quote.data,
        signature
      );

      this.logger.log('Permit2 workflow completed successfully', {
        originalDataLength: quote.data.length,
        signatureLength: signature.length,
        modifiedDataLength: modifiedTxData.length
      });

      return {
        originalTxData: quote.data,
        signature,
        modifiedTxData,
        permit2Data
      };
    } catch (error) {
      this.logger.error(`Permit2 workflow failed: ${error.message}`, error.stack);
      throw new Error(`Permit2 workflow failed: ${error.message}`);
    }
  }

  /**
   * Create modified quote with permit2 signature for immediate submission
   * This returns a new quote object with the modified transaction data
   */
  async createSignedQuote(
    quote: SwapQuote,
    privateKey: string,
    chainId: number
  ): Promise<SwapQuote> {
    const result = await this.processPermit2Quote(quote, privateKey, chainId);

    return {
      ...quote,
      data: result.modifiedTxData, // Use modified transaction data with signature
    };
  }

  /**
   * Validate permit2 data structure
   */
  validatePermit2Data(permit2Data: any): boolean {
    if (!permit2Data) return false;
    if (!permit2Data.type || !permit2Data.hash || !permit2Data.eip712) return false;
    if (!permit2Data.eip712.types || !permit2Data.eip712.domain || !permit2Data.eip712.message) return false;
    if (!permit2Data.eip712.primaryType) return false;
    return true;
  }

  /**
   * Extract permit2 information for debugging/logging
   */
  getPermit2Info(quote: SwapQuote): {
    hasPermit2: boolean;
    type?: string;
    hash?: string;
    primaryType?: string;
    domain?: any;
    messageKeys?: string[];
  } {
    if (!this.hasPermit2Data(quote)) {
      return { hasPermit2: false };
    }

    const permit2Data = quote.permit2!;
    return {
      hasPermit2: true,
      type: permit2Data.type,
      hash: permit2Data.hash,
      primaryType: permit2Data.eip712.primaryType,
      domain: permit2Data.eip712.domain,
      messageKeys: Object.keys(permit2Data.eip712.message)
    };
  }
}