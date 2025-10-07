import { Injectable, Logger } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { AggregatorManagerService } from './aggregator-manager.service';
import { ApprovalRequest, ApprovalResult, AggregatorType } from '../models/swap-request.model';
import { isNativeToken } from '../../shared/utils/chain.utils';
import { validatePrivateKey, validateTokenAddress, validateWalletAddress } from '../../shared/utils/validation.utils';

/**
 * Approval service for handling ERC-20 token approvals
 */
@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly aggregatorManager: AggregatorManagerService,
  ) {}

  /**
   * Check if approval is needed
   */
  async isApprovalNeeded(
    chainId: number,
    tokenAddress: string,
    owner: string,
    spender: string,
    amount: string,
  ): Promise<boolean> {
    try {
      if (isNativeToken(tokenAddress)) {
        return false; // Native tokens don't need approval
      }

      const currentAllowance = await this.walletService.getAllowance(
        chainId,
        tokenAddress,
        owner,
        spender,
      );

      const requiredAmount = BigInt(amount);
      const currentAllowanceBigInt = BigInt(currentAllowance);

      return currentAllowanceBigInt < requiredAmount;
    } catch (error) {
      this.logger.error(`Failed to check approval status: ${error.message}`, error.stack);
      throw new Error(`Failed to check approval status: ${error.message}`);
    }
  }

  /**
   * Get approval status
   */
  async getApprovalStatus(
    chainId: number,
    tokenAddress: string,
    owner: string,
    spender: string,
  ): Promise<{
    currentAllowance: string;
    isApprovalNeeded: boolean;
    tokenInfo: any;
  }> {
    try {
      validateTokenAddress(tokenAddress);
      validateWalletAddress(owner);
      validateWalletAddress(spender);

      const [currentAllowance, tokenInfo] = await Promise.all([
        this.walletService.getAllowance(chainId, tokenAddress, owner, spender),
        this.walletService.getTokenInfo(chainId, tokenAddress),
      ]);

      return {
        currentAllowance,
        isApprovalNeeded: !isNativeToken(tokenAddress) && BigInt(currentAllowance) > BigInt(0),
        tokenInfo,
      };
    } catch (error) {
      this.logger.error(`Failed to get approval status: ${error.message}`, error.stack);
      throw new Error(`Failed to get approval status: ${error.message}`);
    }
  }

  /**
   * Execute approval transaction
   */
  async executeApproval(
    chainId: number,
    privateKey: string,
    tokenAddress: string,
    spender: string,
    amount: string,
  ): Promise<ApprovalResult> {
    try {
      validatePrivateKey(privateKey);
      validateTokenAddress(tokenAddress);
      validateWalletAddress(spender);

      if (isNativeToken(tokenAddress)) {
        throw new Error('Cannot approve native token');
      }

      const txHash = await this.walletService.executeApproval(
        chainId,
        privateKey,
        tokenAddress,
        spender,
        amount,
      );

      this.logger.log(`Approval transaction executed: ${txHash}`);

      return {
        transactionHash: txHash,
        tokenAddress,
        spender,
        amount,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(`Failed to execute approval: ${error.message}`, error.stack);
      throw new Error(`Failed to execute approval: ${error.message}`);
    }
  }

  /**
   * Get spender address for aggregator
   */
  async getSpenderAddress(
    chainId: number,
    aggregatorType: AggregatorType,
  ): Promise<string> {
    try {
      return await this.aggregatorManager.getSpenderAddress(chainId, aggregatorType);
    } catch (error) {
      this.logger.error(`Failed to get spender address: ${error.message}`, error.stack);
      throw new Error(`Failed to get spender address: ${error.message}`);
    }
  }

  /**
   * Prepare approval for swap
   */
  async prepareApprovalForSwap(
    chainId: number,
    tokenAddress: string,
    owner: string,
    aggregatorType: AggregatorType,
    amount: string,
  ): Promise<{
    isApprovalNeeded: boolean;
    spenderAddress: string;
    currentAllowance: string;
    approvalAmount: string;
  }> {
    try {
      if (isNativeToken(tokenAddress)) {
        return {
          isApprovalNeeded: false,
          spenderAddress: '',
          currentAllowance: '0',
          approvalAmount: '0',
        };
      }

      const spenderAddress = await this.getSpenderAddress(chainId, aggregatorType);
      const currentAllowance = await this.walletService.getAllowance(
        chainId,
        tokenAddress,
        owner,
        spenderAddress,
      );

      const isApprovalNeeded = BigInt(currentAllowance) < BigInt(amount);

      return {
        isApprovalNeeded,
        spenderAddress,
        currentAllowance,
        approvalAmount: amount,
      };
    } catch (error) {
      this.logger.error(`Failed to prepare approval for swap: ${error.message}`, error.stack);
      throw new Error(`Failed to prepare approval for swap: ${error.message}`);
    }
  }

  /**
   * Revoke approval (set to 0)
   */
  async revokeApproval(
    chainId: number,
    privateKey: string,
    tokenAddress: string,
    spender: string,
  ): Promise<ApprovalResult> {
    try {
      return await this.executeApproval(chainId, privateKey, tokenAddress, spender, '0');
    } catch (error) {
      this.logger.error(`Failed to revoke approval: ${error.message}`, error.stack);
      throw new Error(`Failed to revoke approval: ${error.message}`);
    }
  }

  /**
   * Get approval transaction status
   */
  async getApprovalTransactionStatus(
    chainId: number,
    txHash: string,
  ): Promise<{
    status: 'pending' | 'confirmed' | 'failed';
    receipt?: any;
  }> {
    try {
      return await this.walletService.getTransactionStatus(chainId, txHash);
    } catch (error) {
      this.logger.error(`Failed to get approval transaction status: ${error.message}`, error.stack);
      throw new Error(`Failed to get approval transaction status: ${error.message}`);
    }
  }

  /**
   * Wait for approval transaction confirmation
   */
  async waitForApprovalConfirmation(
    chainId: number,
    txHash: string,
    confirmations: number = 1,
  ): Promise<any> {
    try {
      return await this.walletService.waitForTransactionConfirmation(
        chainId,
        txHash,
        confirmations,
      );
    } catch (error) {
      this.logger.error(`Failed to wait for approval confirmation: ${error.message}`, error.stack);
      throw new Error(`Failed to wait for approval confirmation: ${error.message}`);
    }
  }
}
