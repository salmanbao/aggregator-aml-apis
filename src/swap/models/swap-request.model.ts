/**
 * Models for swap operations
 */

/**
 * Approval strategy types for 0x Protocol v2
 */
export enum ApprovalStrategy {
  ALLOWANCE_HOLDER = 'allowance-holder', // Recommended: Single signature, better UX
  PERMIT2 = 'permit2' // Advanced: Double signature, time-limited approvals
}

export interface SwapRequest {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  taker: string;
  recipient?: string;
  slippagePercentage?: number;
  deadline?: number;
  aggregator?: AggregatorType;
  approvalStrategy?: ApprovalStrategy; // Optional strategy for 0x v2
}

export interface SwapQuote {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  minBuyAmount: string;
  gas: string;
  gasPrice?: string;
  to: string;
  data: string;
  value: string;
  allowanceTarget?: string;
  aggregator: AggregatorType;
  priceImpact?: string;
  estimatedGas?: string;
  permit2?: Permit2Data; // Optional permit2 data for gasless approvals (Permit2 strategy only)
  approvalStrategy?: ApprovalStrategy; // Strategy used for this quote
  // EIP-1559 gas fields for improved gas handling
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface Permit2Data {
  type: string;
  hash: string;
  eip712: {
    types: Record<string, any>;
    domain: Record<string, any>;
    message: Record<string, any>;
    primaryType: string;
  };
}

export interface SwapTransaction {
  to: string;
  data: string;
  value: string;
  gasLimit: string;
  gasPrice?: string;
  nonce?: number;
}

export interface SwapResult {
  transactionHash: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  gasUsed: string;
  gasPrice: string;
  aggregator: AggregatorType;
  timestamp: number;
}

export interface ApprovalRequest {
  tokenAddress: string;
  spender: string;
  amount: string;
  owner: string;
}

export interface ApprovalResult {
  transactionHash: string;
  tokenAddress: string;
  spender: string;
  amount: string;
  timestamp: number;
}

/**
 * Supported aggregator types for multi-protocol swapping
 * 
 * EVM Aggregators:
 * - ZEROX: 0x Protocol v2 (AllowanceHolder + Permit2 strategies)
 * - ODOS: Odos efficient pathfinding
 * 
 * Cross-Protocol:
 * - JUPITER: Jupiter (Solana ecosystem)
 */
export enum AggregatorType {
  ZEROX = '0x',          // 0x Protocol (existing - do not change)
  ODOS = 'odos',         // Odos smart order routing
  }

export interface AggregatorConfig {
  name: AggregatorType;
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
  priority: number;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  isNative: boolean;
}

export interface BalanceInfo {
  tokenAddress: string;
  balance: string;
  formattedBalance: string;
  decimals: number;
  symbol: string;
}

export interface GasEstimate {
  gasLimit: string;
  gasPrice: string;
  estimatedCost: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}
