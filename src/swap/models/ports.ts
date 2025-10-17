/**
 * Provider Ports (Interfaces) for Swap Aggregation
 * 
 * These stable interfaces decouple provider code from business logic
 * and make adding new adapters trivial.
 */

import { ApprovalStrategy } from './swap-request.model';

/**
 * Base swap quote interface aligned with existing SwapQuote
 */
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
  aggregator: string;
  priceImpact?: string;
  estimatedGas?: string;
  permit2?: Permit2Data;
  approvalStrategy?: ApprovalStrategy;
  // EIP-1559 gas fields for improved gas handling
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

/**
 * Base swap request interface aligned with existing SwapRequest
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
  aggregator?: string;
  approvalStrategy?: ApprovalStrategy;
}

/**
 * Permit2 data structure for gasless approvals
 */
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

/**
 * Cross-chain route request for meta-aggregators
 */
export interface RouteRequest {
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  toToken: string;
  amount: string;
  slippageBps: number;
  userAddress?: string;
  recipient?: string;
  referrer?: string;
}

/**
 * Individual step in a cross-chain route
 */
export type Step = {
  kind: 'swap' | 'bridge' | 'native';
  chainId: number;
  details: any;
  protocol?: string;
  estimatedTime?: number;
};

/**
 * Cross-chain route quote response
 */
export interface RouteQuote {
  steps: Step[];
  totalEstimatedOut: string;
  fees: {
    gas: string;
    provider: string;
    bridge?: string;
    app?: string;
  };
  etaSeconds?: number;
  providerRef?: Record<string, any>;
  routeId?: string;
  priceImpact?: string;
  confidence?: number;
}

/**
 * Transaction build result
 */
export interface TransactionBuild {
  to: string;
  data: string;
  value: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

/**
 * Execution status for cross-chain operations
 */
export type ExecutionStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'PARTIAL';

/**
 * Port for on-chain aggregators (0x, Odos, etc.)
 */
export interface IOnchainAggregator extends IProvider {
  /**
   * Get a swap quote for same-chain swaps
   * @param req - The swap request
   * @param strictValidation - Whether to use strict validation (default: true)
   *                          Set to false for quote comparison to relax validations
   */
  getQuote(req: SwapRequest, strictValidation?: boolean): Promise<SwapQuote>;

  /**
   * Build transaction data for execution
   */
  buildTx(req: SwapRequest): Promise<TransactionBuild>;

  /**
   * Check if provider supports the given chain
   */
  supportsChain(chainId: number): boolean;

  /**
   * Get all supported chains dynamically from the aggregator's API
   */
  getSupportedChains(): Promise<number[]>;
}

/**
 * Port for meta-aggregators (LI.FI, Socket, etc.)
 */
export interface IMetaAggregator extends IProvider {
  /**
   * Get available cross-chain routes
   */
  getRoutes(req: RouteRequest): Promise<RouteQuote[]>;

  /**
   * Execute a specific route
   */
  execute(routeId: string, signerCtx: any): Promise<{ txids: string[] }>;

  /**
   * Check execution status
   */
  status(routeId: string): Promise<ExecutionStatus>;

  /**
   * Get supported chain pairs
   */
  getSupportedChains(): { from: number[]; to: number[] };
}

/**
 * Solana-specific quote request
 */
export interface SolanaQuoteRequest {
  fromMint: string;
  toMint: string;
  amount: string;
  slippageBps: number;
  userPublicKey?: string;
  platformFeeBps?: number;
}

/**
 * Solana transaction result
 */
export interface SolanaTransactionResult {
  rawTx: string;
  txid?: string;
  instructions?: any[];
}

/**
 * Port for Solana routers (Jupiter, etc.)
 */
export interface ISolanaRouter extends IProvider {
  /**
   * Get swap quote for Solana tokens
   */
  quote(req: SolanaQuoteRequest): Promise<RouteQuote>;

  /**
   * Build and optionally sign transaction
   */
  buildAndSign(quoteResponse: any, userKeypair?: any): Promise<SolanaTransactionResult>;

  /**
   * Check if token pair is supported
   */
  supportsTokenPair(fromMint: string, toMint: string): Promise<boolean>;
}

/**
 * Native L1 quote request (Bitcoin, etc.)
 */
export interface NativeQuoteRequest {
  toChainId: number;
  toToken: string;
  amountSats: string;
  userAddress?: string;
  memo?: string;
}

/**
 * Port for native L1 routers (THORChain, Maya, etc.)
 */
export interface INativeRouter extends IProvider {
  /**
   * Get quote for Bitcoin to other chains
   */
  quoteBtc(req: NativeQuoteRequest): Promise<RouteQuote>;

  /**
   * Deposit and track cross-chain transaction
   */
  depositAndTrack(depositTx: string, memo: string): Promise<ExecutionStatus>;

  /**
   * Get supported destination chains
   */
  getSupportedDestinations(): number[];
}

/**
 * Generic provider configuration
 */
export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
  rateLimit?: {
    requests: number;
    perSeconds: number;
  };
  timeout?: number;
  retries?: number;
}

/**
 * Provider health status
 */
export interface ProviderHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  lastCheck: Date;
  errorRate?: number;
}

/**
 * Universal provider interface for health monitoring
 */
export interface IProvider {
  getProviderName(): string;
  healthCheck(): Promise<ProviderHealth>;
  getConfig(): ProviderConfig;
}