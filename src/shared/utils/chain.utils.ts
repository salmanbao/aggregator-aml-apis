/**
 * Utility functions for blockchain chain operations
 */

export enum SupportedChain {
  ETHEREUM = 1,
  POLYGON = 137,
  BSC = 56,
  ARBITRUM = 42161,
  OPTIMISM = 10,
  BASE = 8453,
  AVALANCHE = 43114,
}

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorer: string;
}

export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  [SupportedChain.ETHEREUM]: {
    chainId: 1,
    name: 'Ethereum',
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorer: 'https://etherscan.io',
  },
  [SupportedChain.POLYGON]: {
    chainId: 137,
    name: 'Polygon',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon.llamarpc.com',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18,
    },
    blockExplorer: 'https://polygonscan.com',
  },
  [SupportedChain.BSC]: {
    chainId: 56,
    name: 'BNB Smart Chain',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc.llamarpc.com',
    nativeCurrency: {
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18,
    },
    blockExplorer: 'https://bscscan.com',
  },
  [SupportedChain.ARBITRUM]: {
    chainId: 42161,
    name: 'Arbitrum One',
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arbitrum.llamarpc.com',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorer: 'https://arbiscan.io',
  },
  [SupportedChain.OPTIMISM]: {
    chainId: 10,
    name: 'Optimism',
    rpcUrl: process.env.OPTIMISM_RPC_URL || 'https://optimism.llamarpc.com',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorer: 'https://optimistic.etherscan.io',
  },
  [SupportedChain.BASE]: {
    chainId: 8453,
    name: 'Base',
    rpcUrl: process.env.BASE_RPC_URL || 'https://base.llamarpc.com',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorer: 'https://basescan.org',
  },
  [SupportedChain.AVALANCHE]: {
    chainId: 43114,
    name: 'Avalanche C-Chain',
    rpcUrl: process.env.AVALANCHE_RPC_URL || 'https://avalanche.llamarpc.com',
    nativeCurrency: {
      name: 'Avalanche',
      symbol: 'AVAX',
      decimals: 18,
    },
    blockExplorer: 'https://snowtrace.io',
  },
};

/**
 * Get chain configuration by chain ID
 */
export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAIN_CONFIGS[chainId as SupportedChain];
  if (!config) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return config;
}

/**
 * Check if chain ID is supported
 */
export function isChainSupported(chainId: number): boolean {
  return chainId in CHAIN_CONFIGS;
}

/**
 * Get native token address for a chain (0x0000000000000000000000000000000000000000)
 */
export function getNativeTokenAddress(): string {
  return '0x0000000000000000000000000000000000000000';
}

/**
 * Check if token address is native token
 */
export function isNativeToken(tokenAddress: string): boolean {
  return tokenAddress.toLowerCase() === getNativeTokenAddress().toLowerCase();
}
