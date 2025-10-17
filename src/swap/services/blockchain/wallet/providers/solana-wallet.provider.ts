import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { BalanceInfo, TokenInfo } from '@swap/models/swap-request.model';
import { IWalletProvider, WalletProviderConfig } from '../ports/wallet-provider.interface';
import type { IWalletProviderRegistry } from '../ports/wallet-provider-registry.interface';
import { WalletService } from '../wallet.service';

/**
 * Solana-specific wallet provider
 * NOW WITH SELF-REGISTRATION: Automatically registers itself with WalletService
 * TODO: Implement full Solana wallet functionality
 */
@Injectable()
export class SolanaWalletProvider implements IWalletProvider, OnModuleInit {
  private readonly logger = new Logger(SolanaWalletProvider.name);

  constructor(
    @Optional() @Inject(WalletService) private readonly registry?: IWalletProviderRegistry
  ) {}

  /**
   * Self-register with wallet service on module initialization
   */
  onModuleInit() {
    if (this.registry) {
      this.registry.registerWalletProvider(this);
      this.logger.debug(`${this.getEcosystem()} wallet provider self-registered`);
    } else {
      this.logger.warn(`${this.getEcosystem()} wallet provider could not find registry to self-register`);
    }
  }

  getEcosystem(): string {
    return 'solana';
  }

  supportsChain(chainId: number | string): boolean {
    // Solana uses string chain identifiers like 'mainnet-beta', 'devnet', 'testnet'
    const solanaChains = ['mainnet-beta', 'devnet', 'testnet', 'solana'];
    
    if (typeof chainId === 'string') {
      return solanaChains.includes(chainId.toLowerCase());
    }
    
    // Also support numeric ID for Solana mainnet
    return chainId === 900 || chainId === 901; // Convention: 900 for mainnet, 901 for devnet
  }

  async getBalance(
    chainId: number | string,
    walletAddress: string,
    tokenAddress?: string,
  ): Promise<BalanceInfo> {
    try {
      // TODO: Implement Solana balance fetching using @solana/web3.js
      this.logger.warn('Solana balance check not yet implemented');
      
      throw new Error('Solana wallet provider not yet implemented. Use Solana-specific endpoints.');
    } catch (error) {
      this.logger.error(`Failed to get Solana balance: ${error.message}`, error.stack);
      throw new Error(`Failed to get Solana balance: ${error.message}`);
    }
  }

  async getMultipleBalances(
    chainId: number | string,
    walletAddress: string,
    tokenAddresses: string[],
  ): Promise<BalanceInfo[]> {
    throw new Error('Solana wallet provider not yet implemented');
  }

  async getTokenInfo(chainId: number | string, tokenAddress: string): Promise<TokenInfo> {
    throw new Error('Solana wallet provider not yet implemented');
  }

  async executeTransaction(
    chainId: number | string,
    privateKey: string,
    to: string,
    data: string,
    value: string,
    gasLimit?: string,
  ): Promise<string> {
    throw new Error('Solana wallet provider not yet implemented');
  }

  async waitForTransactionConfirmation(
    chainId: number | string,
    txHash: string,
    confirmations?: number,
  ): Promise<any> {
    throw new Error('Solana wallet provider not yet implemented');
  }

  async getTransactionStatus(chainId: number | string, txHash: string): Promise<{
    status: 'pending' | 'confirmed' | 'failed';
    receipt?: any;
  }> {
    throw new Error('Solana wallet provider not yet implemented');
  }

  getConfig(): WalletProviderConfig {
    return {
      name: 'Solana Wallet Provider',
      ecosystem: 'solana',
      enabled: false, // Disabled until implemented
      supportedChains: ['mainnet-beta', 'devnet', 'testnet'],
    };
  }
}
