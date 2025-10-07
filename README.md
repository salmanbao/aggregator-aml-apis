# Aggregator AML APIs

A comprehensive NestJS-based API for non-custodial wallet swaps via multiple DEX aggregators. This service ensures that all output tokens return to the same wallet, maintaining non-custodial principles.

## Features

- **Multi-Aggregator Support**: 0x Protocol, 1inch, ParaSwap, and CoW Protocol
- **Non-Custodial**: All transactions are signed and broadcast from the user's wallet
- **Pre-flight Checks**: Comprehensive validation before transaction execution
- **Automatic Approvals**: Handles ERC-20 token approvals automatically
- **Best Price Discovery**: Compares quotes across multiple aggregators
- **Comprehensive Logging**: Full transaction tracking and error handling
- **Swagger Documentation**: Interactive API documentation

## Supported Chains

- Ethereum (1)
- Polygon (137)
- BSC (56)
- Arbitrum (42161)
- Optimism (10)
- Base (8453)
- Avalanche (43114)

## Architecture

### Core Components

- **Core Module**: Global filters, interceptors, guards, and pipes
- **Shared Module**: Common utilities and HTTP services
- **Swap Module**: Main swap functionality with controllers and services

### Aggregator Services

- **0x Protocol**: Primary aggregator with firm quotes and Permit2 support
- **1inch**: Alternative aggregator with competitive pricing
- **ParaSwap**: Additional liquidity source
- **CoW Protocol**: MEV-resistant intent-based swaps

### Key Services

- **QuoteService**: Manages quote retrieval from aggregators
- **SwapExecutionService**: Handles swap execution with pre-flight checks
- **ApprovalService**: Manages ERC-20 token approvals
- **WalletService**: Blockchain interaction and transaction handling

## API Endpoints

### Swap Operations

- `POST /swap/quote` - Get swap quote from aggregators
- `POST /swap/quotes` - Get quotes from multiple aggregators
- `POST /swap/best-quote` - Get best quote from all aggregators
- `POST /swap/compare-quotes` - Compare quotes from different aggregators
- `POST /swap/execute` - Execute token swap

### Wallet Operations

- `POST /swap/balance` - Get wallet balance for a token
- `POST /swap/balances` - Get multiple token balances
- `GET /swap/aggregators` - Get supported aggregators for a chain

### Approval Operations

- `POST /swap/approval/status` - Check token approval status
- `POST /swap/approval/execute` - Execute token approval transaction

### Health Check

- `GET /swap/health` - Service health check

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd aggregator-aml-apis
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment file:
```bash
cp env.example .env
```

4. Configure environment variables in `.env`:
```env
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*

# Optional: Add your API keys for better rate limits
ZEROX_API_KEY=your_0x_api_key_here
ONEINCH_API_KEY=your_1inch_api_key_here
PARASWAP_API_KEY=your_paraswap_api_key_here
COW_API_KEY=your_cow_api_key_here
```

5. Start the application:
```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## Usage Examples

### Get Swap Quote

```bash
curl -X POST http://localhost:3000/swap/quote \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 1,
    "sellToken": "0xA0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b",
    "buyToken": "0xB0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b",
    "sellAmount": "1000000000000000000",
    "taker": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "slippagePercentage": 0.5
  }'
```

### Execute Swap

```bash
curl -X POST http://localhost:3000/swap/execute \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 1,
    "sellToken": "0xA0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b",
    "buyToken": "0xB0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b",
    "sellAmount": "1000000000000000000",
    "privateKey": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "slippagePercentage": 0.5
  }'
```

### Get Wallet Balance

```bash
curl -X POST http://localhost:3000/swap/balance \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 1,
    "walletAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "tokenAddress": "0xA0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b"
  }'
```

## Security Features

- **Non-Custodial**: Private keys never leave the client
- **Input Validation**: Comprehensive validation of all inputs
- **Rate Limiting**: Built-in rate limiting to prevent abuse
- **Error Handling**: Detailed error messages without exposing sensitive data
- **Transaction Verification**: Pre-flight checks ensure transaction validity

## Development

### Running Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

### Code Quality

```bash
# Linting
npm run lint

# Formatting
npm run format
```

## API Documentation

Once the application is running, visit `http://localhost:3000/api/docs` for interactive Swagger documentation.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

This project is licensed under the UNLICENSED license.

## Support

For support and questions, please open an issue in the repository.