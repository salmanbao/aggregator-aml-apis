import { IsString, IsNumber, IsOptional, IsEnum, Min, Max, IsBoolean, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Supported blockchain ecosystems
 */
export enum BlockchainEcosystem {
  EVM = 'evm',           // Ethereum, Polygon, BSC, Arbitrum, etc.
  SOLANA = 'solana',     // Solana ecosystem
  COSMOS = 'cosmos',     // Cosmos ecosystem (ATOM, OSMO, etc.)
  BITCOIN = 'bitcoin',   // Bitcoin and Bitcoin-based chains
  SUBSTRATE = 'substrate', // Polkadot, Kusama ecosystem
  NEAR = 'near',         // NEAR Protocol
  TERRA = 'terra',       // Terra ecosystem
  AVALANCHE = 'avalanche', // Avalanche C-Chain (also EVM but sometimes needs special handling)
  THORCHAIN = 'thorchain', // THORChain native
  MAYA = 'maya',         // Maya Protocol
}

/**
 * Swap operation types
 */
export enum SwapType {
  ON_CHAIN = 'on-chain',           // Same chain swap
  CROSS_CHAIN = 'cross-chain',     // Different chains
  L1_TO_L2 = 'l1-to-l2',          // Layer 1 to Layer 2
  L2_TO_L1 = 'l2-to-l1',          // Layer 2 to Layer 1
  L2_TO_L2 = 'l2-to-l2',          // Layer 2 to Layer 2
  NATIVE_SWAP = 'native-swap',     // Native L1 swaps (THORChain, Maya)
}

/**
 * Token standard types
 */
export enum TokenStandard {
  NATIVE = 'native',     // Native gas tokens (ETH, BNB, MATIC, SOL, etc.)
  ERC20 = 'erc20',       // ERC-20 tokens
  SPL = 'spl',           // Solana SPL tokens
  BEP20 = 'bep20',       // BSC tokens
  COSMOS_NATIVE = 'cosmos-native', // Cosmos native tokens
  RUNE = 'rune',         // THORChain RUNE
  CACAO = 'cacao',       // Maya CACAO
}

/**
 * Chain information for the swap
 */
export class ChainInfo {
  @ApiProperty({
    description: 'Chain ID (for EVM chains) or chain identifier',
    examples: [1, 56, 137, 'solana-mainnet', 'cosmos-hub', 'bitcoin'],
  })
  @IsOptional()
  chainId?: number | string;

  @ApiProperty({
    description: 'Blockchain ecosystem',
    enum: BlockchainEcosystem,
    example: BlockchainEcosystem.EVM,
  })
  @IsEnum(BlockchainEcosystem)
  ecosystem: BlockchainEcosystem;

  @ApiPropertyOptional({
    description: 'Network name for non-EVM chains',
    examples: ['mainnet', 'testnet', 'devnet'],
  })
  @IsOptional()
  @IsString()
  network?: string;
}

/**
 * Token information
 */
export class TokenInfo {
  @ApiProperty({
    description: 'Token contract address or identifier',
    examples: [
      '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT on Ethereum
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC on Solana
      'uusd', // UST on Terra
      'BTC.BTC', // Bitcoin on THORChain
      '0x0000000000000000000000000000000000000000', // Native token (ETH, BNB, etc.)
    ],
  })
  @IsString()
  address: string;

  @ApiProperty({
    description: 'Token standard',
    enum: TokenStandard,
    example: TokenStandard.ERC20,
  })
  @IsEnum(TokenStandard)
  standard: TokenStandard;

  @ApiPropertyOptional({
    description: 'Token symbol (for validation and display)',
    example: 'USDT',
  })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({
    description: 'Token decimals (auto-detected if not provided)',
    example: 18,
  })
  @IsOptional()
  @IsNumber()
  decimals?: number;

  @ApiProperty({
    description: 'Chain information where this token exists',
  })
  @ValidateNested()
  @Type(() => ChainInfo)
  chain: ChainInfo;
}

/**
 * Universal swap request DTO that can handle all swap scenarios
 */
export class UniversalSwapRequestDto {
  @ApiProperty({
    description: 'Token to sell',
    type: TokenInfo,
  })
  @ValidateNested()
  @Type(() => TokenInfo)
  sellToken: TokenInfo;

  @ApiProperty({
    description: 'Token to buy',
    type: TokenInfo,
  })
  @ValidateNested()
  @Type(() => TokenInfo)
  buyToken: TokenInfo;

  @ApiProperty({
    description: 'Amount to sell (in smallest unit, e.g., wei for ERC20)',
    example: '1000000000000000000',
  })
  @IsString()
  sellAmount: string;

  @ApiProperty({
    description: 'Wallet address that will execute the swap (format depends on ecosystem)',
    examples: [
      '0x9C30214BeBfC3cD36aA4A11a9540e019f2951c5C', // EVM address
      'DJZ7ZD8Cf4KF5Q7JfgXNSPDY7hM1DfgY3wGg9SKUkrfE', // Solana address
      'cosmos1...', // Cosmos address
      'thor1...', // THORChain address
    ],
  })
  @IsString()
  taker: string;

  @ApiPropertyOptional({
    description: 'Recipient address (defaults to taker if not provided)',
  })
  @IsOptional()
  @IsString()
  recipient?: string;

  @ApiPropertyOptional({
    description: 'Slippage tolerance in basis points (e.g., 100 = 1%)',
    example: 100,
    minimum: 1,
    maximum: 5000,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5000)
  slippageToleranceBps?: number;

  @ApiPropertyOptional({
    description: 'Swap type (auto-detected if not provided)',
    enum: SwapType,
  })
  @IsOptional()
  @IsEnum(SwapType)
  swapType?: SwapType;

  @ApiPropertyOptional({
    description: 'Maximum gas fee willing to pay (in native token units)',
    example: '0.01',
  })
  @IsOptional()
  @IsString()
  maxGasFee?: string;

  @ApiPropertyOptional({
    description: 'Deadline for the swap (Unix timestamp)',
    example: 1640995200,
  })
  @IsOptional()
  @IsNumber()
  deadline?: number;

  @ApiPropertyOptional({
    description: 'Preferred aggregator/router (leave empty for auto-selection)',
    examples: ['0x', 'odos', 'lifi', 'thorchain', 'jupiter'],
  })
  @IsOptional()
  @IsString()
  preferredProvider?: string;

  @ApiPropertyOptional({
    description: 'Enable MEV protection (EVM chains only)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  enableMevProtection?: boolean;

  @ApiPropertyOptional({
    description: 'Bridge preferences for cross-chain swaps',
    type: 'array',
    items: { type: 'string' },
    examples: [['stargate', 'across'], ['hop', 'cbridge']],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredBridges?: string[];

  @ApiPropertyOptional({
    description: 'Additional metadata for specific ecosystems',
    example: { priorityFee: '0.001', memo: 'swap:BTC.BTC', computeUnits: 200000 },
  })
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Skip validation and simulation (faster but riskier)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  skipValidation?: boolean;

  @ApiPropertyOptional({
    description: 'Return multiple route options',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  returnMultipleRoutes?: boolean;

  @ApiPropertyOptional({
    description: 'Maximum number of routes to return',
    default: 3,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxRoutes?: number;
}

/**
 * Swap route information
 */
export class SwapRoute {
  @ApiProperty({
    description: 'Provider/aggregator name',
    example: 'lifi',
  })
  provider: string;

  @ApiProperty({
    description: 'Estimated output amount',
    example: '999500000',
  })
  outputAmount: string;

  @ApiProperty({
    description: 'Estimated gas cost',
    example: '0.0045',
  })
  estimatedGas: string;

  @ApiProperty({
    description: 'Route steps for cross-chain swaps',
    type: 'array',
    items: { type: 'object' },
  })
  steps: Array<{
    action: 'swap' | 'bridge' | 'wrap' | 'unwrap';
    provider: string;
    fromToken: string;
    toToken: string;
    fromChain: string;
    toChain: string;
    estimatedTime: number; // in seconds
  }>;

  @ApiProperty({
    description: 'Total estimated execution time in seconds',
    example: 180,
  })
  estimatedTime: number;

  @ApiProperty({
    description: 'Route quality score (0-100)',
    example: 95,
  })
  qualityScore: number;
}

/**
 * Universal swap response
 */
export class UniversalSwapResponseDto {
  @ApiProperty({
    description: 'Detected swap type',
    enum: SwapType,
  })
  swapType: SwapType;

  @ApiProperty({
    description: 'Available routes',
    type: [SwapRoute],
  })
  routes: SwapRoute[];

  @ApiProperty({
    description: 'Recommended route (highest quality score)',
    type: SwapRoute,
  })
  recommendedRoute: SwapRoute;

  @ApiProperty({
    description: 'Transaction data for execution',
    example: { to: '0x...', data: '0x...', value: '0' },
  })
  transactionData: any;

  @ApiProperty({
    description: 'Warnings or important notes',
    type: 'array',
    items: { type: 'string' },
  })
  warnings: string[];
}