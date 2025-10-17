/**
 * Registry interface for self-registering aggregators and providers
 * Enables loose coupling and automatic discovery of swap providers
 */

import type { IOnchainAggregator, IMetaAggregator, ISolanaRouter, INativeRouter } from '@swap/models/ports';

/**
 * Provider categories for registration
 */
export enum ProviderCategory {
  EVM_AGGREGATOR = 'evm',
  META_AGGREGATOR = 'meta',
  SOLANA_ROUTER = 'solana',
  NATIVE_ROUTER = 'native',
}

/**
 * Provider types union
 */
export type AnyProvider = IOnchainAggregator | IMetaAggregator | ISolanaRouter | INativeRouter;

/**
 * Registry interface that providers use to register themselves
 */
export interface IAggregatorRegistry {
  /**
   * Register an EVM aggregator
   */
  registerEvmAggregator(provider: IOnchainAggregator): void;

  /**
   * Register a meta aggregator (cross-chain)
   */
  registerMetaAggregator(provider: IMetaAggregator): void;

  /**
   * Register a Solana router
   */
  registerSolanaRouter(provider: ISolanaRouter): void;

  /**
   * Register a native L1 router
   */
  registerNativeRouter(provider: INativeRouter): void;

  /**
   * Generic registration method (auto-detects category)
   */
  registerProvider(provider: AnyProvider, category: ProviderCategory): void;
}

/**
 * Injection token for the aggregator registry
 */
export const AGGREGATOR_REGISTRY = Symbol('AGGREGATOR_REGISTRY');
