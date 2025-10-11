# Provider Ports Architecture Documentation

## Overview

The aggregator AML APIs project now implements a **Provider Ports** pattern that decouples provider-specific code from business logic, making it trivial to add new aggregators and routing services. This architecture follows the **Interface Segregation Principle** and provides stable interfaces for different types of swap providers.

## Architecture Components

### 1. Provider Ports (Interfaces)

Located in `src/swap/models/ports.ts`, these interfaces define stable contracts:

- **`IOnchainAggregator`** - For same-chain swaps (0x, 1inch, Odos, ParaSwap)
- **`IMetaAggregator`** - For cross-chain routing (LI.FI, Socket, Rango)
- **`ISolanaRouter`** - For Solana ecosystem swaps (Jupiter, Orca, Raydium)
- **`INativeRouter`** - For native L1 assets (THORChain, Maya)
- **`IProvider`** - Universal interface for health monitoring

### 2. Provider Organization

```
src/swap/services/providers/
├── evm-aggregators/     # 0x, 1inch, Odos, ParaSwap
├── meta/               # LI.FI, Socket, Rango  
├── solana/             # Jupiter, Orca, Raydium
└── native-l1/          # THORChain, Maya
```

### 3. Enhanced Aggregator Manager

The `EnhancedAggregatorManagerService` orchestrates all provider types:

- **Provider Registry** - Maps provider names to implementations
- **Health Monitoring** - Tracks provider health with caching
- **Intelligent Routing** - Routes requests to healthy providers
- **Fallback Logic** - Automatically tries alternatives on failures

## Implemented Providers

### EVM Aggregators (`IOnchainAggregator`)

#### 1. ZeroX Service (`zero-x.service.ts`)
- **Provider**: 0x Protocol v2
- **Strategies**: AllowanceHolder (recommended), Permit2 (advanced)
- **Chains**: Ethereum, Polygon, BSC, Arbitrum, Optimism, Base, Avalanche
- **Features**: Strategy-specific spender addresses, validation, error handling

#### 2. OneInch Service (`oneinch.service.ts`)  
- **Provider**: 1inch v5 API
- **Chains**: Ethereum, BSC, Polygon, Optimism, Arbitrum, Avalanche, Base
- **Features**: Dynamic spender addresses, comprehensive error handling

### Meta Aggregators (`IMetaAggregator`)

#### 1. LiFi Service (`lifi.service.ts`)
- **Provider**: LI.FI cross-chain aggregator
- **Features**: Multi-step routes, bridge + swap combinations
- **Chains**: 10+ EVM chains supported
- **Routing**: Optimal path selection with confidence scoring

### Solana Routers (`ISolanaRouter`)

#### 1. Jupiter Service (`jupiter.service.ts`)
- **Provider**: Jupiter aggregator
- **Features**: Best price routing, multiple DEX sources
- **Network**: Solana mainnet (chainId: 101)
- **Capabilities**: Transaction building, token pair validation

### Native L1 Routers (`INativeRouter`)

#### 1. THORChain Service (`thorchain.service.ts`)
- **Provider**: THORChain protocol
- **Features**: Bitcoin to EVM bridges, native asset swaps
- **Sources**: Bitcoin, Ethereum, BSC, Avalanche
- **Capabilities**: Cross-chain tracking, memo-based routing

## Usage Examples

### 1. EVM Same-Chain Swap

```typescript
import { EnhancedAggregatorManagerService } from './enhanced-aggregator-manager.service';

// Get quote using best available provider
const quote = await aggregatorManager.getEvmQuote({
  chainId: 1,
  sellToken: '0xA0b86a33...',
  buyToken: '0xdAC17F958...',
  sellAmount: '1000000000000000000',
  taker: '0x9C30214Be...',
  slippagePercentage: 1,
});

// Use specific provider
const zeroXQuote = await aggregatorManager.getEvmQuote(request, '0x');
```

### 2. Cross-Chain Routing

```typescript
// Get cross-chain routes
const routes = await aggregatorManager.getCrossChainRoutes({
  fromChainId: 1,      // Ethereum
  toChainId: 137,      // Polygon
  fromToken: '0xA0b86a33...',
  toToken: '0x2791Bca...',
  amount: '1000000000000000000',
  slippageBps: 100,    // 1% slippage
  userAddress: '0x9C30214Be...',
});

// Routes sorted by confidence and output amount
console.log(`Found ${routes.length} routes, best output: ${routes[0].totalEstimatedOut}`);
```

### 3. Solana Swap

```typescript
// Get Solana swap quote
const solQuote = await aggregatorManager.getSolanaQuote({
  fromMint: 'So11111111111111111111111111111111111111112', // Wrapped SOL
  toMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',   // USDC
  amount: '1000000000',  // 1 SOL
  slippageBps: 50,       // 0.5% slippage
});
```

### 4. Native L1 Cross-Chain

```typescript
// Bitcoin to Ethereum
const nativeQuote = await aggregatorManager.getNativeQuote({
  toChainId: 1,                    // Ethereum
  toToken: '0xdAC17F958...',       // USDT
  amountSats: '10000000',          // 0.1 BTC
  userAddress: '0x9C30214Be...',
});
```

## Adding New Providers

### 1. Implement Provider Interface

```typescript
// src/swap/services/providers/evm-aggregators/paraswap.service.ts
@Injectable()
export class ParaSwapService implements IOnchainAggregator, IProvider {
  getProviderName(): string {
    return 'ParaSwap';
  }
  
  supportsChain(chainId: number): boolean {
    return [1, 137, 56, 42161].includes(chainId);
  }
  
  async getQuote(request: SwapRequest): Promise<SwapQuote> {
    // Implementation
  }
  
  async buildTx(request: SwapRequest): Promise<TransactionBuild> {
    // Implementation  
  }
  
  async healthCheck(): Promise<ProviderHealth> {
    // Implementation
  }
  
  getConfig(): ProviderConfig {
    // Implementation
  }
}
```

### 2. Register in Enhanced Manager

```typescript
// enhanced-aggregator-manager.service.ts
constructor(
  // ... existing providers
  private readonly paraSwapService: ParaSwapService,
) {
  this.initializeProviders();
}

private initializeProviders(): void {
  // Register new provider
  this.evmAggregators.set(this.paraSwapService.getProviderName(), this.paraSwapService);
}
```

### 3. Add to Module

```typescript
// swap.module.ts
@Module({
  providers: [
    // ... existing providers
    ParaSwapService,
  ],
  exports: [
    // ... existing exports
    ParaSwapService,
  ],
})
export class SwapModule {}
```

## Health Monitoring

### Provider Health Status

```typescript
// Get comprehensive health status
const health = await aggregatorManager.getProvidersHealth();

console.log('EVM Providers:', health.evm);
console.log('Meta Providers:', health.meta);
console.log('Solana Providers:', health.solana);
console.log('Native Providers:', health.native);
```

### Health-Based Routing

The enhanced aggregator manager automatically:
- **Checks provider health** before routing requests
- **Caches health status** for 5 minutes to avoid excessive checks
- **Routes to healthy providers** based on latency and reliability
- **Implements fallback logic** when providers fail

## Configuration Management

### Environment Variables

```bash
# EVM Aggregators
ZEROX_API_KEY=your_0x_api_key
ONEINCH_API_KEY=your_1inch_api_key

# Meta Aggregators  
LIFI_API_KEY=your_lifi_api_key

# Solana Routers
JUPITER_API_KEY=your_jupiter_api_key

# Native L1 (THORChain uses public endpoints)
```

### Provider Configs

```typescript
// Get all provider configurations
const configs = aggregatorManager.getProviderConfigs();

// Example output:
{
  "evm_0x": {
    "name": "0x",
    "baseUrl": "https://api.0x.org",
    "enabled": true,
    "rateLimit": { "requests": 10, "perSeconds": 1 }
  },
  "meta_LI.FI": {
    "name": "LI.FI", 
    "baseUrl": "https://li.quest/v1",
    "enabled": true,
    "rateLimit": { "requests": 5, "perSeconds": 1 }
  }
}
```

## Extension Points

### 1. New Aggregator Types

To add new provider types (e.g., NFT marketplaces):

1. **Define interface** in `ports.ts`
2. **Create provider folder** under `providers/`
3. **Implement services** following existing patterns
4. **Add registry** in enhanced manager
5. **Update module** providers list

### 2. Advanced Features

#### Route Optimization

```typescript
// Custom route scoring
private calculateRouteScore(route: RouteQuote): number {
  let score = parseFloat(route.totalEstimatedOut);
  
  // Penalize high fees
  const totalFees = parseFloat(route.fees.gas) + parseFloat(route.fees.provider);
  score -= totalFees * 1.5;
  
  // Penalize long execution times
  if (route.etaSeconds && route.etaSeconds > 600) {
    score *= 0.9;
  }
  
  // Boost confident routes
  score *= (route.confidence || 0.8);
  
  return score;
}
```

#### Provider Selection Strategies

```typescript
enum ProviderStrategy {
  BEST_PRICE = 'best_price',      // Highest output amount
  FASTEST = 'fastest',            // Lowest latency provider  
  MOST_RELIABLE = 'reliable',     // Highest confidence score
  CHEAPEST_GAS = 'cheapest_gas',  // Lowest gas fees
}
```

## Migration from Legacy

### Backwards Compatibility

The legacy `AggregatorManagerService` remains available for existing integrations. New features should use `EnhancedAggregatorManagerService`.

### Migration Steps

1. **Update imports** to use enhanced manager
2. **Adapt method calls** to new interface patterns
3. **Add error handling** for multi-provider scenarios
4. **Test with provider failures** to verify fallback logic

## Best Practices

### 1. Error Handling

```typescript
try {
  const quote = await aggregatorManager.getEvmQuote(request);
} catch (error) {
  if (error.message.includes('No healthy')) {
    // Handle provider unavailability
    throw new ServiceUnavailableException('All providers temporarily unavailable');
  }
  throw new BadRequestException(`Quote failed: ${error.message}`);
}
```

### 2. Provider Selection

```typescript
// Prefer specific providers when needed
const quote = await aggregatorManager.getEvmQuote(request, '0x'); // Use 0x specifically

// Let system choose best provider
const quote = await aggregatorManager.getEvmQuote(request); // Automatic selection
```

### 3. Health Monitoring

```typescript
// Periodic health checks
setInterval(async () => {
  const health = await aggregatorManager.getProvidersHealth();
  logger.log('Provider health check:', health);
}, 5 * 60 * 1000); // Every 5 minutes
```

## Future Enhancements

1. **Provider Load Balancing** - Distribute requests across healthy providers
2. **Rate Limit Management** - Per-provider rate limiting and queuing
3. **Cost Optimization** - Dynamic provider selection based on costs
4. **MEV Protection** - Integration with MEV protection services
5. **Advanced Analytics** - Provider performance metrics and insights

This architecture provides a solid foundation for scaling the aggregator to support dozens of providers across multiple blockchain ecosystems while maintaining clean separation of concerns and excellent developer experience.