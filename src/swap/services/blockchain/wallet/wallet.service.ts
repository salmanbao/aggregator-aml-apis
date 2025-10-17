import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { BalanceInfo, TokenInfo } from '@swap/models/swap-request.model';
import { IWalletProvider } from './ports/wallet-provider.interface';
import { IWalletProviderRegistry } from './ports/wallet-provider-registry.interface';
import { TransactionReceipt } from 'viem';

/**
 * Unified wallet service that manages multi-chain wallet operations
 * Routes requests to appropriate blockchain-specific wallet providers
 * NOW WITH SELF-REGISTRATION: Wallet providers register themselves automatically
 */
@Injectable()
export class WalletService implements IWalletProviderRegistry {
  private readonly logger = new Logger(WalletService.name);
  private readonly providers: Map<string, IWalletProvider> = new Map();
  private registrationComplete = false;

  constructor() {
    this.logger.log('🚀 WalletService initialized - awaiting wallet provider self-registration');
  }

  /**
   * Register a wallet provider (called by providers themselves)
   */
  registerWalletProvider(provider: IWalletProvider): void {
    const ecosystem = provider.getEcosystem();
    
    if (this.providers.has(ecosystem)) {
      this.logger.warn(`⚠️ Wallet provider '${ecosystem}' already registered, skipping duplicate`);
      return;
    }
    
    this.providers.set(ecosystem, provider);
    this.logger.log(`✅ Self-registered wallet provider: ${ecosystem}`);
  }

  /**
   * Mark registration as complete and log summary
   */
  onRegistrationComplete(): void {
    if (this.registrationComplete) return;
    
    this.registrationComplete = true;
    this.logger.log(
      `📊 Wallet provider registration complete - Total: ${this.providers.size} providers`
    );
    
    if (this.providers.size > 0) {
      this.logger.log(`  🔗 Registered ecosystems: ${Array.from(this.providers.keys()).join(', ')}`);
    }
  }

  /**
   * Get all registered wallet providers
   */
  getWalletProviders(): Map<string, IWalletProvider> {
    return this.providers;
  }

  /**
   * Get wallet provider by ecosystem
   */
  getWalletProvider(ecosystem: string): IWalletProvider | undefined {
    return this.providers.get(ecosystem.toLowerCase());
  }

  /**
   * Get appropriate wallet provider for a chain
   */
  private getProviderForChain(chainId: number | string, ecosystem?: string): IWalletProvider {
    // If ecosystem is specified, use it directly
    if (ecosystem) {
      const provider = this.providers.get(ecosystem.toLowerCase());
      if (provider) {
        return provider;
      }
      throw new BadRequestException(`No wallet provider found for ecosystem: ${ecosystem}`);
    }

    // Otherwise, find provider that supports this chain
    for (const provider of this.providers.values()) {
      if (provider.supportsChain(chainId)) {
        return provider;
      }
    }

    throw new BadRequestException(`No wallet provider found for chain: ${chainId}`);
  }

  /**
   * Get wallet balance for a token (multi-chain support)
   */
  async getBalance(
    chainId: number | string,
    walletAddress: string,
    tokenAddress?: string,
    ecosystem?: string,
  ): Promise<BalanceInfo> {
    try {
      const provider = this.getProviderForChain(chainId, ecosystem);
      return await provider.getBalance(chainId, walletAddress, tokenAddress);
    } catch (error) {
      this.logger.error(`Failed to get balance on chain ${chainId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get multiple token balances (multi-chain support)
   */
  async getMultipleBalances(
    chainId: number | string,
    walletAddress: string,
    tokenAddresses: string[],
    ecosystem?: string,
  ): Promise<BalanceInfo[]> {
    try {
      const provider = this.getProviderForChain(chainId, ecosystem);
      return await provider.getMultipleBalances(chainId, walletAddress, tokenAddresses);
    } catch (error) {
      this.logger.error(`Failed to get multiple balances on chain ${chainId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get token information (multi-chain support)
   */
  async getTokenInfo(chainId: number | string, tokenAddress: string, ecosystem?: string): Promise<TokenInfo> {
    try {
      const provider = this.getProviderForChain(chainId, ecosystem);
      return await provider.getTokenInfo(chainId, tokenAddress);
    } catch (error) {
      this.logger.error(`Failed to get token info on chain ${chainId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Check token allowance (multi-chain support, EVM-specific)
   */
  async getAllowance(
    chainId: number | string,
    tokenAddress: string,
    owner: string,
    spender: string,
    ecosystem?: string,
  ): Promise<string> {
    try {
      const provider = this.getProviderForChain(chainId, ecosystem);
      
      // Check if provider supports allowance (optional method)
      if (!provider.getAllowance) {
        throw new BadRequestException(`Allowance check not supported for chain: ${chainId}`);
      }
      
      return await provider.getAllowance(chainId, tokenAddress, owner, spender);
    } catch (error) {
      this.logger.error(`Failed to get allowance on chain ${chainId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Execute approval transaction (multi-chain support, EVM-specific)
   */
  async executeApproval(
    chainId: number | string,
    privateKey: string,
    tokenAddress: string,
    spender: string,
    amount: string,
    ecosystem?: string,
  ): Promise<string> {
    try {
      const provider = this.getProviderForChain(chainId, ecosystem);
      
      // Check if provider supports approval (optional method)
      if (!provider.executeApproval) {
        throw new BadRequestException(`Approval execution not supported for chain: ${chainId}`);
      }
      
      return await provider.executeApproval(chainId, privateKey, tokenAddress, spender, amount);
    } catch (error) {
      this.logger.error(`Failed to execute approval on chain ${chainId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Execute swap transaction (multi-chain support)
   */
  async executeSwap(
    chainId: number | string,
    privateKey: string,
    to: string,
    data: string,
    value: string,
    gasLimit?: string,
    ecosystem?: string,
  ): Promise<string> {
    try {
      const provider = this.getProviderForChain(chainId, ecosystem);
      return await provider.executeTransaction(chainId, privateKey, to, data, value, gasLimit);
    } catch (error) {
      this.logger.error(`Failed to execute transaction on chain ${chainId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Wait for transaction confirmation (multi-chain support)
   */
  async waitForTransactionConfirmation(
    chainId: number | string,
    txHash: string,
    confirmations: number = 1,
    ecosystem?: string,
  ): Promise<any> {
    try {
      const provider = this.getProviderForChain(chainId, ecosystem);
      return await provider.waitForTransactionConfirmation(chainId, txHash, confirmations);
    } catch (error) {
      this.logger.error(`Failed to wait for transaction on chain ${chainId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get transaction status (multi-chain support)
   */
  async getTransactionStatus(chainId: number | string, txHash: string, ecosystem?: string): Promise<{
    status: 'pending' | 'confirmed' | 'failed';
    receipt?: any;
  }> {
    try {
      const provider = this.getProviderForChain(chainId, ecosystem);
      return await provider.getTransactionStatus(chainId, txHash);
    } catch (error) {
      this.logger.error(`Failed to get transaction status on chain ${chainId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all registered wallet providers
   */
  getProviders(): Map<string, IWalletProvider> {
    return this.providers;
  }

  /**
   * Get provider by ecosystem
   */
  getProvider(ecosystem: string): IWalletProvider | undefined {
    return this.providers.get(ecosystem.toLowerCase());
  }

  /**
   * Parse transaction receipt to extract token transfers (multi-chain support)
   * Primarily for EVM chains - other chains may not support this
   */
  parseTransactionReceipt(
    receipt: any,
    tokenAddress: string,
    chainId?: number | string,
    ecosystem?: string,
  ): Array<{ from: string; to: string; amount: bigint }> {
    try {
      // If chainId is provided, use it to get the right provider
      let provider: IWalletProvider | undefined;
      
      if (chainId) {
        provider = this.getProviderForChain(chainId, ecosystem);
      } else if (ecosystem) {
        provider = this.providers.get(ecosystem.toLowerCase());
      } else {
        // Default to EVM provider for backward compatibility
        provider = this.providers.get('evm');
      }

      if (!provider) {
        throw new BadRequestException('No provider found for parsing transaction receipt');
      }

      // Check if provider supports receipt parsing
      if (!provider.parseTransactionReceipt) {
        this.logger.warn(`Provider ${provider.getEcosystem()} does not support transaction receipt parsing`);
        return [];
      }

      return provider.parseTransactionReceipt(receipt, tokenAddress);
    } catch (error) {
      this.logger.error(`Failed to parse transaction receipt: ${error.message}`, error.stack);
      // Return empty array instead of throwing to maintain backward compatibility
      return [];
    }
  }
}
