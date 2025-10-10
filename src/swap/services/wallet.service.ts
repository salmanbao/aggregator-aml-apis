import { Injectable, Logger } from '@nestjs/common';
import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  getContract, 
  formatEther, 
  formatUnits, 
  parseEther,
  type PublicClient,
  type WalletClient,
  type Address,
  type Hex,
  type TransactionReceipt
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getChainConfig, isNativeToken } from '../../shared/utils/chain.utils';
import {
  createProvider,
  ERC20_ABI,
  waitForTransaction,
  parseTokenTransfers,
} from '../../shared/utils/ethereum.utils';
import { BalanceInfo, TokenInfo } from '../models/swap-request.model';
import { validateWalletAddress,validatePrivateKey } from '../../shared/utils/validation.utils';

/**
 * Wallet service for handling blockchain transactions
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  /**
   * Get wallet balance for a token
   */
  async getBalance(
    chainId: number,
    walletAddress: string,
    tokenAddress?: string,
  ): Promise<BalanceInfo> {
    try {
      validateWalletAddress(walletAddress); // This will validate address format
      const chainConfig = getChainConfig(chainId);
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
      this.logger.error(`Failed to get balance: ${error.message}`, error.stack);
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  /**
   * Get multiple token balances
   */
  async getMultipleBalances(
    chainId: number,
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

  /**
   * Get token information
   */
  async getTokenInfo(chainId: number, tokenAddress: string): Promise<TokenInfo> {
    try {
      const chainConfig = getChainConfig(chainId);
      const provider = createProvider(chainConfig.rpcUrl);

      if (isNativeToken(tokenAddress)) {
        return {
          address: tokenAddress,
          symbol: chainConfig.nativeCurrency.symbol,
          name: chainConfig.nativeCurrency.name,
          decimals: chainConfig.nativeCurrency.decimals,
          chainId,
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
        chainId,
        isNative: false,
      };
    } catch (error) {
      this.logger.error(`Failed to get token info: ${error.message}`, error.stack);
      throw new Error(`Failed to get token info: ${error.message}`);
    }
  }

  /**
   * Check token allowance
   */
  async getAllowance(
    chainId: number,
    tokenAddress: string,
    owner: string,
    spender: string,
  ): Promise<string> {
    try {
      if (isNativeToken(tokenAddress)) {
        return '0'; // Native tokens don't need allowance
      }

      const chainConfig = getChainConfig(chainId);
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
      this.logger.error(`Failed to get allowance: ${error.message}`, error.stack);
      throw new Error(`Failed to get allowance: ${error.message}`);
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
  ): Promise<string> {
    try {
      validatePrivateKey(privateKey);
      const chainConfig = getChainConfig(chainId);
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

      // Execute approval transaction
      const hash = await contract.write.approve([
        spender as Address, 
        BigInt(amount)
      ], {
        account: walletClient.account,
        chain: null,
      });

      this.logger.log(`Approval transaction sent: ${hash}`);
      return hash;
    } catch (error) {
      this.logger.error(`Failed to execute approval: ${error.message}`, error.stack);
      throw new Error(`Failed to execute approval: ${error.message}`);
    }
  }

  /**
   * Execute swap transaction
   */
  async executeSwap(
    chainId: number,
    privateKey: string,
    to: string,
    data: string,
    value: string,
    gasLimit?: string,
  ): Promise<string> {
    try {
      validatePrivateKey(privateKey);
      const chainConfig = getChainConfig(chainId);
      const account = privateKeyToAccount(privateKey as Hex);
      
      const walletClient = createWalletClient({
        account,
        transport: http(chainConfig.rpcUrl),
      });

      // Execute swap transaction
      const hash = await walletClient.sendTransaction({
        to: to as Address,
        data: data as Hex,
        value: BigInt(value),
        gas: gasLimit ? BigInt(gasLimit) : undefined,
        chain: null,
      });

      this.logger.log(`Swap transaction sent: ${hash}`);
      return hash;
    } catch (error) {
      this.logger.error(`Failed to execute swap: ${error.message}`, error.stack);
      throw new Error(`Failed to execute swap: ${error.message}`);
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransactionConfirmation(
    chainId: number,
    txHash: string,
    confirmations: number = 1,
  ): Promise<TransactionReceipt> {
    try {
      const chainConfig = getChainConfig(chainId);
      const provider = createProvider(chainConfig.rpcUrl);

      const receipt = await waitForTransaction(provider, txHash as Hex, confirmations);
      this.logger.log(`Transaction confirmed: ${txHash}`);
      return receipt;
    } catch (error) {
      this.logger.error(`Failed to wait for transaction: ${error.message}`, error.stack);
      throw new Error(`Failed to wait for transaction: ${error.message}`);
    }
  }

  /**
   * Parse transaction receipt for token transfers
   */
  parseTransactionReceipt(
    receipt: TransactionReceipt,
    tokenAddress: string,
  ): Array<{ from: string; to: string; amount: bigint }> {
    return parseTokenTransfers(receipt, tokenAddress);
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(chainId: number, txHash: string): Promise<{
    status: 'pending' | 'confirmed' | 'failed';
    receipt?: TransactionReceipt;
  }> {
    try {
      const chainConfig = getChainConfig(chainId);
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
      this.logger.error(`Failed to get transaction status: ${error.message}`, error.stack);
      throw new Error(`Failed to get transaction status: ${error.message}`);
    }
  }
}
