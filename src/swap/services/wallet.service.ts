import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { getChainConfig, isNativeToken } from '../../shared/utils/chain.utils';
import {
  createProvider,
  createWallet,
  getERC20Interface,
  estimateGas,
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
        const balance = await provider.getBalance(walletAddress);
        return {
          tokenAddress: '0x0000000000000000000000000000000000000000',
          balance: balance.toString(),
          formattedBalance: ethers.formatEther(balance),
          decimals: 18,
          symbol: chainConfig.nativeCurrency.symbol,
        };
      }

      // Get ERC-20 token balance
      const erc20Interface = getERC20Interface();
      const contract = new ethers.Contract(tokenAddress, erc20Interface, provider);

      const [balance, decimals, symbol] = await Promise.all([
        contract.balanceOf(walletAddress),
        contract.decimals(),
        contract.symbol(),
      ]);

      return {
        tokenAddress,
        balance: balance.toString(),
        formattedBalance: ethers.formatUnits(balance, decimals),
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

      const erc20Interface = getERC20Interface();
      const contract = new ethers.Contract(tokenAddress, erc20Interface, provider);

      const [name, symbol, decimals] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
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
      const erc20Interface = getERC20Interface();
      const contract = new ethers.Contract(tokenAddress, erc20Interface, provider);

      const allowance = await contract.allowance(owner, spender);
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
      const provider = createProvider(chainConfig.rpcUrl);
      const wallet = createWallet(privateKey, provider);

      if (isNativeToken(tokenAddress)) {
        throw new Error('Cannot approve native token');
      }

      const erc20Interface = getERC20Interface();
      const contract = new ethers.Contract(tokenAddress, erc20Interface, wallet);

      // Estimate gas for approval
      const gasEstimate = await estimateGas(provider, {
        to: tokenAddress,
        data: contract.interface.encodeFunctionData('approve', [spender, amount]),
        from: wallet.address,
      });

      // Execute approval transaction
      const tx = await contract.approve(spender, amount, {
        gasLimit: gasEstimate,
      });

      this.logger.log(`Approval transaction sent: ${tx.hash}`);
      return tx.hash;
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
      const provider = createProvider(chainConfig.rpcUrl);
      const wallet = createWallet(privateKey, provider);

      // Estimate gas if not provided
      let estimatedGas = gasLimit;
      if (!estimatedGas) {
        estimatedGas = (
          await estimateGas(provider, {
            to,
            data,
            value,
            from: wallet.address,
          })
        ).toString();
      }

      // Execute swap transaction
      const tx = await wallet.sendTransaction({
        to,
        data,
        value,
        gasLimit: estimatedGas,
      });

      this.logger.log(`Swap transaction sent: ${tx.hash}`);
      return tx.hash;
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
  ): Promise<ethers.TransactionReceipt> {
    try {
      const chainConfig = getChainConfig(chainId);
      const provider = createProvider(chainConfig.rpcUrl);

      const receipt = await waitForTransaction(provider, txHash, confirmations);
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
    receipt: ethers.TransactionReceipt,
    tokenAddress: string,
  ): Array<{ from: string; to: string; amount: bigint }> {
    return parseTokenTransfers(receipt, tokenAddress);
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(chainId: number, txHash: string): Promise<{
    status: 'pending' | 'confirmed' | 'failed';
    receipt?: ethers.TransactionReceipt;
  }> {
    try {
      const chainConfig = getChainConfig(chainId);
      const provider = createProvider(chainConfig.rpcUrl);

      const tx = await provider.getTransaction(txHash);
      if (!tx) {
        throw new Error('Transaction not found');
      }

      if (tx.blockNumber) {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
          return {
            status: receipt.status === 1 ? 'confirmed' : 'failed',
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
