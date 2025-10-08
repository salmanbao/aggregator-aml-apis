# 0x Protocol v2 Swap API

A comprehensive NestJS-based API for non-custodial token swaps using 0x Protocol v2. This service provides secure, efficient token swapping with gasless approvals via Permit2, ensuring all output tokens return to the same wallet while maintaining non-custodial principles.

## Features

- **0x Protocol v2 Integration**: Latest 0x API with Permit2 support for gasless approvals
- **Non-Custodial**: All transactions are signed and broadcast from the user's wallet
- **Permit2 Support**: Gasless token approvals for supported tokens
- **Pre-flight Checks**: Comprehensive validation before transaction execution
- **Automatic Approvals**: Handles both ERC-20 and Permit2 approvals automatically
- **Comprehensive Error Handling**: Detailed error messages and retry logic
- **Multi-Chain Support**: Works across 7 major EVM chains
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
- **Swap Module**: Main swap functionality with 0x Protocol v2 integration

### Key Services

- **ZeroXService**: 0x Protocol v2 API integration with comprehensive error handling
- **Permit2Service**: Gasless approval management using Permit2
- **QuoteService**: Manages quote retrieval from 0x Protocol v2
- **SwapExecutionService**: Handles swap execution with pre-flight checks and retry logic
- **ApprovalService**: Manages both ERC-20 and Permit2 token approvals
- **WalletService**: Blockchain interaction and transaction handling

## API Endpoints

### Swap Operations

- `POST /swap/quote` - Get swap quote from 0x Protocol v2
- `POST /swap/quotes` - Get quotes from 0x Protocol v2 (simplified for single aggregator)
- `POST /swap/best-quote` - Get best quote from 0x Protocol v2
- `POST /swap/compare-quotes` - Compare quotes (simplified for single aggregator)
- `POST /swap/execute` - Execute token swap with 0x Protocol v2

### Wallet Operations

- `POST /swap/balance` - Get wallet balance for a token
- `POST /swap/balances` - Get multiple token balances
- `GET /swap/aggregators` - Get supported aggregators (returns 0x Protocol)

### Approval Operations

- `POST /swap/approval/status` - Check token approval status (ERC-20 and Permit2)
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

# 0x Protocol API Key (recommended for better rate limits)
ZEROX_API_KEY=your_0x_api_key_here

# RPC URLs (optional - defaults to public RPCs)
ETHEREUM_RPC_URL=https://eth.llamarpc.com
POLYGON_RPC_URL=https://polygon.llamarpc.com
BSC_RPC_URL=https://bsc.llamarpc.com
ARBITRUM_RPC_URL=https://arbitrum.llamarpc.com
OPTIMISM_RPC_URL=https://optimism.llamarpc.com
BASE_RPC_URL=https://base.llamarpc.com
AVALANCHE_RPC_URL=https://avalanche.llamarpc.com

# Logging
LOG_LEVEL=info
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

### Get Swap Quote (0x Protocol v2)

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

### Execute Swap (with Permit2 support)

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

### Check Approval Status (ERC-20 and Permit2)

```bash
curl -X POST http://localhost:3000/swap/approval/status \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 1,
    "tokenAddress": "0xA0b86a33E6441b8c4C8C0e1c7B4b4b4b4b4b4b4b",
    "owner": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "spender": "0xdef1c0ded9bec7f1a1670819833240f027b25eff"
  }'
```

## Security Features

- **Non-Custodial**: Private keys never leave the client
- **Permit2 Integration**: Gasless approvals for supported tokens
- **Input Validation**: Comprehensive validation of all inputs
- **Rate Limiting**: Built-in rate limiting to prevent abuse
- **Error Handling**: Detailed error messages without exposing sensitive data
- **Transaction Verification**: Pre-flight checks ensure transaction validity
- **Retry Logic**: Automatic retry with exponential backoff for failed requests
- **Comprehensive Logging**: Full transaction tracking and error handling

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