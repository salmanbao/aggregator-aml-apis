import { ethers } from 'ethers';
import { isNativeToken } from './chain.utils';

/**
 * Utility functions for Ethereum operations
 */

/**
 * Validate Ethereum address
 */
export function isValidAddress(address: string): boolean {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

/**
 * Validate Ethereum transaction hash
 */
export function isValidTxHash(txHash: string): boolean {
  try {
    return ethers.isHexString(txHash, 32);
  } catch {
    return false;
  }
}

/**
 * Convert wei to ether
 */
export function weiToEther(wei: string | bigint): string {
  return ethers.formatEther(wei);
}

/**
 * Convert ether to wei
 */
export function etherToWei(ether: string): bigint {
  return ethers.parseEther(ether);
}

/**
 * Format token amount with decimals
 */
export function formatTokenAmount(amount: string | bigint, decimals: number): string {
  return ethers.formatUnits(amount, decimals);
}

/**
 * Parse token amount to wei
 */
export function parseTokenAmount(amount: string, decimals: number): bigint {
  return ethers.parseUnits(amount, decimals);
}

/**
 * Calculate minimum return amount with slippage
 */
export function calculateMinReturn(
  expectedAmount: string | bigint,
  slippageBps: number,
): bigint {
  const expected = BigInt(expectedAmount);
  const slippageMultiplier = BigInt(10000 - slippageBps);
  return (expected * slippageMultiplier) / BigInt(10000);
}

/**
 * Calculate maximum input amount with slippage
 */
export function calculateMaxInput(
  expectedAmount: string | bigint,
  slippageBps: number,
): bigint {
  const expected = BigInt(expectedAmount);
  const slippageMultiplier = BigInt(10000 + slippageBps);
  return (expected * slippageMultiplier) / BigInt(10000);
}

/**
 * Get ERC-20 token contract interface
 */
export function getERC20Interface(): ethers.Interface {
  return new ethers.Interface([
    'function balanceOf(address owner) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function transferFrom(address from, address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function name() view returns (string)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'event Approval(address indexed owner, address indexed spender, uint256 value)',
  ]);
}

/**
 * Create provider for a given chain
 */
export function createProvider(rpcUrl: string): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Create wallet from private key
 */
export function createWallet(privateKey: string, provider: ethers.Provider): ethers.Wallet {
  return new ethers.Wallet(privateKey, provider);
}

/**
 * Estimate gas for a transaction
 */
export async function estimateGas(
  provider: ethers.Provider,
  transaction: ethers.TransactionRequest,
): Promise<bigint> {
  try {
    return await provider.estimateGas(transaction);
  } catch (error) {
    throw new Error(`Gas estimation failed: ${error.message}`);
  }
}

/**
 * Get current gas price
 */
export async function getGasPrice(provider: ethers.Provider): Promise<bigint> {
  try {
    const feeData = await provider.getFeeData();
    return feeData.gasPrice || BigInt(0);
  } catch (error) {
    throw new Error(`Failed to get gas price: ${error.message}`);
  }
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTransaction(
  provider: ethers.Provider,
  txHash: string,
  confirmations: number = 1,
): Promise<ethers.TransactionReceipt> {
  try {
    return await provider.waitForTransaction(txHash, confirmations);
  } catch (error) {
    throw new Error(`Transaction confirmation failed: ${error.message}`);
  }
}

/**
 * Parse transaction receipt for token transfers
 */
export function parseTokenTransfers(
  receipt: ethers.TransactionReceipt,
  tokenAddress: string,
): Array<{ from: string; to: string; amount: bigint }> {
  const erc20Interface = getERC20Interface();
  const transfers: Array<{ from: string; to: string; amount: bigint }> = [];

  for (const log of receipt.logs) {
    try {
      const parsed = erc20Interface.parseLog(log);
      if (parsed && parsed.name === 'Transfer') {
        const { from, to, value } = parsed.args;
        transfers.push({
          from: from as string,
          to: to as string,
          amount: value as bigint,
        });
      }
    } catch {
      // Skip logs that don't match ERC-20 Transfer event
    }
  }

  return transfers;
}
