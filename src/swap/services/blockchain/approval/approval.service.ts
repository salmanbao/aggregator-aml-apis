import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { WalletService } from '@swap/services/blockchain/wallet/wallet.service';
import { AggregatorManagerService } from '@swap/services/core/aggregation/aggregator-manager.service';
import { Permit2Service } from './permit2.service';
import { ApprovalResult, AggregatorType } from '@swap/models/swap-request.model';
import { isNativeToken } from '@shared/utils/chain.utils';
import { validatePrivateKey, validateTokenAddress, validateWalletAddress } from '@shared/utils/validation.utils';

/**
 * Approval service for handling ERC-20 token approvals
 */
@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly aggregatorManager: AggregatorManagerService,
    private readonly permit2Service: Permit2Service,
  ) {}

  /**
   * Check if approval is needed (supports both ERC-20 and Permit2)
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

      // Check if Permit2 is supported and token is compatible
      if (this.permit2Service.isPermit2Supported(chainId)) {
        const isPermit2Compatible = await this.permit2Service.isTokenPermit2Compatible(chainId, tokenAddress);
        if (isPermit2Compatible) {
          return await this.permit2Service.isPermit2ApprovalNeeded(chainId, tokenAddress, owner, spender, amount);
        }
      }

      // Fallback to traditional ERC-20 approval check
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
      
      // Check if it's a validation error
      if (this.isValidationError(error)) {
        throw new BadRequestException(error.message);
      }
      
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
    amount?: string,
  ): Promise<{
    currentAllowance: string;
    isApprovalNeeded: boolean;
    tokenInfo: any;
    isPermit2Compatible?: boolean;
    permit2Address?: string;
  }> {
    try {
      // Validate inputs
      if (!chainId || chainId <= 0) {
        throw new Error('Invalid chain ID');
      }
      validateTokenAddress(tokenAddress);
      validateWalletAddress(owner);
      validateWalletAddress(spender);

      // Native tokens don't need approval
      if (isNativeToken(tokenAddress)) {
        return {
          currentAllowance: '0',
          isApprovalNeeded: false,
          tokenInfo: null,
          isPermit2Compatible: false,
        };
      }

      const [currentAllowance, tokenInfo] = await Promise.all([
        this.walletService.getAllowance(chainId, tokenAddress, owner, spender),
        this.walletService.getTokenInfo(chainId, tokenAddress),
      ]);

      // Check Permit2 compatibility
      let isPermit2Compatible = false;
      let permit2Address: string | undefined;
      
      if (this.permit2Service.isPermit2Supported(chainId)) {
        try {
          isPermit2Compatible = await this.permit2Service.isTokenPermit2Compatible(chainId, tokenAddress);
          if (isPermit2Compatible) {
            permit2Address = this.permit2Service.getPermit2Address(chainId);
          }
        } catch (error) {
          this.logger.warn(`Failed to check Permit2 compatibility: ${error.message}`);
        }
      }

      // Determine if approval is needed
      let isApprovalNeeded = false;
      
      if (amount) {
        // If amount is provided, check if current allowance is sufficient
        const requiredAmount = BigInt(amount);
        const currentAllowanceBigInt = BigInt(currentAllowance);
        isApprovalNeeded = currentAllowanceBigInt < requiredAmount;
      } else {
        // If no amount provided, approval is needed if allowance is 0
        isApprovalNeeded = BigInt(currentAllowance) === BigInt(0);
      }

      return {
        currentAllowance,
        isApprovalNeeded,
        tokenInfo,
        isPermit2Compatible,
        permit2Address,
      };
    } catch (error) {
      this.logger.error(`Failed to get approval status: ${error.message}`, error.stack);
      
      // Check if it's a validation error
      if (this.isValidationError(error)) {
        throw new BadRequestException(error.message);
      }
      
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
      
      // Check if it's a validation error
      if (this.isValidationError(error)) {
        throw new BadRequestException(error.message);
      }
      
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

  /**
   * Create Permit2 signature for gasless approval
   */
  async createPermit2Signature(
    chainId: number,
    privateKey: string,
    tokenAddress: string,
    spender: string,
    amount: string,
    deadline: number,
  ): Promise<{
    signature: string;
    permitData: any;
  }> {
    try {
      validatePrivateKey(privateKey);
      validateTokenAddress(tokenAddress);
      validateWalletAddress(spender);

      if (isNativeToken(tokenAddress)) {
        throw new Error('Cannot create Permit2 signature for native token');
      }

      if (!this.permit2Service.isPermit2Supported(chainId)) {
        throw new Error(`Permit2 not supported on chain ${chainId}`);
      }

      const isPermit2Compatible = await this.permit2Service.isTokenPermit2Compatible(chainId, tokenAddress);
      if (!isPermit2Compatible) {
        throw new Error(`Token ${tokenAddress} is not Permit2 compatible`);
      }

      // Permit2 signatures temporarily disabled during migration
      throw new Error('Permit2 signatures temporarily disabled. Use standard ERC-20 approvals or new permit2 workflow service.');
    } catch (error) {
      this.logger.error(`Failed to create Permit2 signature: ${error.message}`, error.stack);
      
      // Check if it's a validation error
      if (this.isValidationError(error)) {
        throw new BadRequestException(error.message);
      }
      
      throw new Error(`Failed to create Permit2 signature: ${error.message}`);
    }
  }

  /**
   * Check if Permit2 is supported and token is compatible
   */
  async isPermit2Available(
    chainId: number,
    tokenAddress: string,
  ): Promise<boolean> {
    try {
      if (isNativeToken(tokenAddress)) {
        return false;
      }

      if (!this.permit2Service.isPermit2Supported(chainId)) {
        return false;
      }

      return await this.permit2Service.isTokenPermit2Compatible(chainId, tokenAddress);
    } catch (error) {
      this.logger.error(`Failed to check Permit2 availability: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Check if an error is a validation error (should return 400 status)
   */
  private isValidationError(error: any): boolean {
    const validationErrorMessages = [
      'Invalid chain ID',
      'Invalid token address',
      'Invalid wallet address',
      'Invalid private key',
      'Cannot approve native token',
      'Cannot create Permit2 signature for native token',
      'Permit2 not supported',
      'not Permit2 compatible',
    ];
    
    return validationErrorMessages.some(msg => 
      error?.message?.includes(msg)
    );
  }
}
