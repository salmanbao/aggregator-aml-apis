import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  isAddress, 
  isHex, 
  formatEther, 
  parseEther, 
  formatUnits, 
  parseUnits,
  type PublicClient,
  type WalletClient,
  type Address,
  type Hex,
  type TransactionReceipt,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Utility functions for Ethereum operations
 */

/**
 * Validate Ethereum address
 */
export function isValidAddress(address: string): boolean {
  try {
    return isAddress(address);
  } catch {
    return false;
  }
}

/**
 * Validate Ethereum transaction hash
 */
export function isValidTxHash(txHash: string): boolean {
  try {
    return isHex(txHash) && txHash.length === 66; // 0x + 64 hex chars
  } catch {
    return false;
  }
}

/**
 * Convert wei to ether
 */
export function weiToEther(wei: string | bigint): string {
  return formatEther(BigInt(wei));
}

/**
 * Convert ether to wei
 */
export function etherToWei(ether: string): bigint {
  return parseEther(ether);
}

/**
 * Format token amount with decimals
 */
export function formatTokenAmount(amount: string | bigint, decimals: number): string {
  return formatUnits(BigInt(amount), decimals);
}

/**
 * Parse token amount to wei
 */
export function parseTokenAmount(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals);
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
 * Get ERC-20 token ABI
 */
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'transferFrom',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Approval',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'spender', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;

/**
 * Create public client for a given chain
 */
export function createProvider(rpcUrl: string): PublicClient {
  return createPublicClient({
    transport: http(rpcUrl),
  });
}

/**
 * Create wallet client from private key
 */
export function createWallet(privateKey: string, rpcUrl: string): WalletClient {
  const account = privateKeyToAccount(privateKey as Hex);
  return createWalletClient({
    account,
    transport: http(rpcUrl),
  });
}

/**
 * Estimate gas for a transaction
 */
export async function estimateGas(
  client: PublicClient,
  transaction: {
    account: Address;
    to: Address;
    data: Hex;
    value?: bigint;
  },
): Promise<bigint> {
  try {
    return await client.estimateGas(transaction);
  } catch (error) {
    throw new Error(`Gas estimation failed: ${error.message}`);
  }
}

/**
 * Get current gas price
 */
export async function getGasPrice(client: PublicClient): Promise<bigint> {
  try {
    return await client.getGasPrice();
  } catch (error) {
    throw new Error(`Failed to get gas price: ${error.message}`);
  }
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTransaction(
  client: PublicClient,
  txHash: Hex,
  confirmations: number = 1,
): Promise<TransactionReceipt> {
  try {
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      confirmations,
    });
    return receipt;
  } catch (error) {
    throw new Error(`Transaction confirmation failed: ${error.message}`);
  }
}

/**
 * Parse transaction receipt for token transfers
 */
export function parseTokenTransfers(
  receipt: TransactionReceipt,
  tokenAddress: string,
): Array<{ from: string; to: string; amount: bigint }> {
  const transfers: Array<{ from: string; to: string; amount: bigint }> = [];

  // Find Transfer event signature
  const transferEventSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

  for (const log of receipt.logs) {
    try {
      // Check if this is a Transfer event for the specific token
      if (
        log.address.toLowerCase() === tokenAddress.toLowerCase() &&
        log.topics[0] === transferEventSignature &&
        log.topics.length >= 3
      ) {
        const from = `0x${log.topics[1]?.slice(26)}` as Address;
        const to = `0x${log.topics[2]?.slice(26)}` as Address;
        const amount = BigInt(log.data);

        transfers.push({
          from,
          to,
          amount,
        });
      }
    } catch {
      // Skip logs that don't match ERC-20 Transfer event
    }
  }

  return transfers;
}
