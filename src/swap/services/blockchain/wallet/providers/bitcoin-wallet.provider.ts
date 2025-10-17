import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { BalanceInfo, TokenInfo } from '@swap/models/swap-request.model';
import { IWalletProvider, WalletProviderConfig } from '../ports/wallet-provider.interface';
import type { IWalletProviderRegistry } from '../ports/wallet-provider-registry.interface';
import { WalletService } from '../wallet.service';

/**
 * Bitcoin-specific wallet provider
 * NOW WITH SELF-REGISTRATION: Automatically registers itself with WalletService
 * TODO: Implement full Bitcoin wallet functionality
 */
@Injectable()
export class BitcoinWalletProvider implements IWalletProvider, OnModuleInit {
  private readonly logger = new Logger(BitcoinWalletProvider.name);

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
    return 'bitcoin';
  }

  supportsChain(chainId: number | string): boolean {
    // Bitcoin uses string identifiers like 'bitcoin', 'btc', 'testnet'
    const bitcoinChains = ['bitcoin', 'btc', 'bitcoin-testnet', 'btc-testnet'];
    
    if (typeof chainId === 'string') {
      return bitcoinChains.includes(chainId.toLowerCase());
    }
    
    // Also support numeric ID convention
    return chainId === 0 || chainId === 1; // 0 for mainnet, 1 for testnet
  }

  async getBalance(
    chainId: number | string,
    walletAddress: string,
    tokenAddress?: string,
  ): Promise<BalanceInfo> {
    try {
      // TODO: Implement Bitcoin balance fetching using bitcoinjs-lib or similar
      this.logger.warn('Bitcoin balance check not yet implemented');
      
      throw new Error('Bitcoin wallet provider not yet implemented. Use Bitcoin-specific endpoints.');
    } catch (error) {
      this.logger.error(`Failed to get Bitcoin balance: ${error.message}`, error.stack);
      throw new Error(`Failed to get Bitcoin balance: ${error.message}`);
    }
  }

  async getMultipleBalances(
    chainId: number | string,
    walletAddress: string,
    tokenAddresses: string[],
  ): Promise<BalanceInfo[]> {
    throw new Error('Bitcoin wallet provider not yet implemented');
  }

  async getTokenInfo(chainId: number | string, tokenAddress: string): Promise<TokenInfo> {
    throw new Error('Bitcoin wallet provider not yet implemented. Bitcoin does not have native token standards like ERC-20.');
  }

  async executeTransaction(
    chainId: number | string,
    privateKey: string,
    to: string,
    data: string,
    value: string,
    gasLimit?: string,
  ): Promise<string> {
    throw new Error('Bitcoin wallet provider not yet implemented');
  }

  async waitForTransactionConfirmation(
    chainId: number | string,
    txHash: string,
    confirmations?: number,
  ): Promise<any> {
    throw new Error('Bitcoin wallet provider not yet implemented');
  }

  async getTransactionStatus(chainId: number | string, txHash: string): Promise<{
    status: 'pending' | 'confirmed' | 'failed';
    receipt?: any;
  }> {
    throw new Error('Bitcoin wallet provider not yet implemented');
  }

  getConfig(): WalletProviderConfig {
    return {
      name: 'Bitcoin Wallet Provider',
      ecosystem: 'bitcoin',
      enabled: false, // Disabled until implemented
      supportedChains: ['bitcoin', 'btc', 'bitcoin-testnet'],
    };
  }
}
