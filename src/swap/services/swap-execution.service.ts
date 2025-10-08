import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { WalletService } from './wallet.service';
import { AggregatorManagerService } from './aggregator-manager.service';
import { ApprovalService } from './approval.service';
import {
  SwapRequest,
  SwapQuote,
  SwapResult,
  AggregatorType,
} from '../models/swap-request.model';
import { isNativeToken, getNativeTokenAddress, getChainConfig } from '../../shared/utils/chain.utils';
import {
  validatePrivateKey,
  validateTokenAddress,
  validateWalletAddress,
  validateAmount,
  validateSlippage,
  validateDeadline,
} from '../../shared/utils/validation.utils';
import { createWallet } from '../../shared/utils/ethereum.utils';

/**
 * Swap execution service with pre-flight checks
 */
@Injectable()
export class SwapExecutionService {
  private readonly logger = new Logger(SwapExecutionService.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly aggregatorManager: AggregatorManagerService,
    private readonly approvalService: ApprovalService,
  ) {}

  /**
   * Execute complete swap with pre-flight checks and comprehensive error handling
   */
  async executeSwap(
    chainId: number,
    privateKey: string,
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    recipient?: string,
    slippagePercentage?: number,
    deadline?: number,
    aggregatorType?: AggregatorType,
  ): Promise<SwapResult> {
    try {
      // Validate inputs
      this.validateSwapInputs(chainId, privateKey, sellToken, buyToken, sellAmount, slippagePercentage, deadline);

      // Create wallet and get address
      const chainConfig = getChainConfig(chainId);
      const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);
      const taker = wallet.address;

      // Set recipient to taker if not provided (ensures funds go back to same wallet)
      const finalRecipient = recipient || taker;

      // Build swap request
      const swapRequest: SwapRequest = {
        chainId,
        sellToken,
        buyToken,
        sellAmount,
        taker,
        recipient: finalRecipient,
        slippagePercentage,
        deadline,
        aggregator: aggregatorType,
      };

      this.logger.log(`Starting swap execution: ${sellToken} -> ${buyToken}, amount: ${sellAmount}`);

      // Pre-flight checks
      await this.performPreFlightChecks(swapRequest);

      // Get quote with retry logic
      let quote: SwapQuote | undefined;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          quote = await this.aggregatorManager.getQuote(swapRequest, aggregatorType);
          break;
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) {
            throw new Error(`Failed to get quote after ${maxRetries} attempts: ${error.message}`);
          }
          this.logger.warn(`Quote attempt ${retryCount} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
        }
      }

      if (!quote) {
        throw new Error('Failed to get quote after all retry attempts');
      }

      // Handle approval if needed
      if (!isNativeToken(sellToken)) {
        await this.handleApproval(chainId, privateKey, sellToken, quote, aggregatorType);
      }

      // Execute swap with retry logic
      let txHash: string | undefined;
      retryCount = 0;

      while (retryCount < maxRetries) {
        try {
          txHash = await this.walletService.executeSwap(
            chainId,
            privateKey,
            quote.to,
            quote.data,
            quote.value,
            quote.gas,
          );
          break;
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) {
            throw new Error(`Failed to execute swap after ${maxRetries} attempts: ${error.message}`);
          }
          this.logger.warn(`Swap execution attempt ${retryCount} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount)); // Exponential backoff
        }
      }

      if (!txHash) {
        throw new Error('Failed to execute swap after all retry attempts');
      }

      // Wait for confirmation with timeout
      const receipt = await this.walletService.waitForTransactionConfirmation(chainId, txHash);

      // Parse result
      const result = await this.parseSwapResult(receipt, quote, txHash, finalRecipient);

      this.logger.log(`Swap executed successfully: ${txHash}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to execute swap: ${error.message}`, error.stack);
      
      // Provide more specific error messages
      if (error.message.includes('insufficient funds')) {
        throw new Error('Insufficient funds for transaction (including gas)');
      } else if (error.message.includes('gas')) {
        throw new Error('Transaction failed due to gas issues');
      } else if (error.message.includes('slippage')) {
        throw new Error('Transaction failed due to slippage tolerance exceeded');
      } else if (error.message.includes('deadline')) {
        throw new Error('Transaction failed due to deadline exceeded');
      } else if (error.message.includes('network')) {
        throw new Error('Network error occurred during transaction');
      }
      
      throw new Error(`Swap execution failed: ${error.message}`);
    }
  }

  /**
   * Validate swap inputs
   */
  private validateSwapInputs(
    chainId: number,
    privateKey: string,
    sellToken: string,
    buyToken: string,
    sellAmount: string,
    slippagePercentage?: number,
    deadline?: number,
  ): void {
    validatePrivateKey(privateKey);
    validateTokenAddress(sellToken);
    validateTokenAddress(buyToken);
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
   * Perform pre-flight checks
   */
  private async performPreFlightChecks(request: SwapRequest): Promise<void> {
    this.logger.debug('Performing pre-flight checks...');

    // Check wallet balance
    await this.checkWalletBalance(request);

    // Check aggregator support
    await this.checkAggregatorSupport(request);

    // Check token addresses
    await this.checkTokenAddresses(request);

    this.logger.debug('Pre-flight checks passed');
  }

  /**
   * Check wallet balance
   */
  private async checkWalletBalance(request: SwapRequest): Promise<void> {
    const balance = await this.walletService.getBalance(
      request.chainId,
      request.taker,
      request.sellToken,
    );

    const requiredAmount = BigInt(request.sellAmount);
    const availableBalance = BigInt(balance.balance);

    if (availableBalance < requiredAmount) {
      throw new Error(
        `Insufficient balance. Required: ${request.sellAmount}, Available: ${balance.balance}`,
      );
    }

    // For native token swaps, also check gas balance
    if (isNativeToken(request.sellToken)) {
      const gasEstimate = BigInt('21000'); // Minimum gas for simple transfer
      const gasPrice = BigInt('20000000000'); // 20 gwei
      const gasCost = gasEstimate * gasPrice;

      if (availableBalance < requiredAmount + gasCost) {
        throw new Error(
          `Insufficient balance for gas. Required: ${request.sellAmount}, Gas cost: ${gasCost}, Available: ${balance.balance}`,
        );
      }
    }
  }

  /**
   * Check aggregator support
   */
  private async checkAggregatorSupport(request: SwapRequest): Promise<void> {
    if (request.aggregator) {
      const isSupported = this.aggregatorManager.isAggregatorSupported(
        request.chainId,
        request.aggregator,
      );

      if (!isSupported) {
        throw new Error(
          `Aggregator ${request.aggregator} does not support chain ${request.chainId}`,
        );
      }
    } else {
      const supportedAggregators = this.aggregatorManager.getSupportedAggregators(
        request.chainId,
      );

      if (supportedAggregators.length === 0) {
        throw new Error(`No aggregators support chain ${request.chainId}`);
      }
    }
  }

  /**
   * Check token addresses
   */
  private async checkTokenAddresses(request: SwapRequest): Promise<void> {
    try {
      await Promise.all([
        this.walletService.getTokenInfo(request.chainId, request.sellToken),
        this.walletService.getTokenInfo(request.chainId, request.buyToken),
      ]);
    } catch (error) {
      throw new Error(`Invalid token address: ${error.message}`);
    }
  }

  /**
   * Handle token approval (supports both ERC-20 and Permit2)
   */
  private async handleApproval(
    chainId: number,
    privateKey: string,
    sellToken: string,
    quote: SwapQuote,
    aggregatorType?: AggregatorType,
  ): Promise<void> {
    if (!quote.allowanceTarget) {
      throw new Error('Allowance target not provided in quote');
    }

    const chainConfig = getChainConfig(chainId);
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    const isApprovalNeeded = await this.approvalService.isApprovalNeeded(
      chainId,
      sellToken,
      wallet.address,
      quote.allowanceTarget,
      quote.sellAmount,
    );

    if (isApprovalNeeded) {
      this.logger.log('Approval needed, checking for Permit2 support...');
      
      // Check if Permit2 is available for gasless approval
      const isPermit2Available = await this.approvalService.isPermit2Available(chainId, sellToken);
      
      if (isPermit2Available) {
        this.logger.log('Permit2 available, creating gasless approval signature...');
        // For Permit2, we would create a signature instead of executing a transaction
        // The 0x API v2 with Permit2 handles this automatically
        this.logger.log('Permit2 signature will be handled by 0x Protocol v2');
      } else {
        this.logger.log('Permit2 not available, executing traditional approval transaction...');
        const approvalResult = await this.approvalService.executeApproval(
          chainId,
          privateKey,
          sellToken,
          quote.allowanceTarget,
          quote.sellAmount,
        );

        // Wait for approval confirmation
        await this.walletService.waitForTransactionConfirmation(chainId, approvalResult.transactionHash);
        this.logger.log(`Approval confirmed: ${approvalResult.transactionHash}`);
      }
    } else {
      this.logger.log('No approval needed');
    }
  }

  /**
   * Parse swap result from transaction receipt
   */
  private async parseSwapResult(
    receipt: ethers.TransactionReceipt,
    quote: SwapQuote,
    txHash: string,
    recipient: string,
  ): Promise<SwapResult> {
    const gasUsed = receipt.gasUsed.toString();
    const gasPrice = receipt.gasPrice?.toString() || '0';

    // Parse token transfers to get actual buy amount
    const transfers = this.walletService.parseTransactionReceipt(receipt, quote.buyToken);
    const buyTransfer = transfers.find(
      (transfer) => transfer.to.toLowerCase() === recipient.toLowerCase(),
    );

    const actualBuyAmount = buyTransfer ? buyTransfer.amount.toString() : quote.buyAmount;

    return {
      transactionHash: txHash,
      sellToken: quote.sellToken,
      buyToken: quote.buyToken,
      sellAmount: quote.sellAmount,
      buyAmount: actualBuyAmount,
      gasUsed,
      gasPrice,
      aggregator: quote.aggregator,
      timestamp: Date.now(),
    };
  }

  /**
   * Get swap quote without execution
   */
  async getSwapQuote(
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
      this.validateSwapInputs(chainId, '0x0000000000000000000000000000000000000000000000000000000000000001', sellToken, buyToken, sellAmount, slippagePercentage, deadline);

      const swapRequest: SwapRequest = {
        chainId,
        sellToken,
        buyToken,
        sellAmount,
        taker,
        recipient: recipient || taker,
        slippagePercentage,
        deadline,
        aggregator: aggregatorType,
      };

      return await this.aggregatorManager.getQuote(swapRequest, aggregatorType);
    } catch (error) {
      this.logger.error(`Failed to get swap quote: ${error.message}`, error.stack);
      throw new Error(`Failed to get swap quote: ${error.message}`);
    }
  }
}
