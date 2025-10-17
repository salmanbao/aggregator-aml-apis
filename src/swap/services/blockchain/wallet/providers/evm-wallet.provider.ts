import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  getContract, 
  formatEther, 
  formatUnits, 
  type Address,
  type Hex,
  type TransactionReceipt
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getChainConfig, isNativeToken } from '@shared/utils/chain.utils';
import {
  createProvider,
  ERC20_ABI,
  waitForTransaction,
  parseTokenTransfers,
} from '@shared/utils/ethereum.utils';
import { BalanceInfo, TokenInfo } from '@swap/models/swap-request.model';
import { validateWalletAddress, validatePrivateKey } from '@shared/utils/validation.utils';
import { IWalletProvider, WalletProviderConfig } from '../ports/wallet-provider.interface';
import type { IWalletProviderRegistry } from '../ports/wallet-provider-registry.interface';
import { WalletService } from '../wallet.service';

/**
 * EVM-specific wallet provider for Ethereum and EVM-compatible chains
 * NOW WITH SELF-REGISTRATION: Automatically registers itself with WalletService
 */
@Injectable()
export class EvmWalletProvider implements IWalletProvider, OnModuleInit {
  private readonly logger = new Logger(EvmWalletProvider.name);

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
    return 'evm';
  }

  supportsChain(chainId: number | string): boolean {
    // EVM chains are numeric
    const numericChainId = typeof chainId === 'string' ? parseInt(chainId) : chainId;
    
    // Basic check - any numeric chain ID is potentially EVM
    // For production, you might want a whitelist
    return !isNaN(numericChainId) && numericChainId > 0;
  }

  async getBalance(
    chainId: number | string,
    walletAddress: string,
    tokenAddress?: string,
  ): Promise<BalanceInfo> {
    try {
      validateWalletAddress(walletAddress);
      const numericChainId = typeof chainId === 'string' ? parseInt(chainId) : chainId;
      const chainConfig = getChainConfig(numericChainId);
      const provider = createProvider(chainConfig.rpcUrl);

      if (!tokenAddress || isNativeToken(tokenAddress)) {
        // Get native token balance
        const balance = await provider.getBalance({ 
          address: walletAddress as Address 
        });
        return {
          tokenAddress: '0x0000000000000000000000000000000000000000',
          balance: balance.toString(),
          formattedBalance: formatEther(balance),
          decimals: 18,
          symbol: chainConfig.nativeCurrency.symbol,
        };
      }

      // Get ERC-20 token balance
      const contract = getContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        client: provider,
      });

      const [balance, decimals, symbol] = await Promise.all([
        contract.read.balanceOf([walletAddress as Address]),
        contract.read.decimals(),
        contract.read.symbol(),
      ]);

      return {
        tokenAddress,
        balance: balance.toString(),
        formattedBalance: formatUnits(balance, decimals),
        decimals: Number(decimals),
        symbol,
      };
    } catch (error) {
      this.logger.error(`Failed to get EVM balance: ${error.message}`, error.stack);
      throw new Error(`Failed to get EVM balance: ${error.message}`);
    }
  }

  async getMultipleBalances(
    chainId: number | string,
    walletAddress: string,
    tokenAddresses: string[],
  ): Promise<BalanceInfo[]> {
    const balances = await Promise.allSettled(
      tokenAddresses.map((tokenAddress) =>
        this.getBalance(chainId, walletAddress, tokenAddress),
      ),
    );

    return balances
      .filter((result): result is PromiseFulfilledResult<BalanceInfo> => result.status === 'fulfilled')
      .map((result) => result.value);
  }

  async getTokenInfo(chainId: number | string, tokenAddress: string): Promise<TokenInfo> {
    try {
      const numericChainId = typeof chainId === 'string' ? parseInt(chainId) : chainId;
      const chainConfig = getChainConfig(numericChainId);
      const provider = createProvider(chainConfig.rpcUrl);

      if (isNativeToken(tokenAddress)) {
        return {
          address: tokenAddress,
          symbol: chainConfig.nativeCurrency.symbol,
          name: chainConfig.nativeCurrency.name,
          decimals: chainConfig.nativeCurrency.decimals,
          chainId: numericChainId,
          isNative: true,
        };
      }

      const contract = getContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        client: provider,
      });

      const [name, symbol, decimals] = await Promise.all([
        contract.read.name(),
        contract.read.symbol(),
        contract.read.decimals(),
      ]);

      return {
        address: tokenAddress,
        symbol,
        name,
        decimals: Number(decimals),
        chainId: numericChainId,
        isNative: false,
      };
    } catch (error) {
      this.logger.error(`Failed to get EVM token info: ${error.message}`, error.stack);
      throw new Error(`Failed to get EVM token info: ${error.message}`);
    }
  }

  async getAllowance(
    chainId: number | string,
    tokenAddress: string,
    owner: string,
    spender: string,
  ): Promise<string> {
    try {
      if (isNativeToken(tokenAddress)) {
        return '0'; // Native tokens don't need allowance
      }

      const numericChainId = typeof chainId === 'string' ? parseInt(chainId) : chainId;
      const chainConfig = getChainConfig(numericChainId);
      const provider = createProvider(chainConfig.rpcUrl);
      const contract = getContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        client: provider,
      });

      const allowance = await contract.read.allowance([
        owner as Address, 
        spender as Address
      ]);
      return allowance.toString();
    } catch (error) {
      this.logger.error(`Failed to get EVM allowance: ${error.message}`, error.stack);
      throw new Error(`Failed to get EVM allowance: ${error.message}`);
    }
  }

  async executeApproval(
    chainId: number | string,
    privateKey: string,
    tokenAddress: string,
    spender: string,
    amount: string,
  ): Promise<string> {
    try {
      validatePrivateKey(privateKey);
      const numericChainId = typeof chainId === 'string' ? parseInt(chainId) : chainId;
      const chainConfig = getChainConfig(numericChainId);
      const account = privateKeyToAccount(privateKey as Hex);
      
      const walletClient = createWalletClient({
        account,
        transport: http(chainConfig.rpcUrl),
      });

      const publicClient = createPublicClient({
        transport: http(chainConfig.rpcUrl),
      });

      if (isNativeToken(tokenAddress)) {
        throw new Error('Cannot approve native token');
      }

      const contract = getContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        client: { public: publicClient, wallet: walletClient },
      });

      const hash = await contract.write.approve([
        spender as Address, 
        BigInt(amount)
      ], {
        account: walletClient.account,
        chain: null,
      });

      this.logger.log(`EVM approval transaction sent: ${hash}`);
      return hash;
    } catch (error) {
      this.logger.error(`Failed to execute EVM approval: ${error.message}`, error.stack);
      throw new Error(`Failed to execute EVM approval: ${error.message}`);
    }
  }

  async executeTransaction(
    chainId: number | string,
    privateKey: string,
    to: string,
    data: string,
    value: string,
    gasLimit?: string,
  ): Promise<string> {
    try {
      validatePrivateKey(privateKey);
      const numericChainId = typeof chainId === 'string' ? parseInt(chainId) : chainId;
      const chainConfig = getChainConfig(numericChainId);
      const account = privateKeyToAccount(privateKey as Hex);
      
      const walletClient = createWalletClient({
        account,
        transport: http(chainConfig.rpcUrl),
      });

      const hash = await walletClient.sendTransaction({
        to: to as Address,
        data: data as Hex,
        value: BigInt(value),
        gas: gasLimit ? BigInt(gasLimit) : undefined,
        chain: null,
      });

      this.logger.log(`EVM transaction sent: ${hash}`);
      return hash;
    } catch (error) {
      this.logger.error(`Failed to execute EVM transaction: ${error.message}`, error.stack);
      throw new Error(`Failed to execute EVM transaction: ${error.message}`);
    }
  }

  async waitForTransactionConfirmation(
    chainId: number | string,
    txHash: string,
    confirmations: number = 1,
  ): Promise<TransactionReceipt> {
    try {
      const numericChainId = typeof chainId === 'string' ? parseInt(chainId) : chainId;
      const chainConfig = getChainConfig(numericChainId);
      const provider = createProvider(chainConfig.rpcUrl);

      const receipt = await waitForTransaction(provider, txHash as Hex, confirmations);
      this.logger.log(`EVM transaction confirmed: ${txHash}`);
      return receipt;
    } catch (error) {
      this.logger.error(`Failed to wait for EVM transaction: ${error.message}`, error.stack);
      throw new Error(`Failed to wait for EVM transaction: ${error.message}`);
    }
  }

  parseTransactionReceipt(
    receipt: TransactionReceipt,
    tokenAddress: string,
  ): Array<{ from: string; to: string; amount: bigint }> {
    return parseTokenTransfers(receipt, tokenAddress);
  }

  async getTransactionStatus(chainId: number | string, txHash: string): Promise<{
    status: 'pending' | 'confirmed' | 'failed';
    receipt?: TransactionReceipt;
  }> {
    try {
      const numericChainId = typeof chainId === 'string' ? parseInt(chainId) : chainId;
      const chainConfig = getChainConfig(numericChainId);
      const provider = createProvider(chainConfig.rpcUrl);

      const tx = await provider.getTransaction({ hash: txHash as Hex });
      if (!tx) {
        throw new Error('Transaction not found');
      }

      if (tx.blockNumber) {
        const receipt = await provider.getTransactionReceipt({ hash: txHash as Hex });
        if (receipt) {
          return {
            status: receipt.status === 'success' ? 'confirmed' : 'failed',
            receipt,
          };
        }
      }

      return { status: 'pending' };
    } catch (error) {
      this.logger.error(`Failed to get EVM transaction status: ${error.message}`, error.stack);
      throw new Error(`Failed to get EVM transaction status: ${error.message}`);
    }
  }

  getConfig(): WalletProviderConfig {
    return {
      name: 'EVM Wallet Provider',
      ecosystem: 'evm',
      enabled: true,
      supportedChains: [], // All numeric chain IDs
    };
  }
}
