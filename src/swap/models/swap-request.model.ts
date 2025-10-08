/**
 * Models for swap operations
 */

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

export enum AggregatorType {
  ZEROX = '0x',
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
