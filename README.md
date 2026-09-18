# Aggregator AML APIs

A NestJS reference implementation for a non-custodial, multi-provider token-swap API. The project combines EVM quote aggregation, provider routing, approval helpers, wallet operations, swap analysis, and Swagger documentation.

> **Important:** Despite the repository name, this codebase does not currently implement AML, sanctions, risk-scoring, or compliance screening. It is primarily a swap-aggregation API with some analytical helpers. Treat it as an educational/reference implementation, not as a production compliance system.

## Current status

- **EVM same-chain quotes:** Implemented through 0x and Odos adapters.
- **Provider selection:** Dynamic EVM selection based on chain support, health, latency, and request characteristics.
- **Cross-chain/provider adapters:** LI.FI, Jupiter, and THORChain adapters contain quote or routing logic; universal cross-chain execution is not complete.
- **Approval helpers:** EVM allowance checks, approval transactions, and Permit2-related helpers are present.
- **Universal execution:** The public `execute` and `status` endpoints are declared but intentionally return `400` until end-to-end execution is implemented.
- **Provider stubs:** Socket, Rango, Router Protocol, Orca, Raydium, and Maya are registered but not implemented.
- **Wallet coverage:** EVM wallet operations are implemented. Solana and Bitcoin wallet providers are placeholders.
- **License:** The package is marked `private: true` and `UNLICENSED`; no `LICENSE` file is present.
- **Developer-reported testing observation:** The maintainer reports that, during their own testing several months ago, a wallet's externally reported AML/risk score changed from approximately 90% to 15–25% after using the swap flow. This is an anecdotal observation, not a verified benchmark, service guarantee, or AML/compliance result. The service does not calculate AML scores, perform sanctions or risk screening, or control third-party scoring models. External scores may change for many reasons, so this observation must not be interpreted as evidence that the service reduces AML risk or enables compliance avoidance.

## Features

- NestJS 11 REST API
- Swagger UI at `/api/docs`
- Universal swap request schema for EVM, Solana, Cosmos, Bitcoin, THORChain, and Maya identifiers
- Same-chain EVM quote aggregation through 0x and Odos
- LI.FI cross-chain route retrieval and status parsing
- Jupiter Solana quote and transaction-building adapter
- THORChain native BTC quote and deposit-tracking adapter
- EVM token approval status and approval execution
- Permit2 data extraction and signing workflow helpers
- EVM transaction parsing with 0x Parser and selector-based fallback
- In-memory provider and wallet-provider registries
- Basic in-memory rate limiting
- Global response transformation and exception handling

## Limitations and non-goals

This repository is not a complete trading, custody, or compliance platform.

- No AML or sanctions screening is performed on addresses, transactions, or providers.
- No authentication or authorization layer protects the API.
- The default CORS configuration allows all origins.
- `privateKey` is accepted by approval-related endpoints and services. Never expose those endpoints to an untrusted network or send production keys to this service.
- Universal cross-chain, native-L1, and Solana quote routing is not fully wired end to end. Non-EVM categories can return placeholder routes.
- `POST /universal-swap/execute` and `POST /universal-swap/status` are not implemented.
- Socket, Rango, Router Protocol, Orca, Raydium, and Maya methods throw explicit not-implemented errors.
- Solana and Bitcoin wallet providers throw explicit not-implemented errors.
- Solana, Cosmos, and Bitcoin transaction parsing return minimal placeholder responses.
- Rate limiting is process-local and uses an in-memory map; it is not suitable for a multi-instance deployment.
- The current `.gitignore` does not ignore a root `.env` file. Add `.env` before committing real configuration.
- `eslint.config.mjs` contains an unexplained appended obfuscated payload. Review and remove it before using the repository as a trusted base.

## Requirements

- A current Node.js LTS release compatible with the dependencies in `package.json`
- pnpm
- Access to the blockchain RPCs and provider APIs required by the features you use

The project uses TypeScript path aliases (`@swap/*` and `@shared/*`). The production build succeeds, but the current Jest and e2e configurations do not consistently resolve those aliases; see [Current validation](#current-validation).

## Installation

```bash
git clone <repository-url>
cd aggregator-aml-apis
pnpm install --frozen-lockfile
cp env.example .env
```

Edit `.env` before starting the service. Do not commit it.

### Environment variables

The variables documented in `env.example` are:

| Variable             | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `PORT`               | HTTP port; defaults to `3000`                     |
| `NODE_ENV`           | Runtime environment                               |
| `CORS_ORIGIN`        | CORS origin; defaults to `*`                      |
| `ETHEREUM_RPC_URL`   | Ethereum RPC URL                                  |
| `POLYGON_RPC_URL`    | Polygon RPC URL                                   |
| `BSC_RPC_URL`        | BNB Smart Chain RPC URL                           |
| `ARBITRUM_RPC_URL`   | Arbitrum RPC URL                                  |
| `OPTIMISM_RPC_URL`   | Optimism RPC URL                                  |
| `BASE_RPC_URL`       | Base RPC URL                                      |
| `AVALANCHE_RPC_URL`  | Avalanche C-Chain RPC URL                         |
| `ZEROX_API_KEY`      | Optional 0x API key                               |
| `PARASWAP_API_KEY`   | Optional ParaSwap API key listed in `env.example` |
| `COW_API_KEY`        | Optional CoW API key listed in `env.example`      |
| `ODOS_REFERRAL_CODE` | Odos referral code                                |
| `LOG_LEVEL`          | Application logging level                         |

The source currently references `LIFI_API_KEY`, `JUPITER_API_KEY`, `SOCKET_API_KEY`, `RANGO_API_KEY`, and `ROUTER_API_KEY`; those variables are not included in `env.example`. Add only the keys needed for the adapters you are developing.

## Running the API

```bash
pnpm run start:dev
```

The service listens on:

- API: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/api/docs`
- Health check: `http://localhost:3000/universal-swap/health`

Production build and start:

```bash
pnpm run build
pnpm run start:prod
```

## Architecture

```text
src/
├── app.module.ts                 # Config, CoreModule, SharedModule, SwapModule
├── core/                         # Global guards, filters, interceptors, pipes
├── shared/                       # HTTP client, chain-list client, utilities
└── swap/
    ├── controllers/              # Universal swap and swap-analysis routes
    ├── dto/                      # Request/response validation schemas
    ├── models/                   # Legacy and port-facing data models
    ├── services/
    │   ├── blockchain/
    │   │   ├── analysis/         # Transaction parsing
    │   │   ├── approval/         # Allowance, approvals, Permit2 helpers
    │   │   └── wallet/           # EVM, Solana, and Bitcoin wallet ports
    │   ├── core/                 # Routing, cache, aggregation, execution
    │   └── providers/            # EVM, meta, Solana, and native adapters
    └── swap.module.ts             # Provider and service registration
```

`SwapModule` registers core services and provider adapters. Provider classes self-register with `AggregatorManagerService` or `WalletService` during module initialization. The EVM aggregator manager can select among registered providers and falls back to another provider when a preferred provider fails.

## API reference

Successful responses are wrapped by `ResponseTransformInterceptor` as:

```json
{
  "success": true,
  "data": {},
  "timestamp": "2026-09-18T00:00:00.000Z"
}
```

Unhandled errors use a similar envelope with `success: false` and an `error` object.

### Routes

| Method | Path                                    | Status                                                                       |
| ------ | --------------------------------------- | ---------------------------------------------------------------------------- |
| `GET`  | `/`                                     | Returns the root greeting                                                    |
| `GET`  | `/api/docs`                             | Swagger UI                                                                   |
| `POST` | `/universal-swap/quote`                 | EVM same-chain quote routing is implemented; other categories are incomplete |
| `POST` | `/universal-swap/pre-check`             | EVM checks are implemented; non-EVM checks are stubbed                       |
| `POST` | `/universal-swap/execute`               | Declared, returns `400` because universal execution is not implemented       |
| `POST` | `/universal-swap/status`                | Declared, returns `400` because status tracking is not implemented           |
| `POST` | `/universal-swap/approval/status`       | EVM allowance and Permit2 compatibility checks                               |
| `POST` | `/universal-swap/approval/execute`      | Executes an EVM approval using a supplied private key                        |
| `GET`  | `/universal-swap/supported-chains`      | Aggregates supported-chain metadata from quote providers                     |
| `GET`  | `/universal-swap/aggregators?chainId=1` | Lists aggregators supporting a chain                                         |
| `GET`  | `/universal-swap/health`                | Basic service health response                                                |
| `GET`  | `/swap-analysis/analyze`                | Analyzes routing type, complexity, requirements, and provider category       |
| `GET`  | `/swap-analysis/ecosystems`             | Lists ecosystem metadata and primary providers                               |

### Universal quote example

This example requests an Ethereum same-chain quote. Replace the token and wallet values with values appropriate for the selected chain.

```bash
curl -X POST http://localhost:3000/universal-swap/quote \
  -H 'Content-Type: application/json' \
  -d '{
    "sellToken": {
      "address": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      "standard": "native",
      "chain": { "chainId": 1, "ecosystem": "evm" }
    },
    "buyToken": {
      "address": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "standard": "erc20",
      "chain": { "chainId": 1, "ecosystem": "evm" }
    },
    "sellAmount": "1000000000000000000",
    "taker": "0x0000000000000000000000000000000000000001",
    "slippageToleranceBps": 100,
    "preferredProvider": "0x"
  }'
```

`sellAmount` is expressed in the smallest token unit. `slippageToleranceBps` uses basis points, where `100` represents 1%.

The universal controller currently routes EVM same-chain requests through `AggregatorManagerService`. Cross-chain, native-L1, and Solana categories are recognized by the request schema but are not fully connected to executable provider routes.

### Pre-check example

```bash
curl -X POST http://localhost:3000/universal-swap/pre-check \
  -H 'Content-Type: application/json' \
  -d '{
    "sellToken": {
      "address": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "standard": "erc20",
      "chain": { "chainId": 1, "ecosystem": "evm" }
    },
    "buyToken": {
      "address": "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "standard": "erc20",
      "chain": { "chainId": 1, "ecosystem": "evm" }
    },
    "sellAmount": "1000000",
    "taker": "0x0000000000000000000000000000000000000001"
  }'
```

For EVM requests, the pre-check can inspect chain compatibility, quote liquidity, token approval, wallet balance, and provider health. Non-EVM liquidity, approval, balance, and health checks currently return stubbed results.

### Approval endpoint warning

`POST /universal-swap/approval/execute` accepts `privateKey` and can sign an on-chain approval. Use it only in a trusted development environment. A production integration should keep keys in a wallet or signing service and expose only authenticated, narrowly scoped operations.

```json
{
  "chainId": 1,
  "privateKey": "REPLACE_WITH_A_DEVELOPMENT_KEY",
  "tokenAddress": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  "spender": "0x0000000000000000000000000000000000000000",
  "amount": "1000000"
}
```

### Swap analysis example

```bash
curl 'http://localhost:3000/swap-analysis/analyze?sellChain=1&sellEcosystem=evm&buyChain=137&buyEcosystem=evm&sellToken=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE&buyToken=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
```

The analysis endpoint does not execute or quote a swap. It returns routing classification, estimated complexity, requirements, supported providers, and warnings.

## Provider matrix

“Implemented” below means the adapter contains provider-specific logic. It does not necessarily mean the universal public endpoint provides complete end-to-end execution.

| Category        | Provider        | Current implementation                                                                           |
| --------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| EVM aggregator  | 0x              | Quote, transaction build, chain discovery, health check, AllowanceHolder and Permit2 quote paths |
| EVM aggregator  | Odos            | SOR quote, transaction assembly, expiry handling, chain discovery, health check                  |
| Meta aggregator | LI.FI           | Route retrieval, status parsing, token discovery, health check; route execution is a placeholder |
| Meta aggregator | Socket          | Registered stub; route, execution, status, and transaction methods are not implemented           |
| Meta aggregator | Rango           | Registered stub; route, execution, status, and transaction methods are not implemented           |
| Meta aggregator | Router Protocol | Registered stub; route, execution, status, and transaction methods are not implemented           |
| Solana router   | Jupiter         | Quote, transaction build, token discovery, price lookup, health check                            |
| Solana router   | Orca            | Registered stub; quote and transaction methods are not implemented                               |
| Solana router   | Raydium         | Registered stub; quote and transaction methods are not implemented                               |
| Native router   | THORChain       | BTC quote, deposit tracking, pool/network helpers, health check                                  |
| Native router   | Maya Protocol   | Registered stub; quote, execution, and tracking methods are not implemented                      |

The routing service currently returns `0x` and `odos` for EVM, `lifi` for meta routing, `jupiter` for Solana, and `thorchain` for native routing. Planned providers remain listed in comments or provider registries but should not be treated as available integrations.

## Security and production-readiness checklist

Before exposing this service:

- Add authentication, authorization, tenant scoping, and replay protection where appropriate.
- Replace wildcard CORS with an explicit allowlist.
- Remove or isolate every endpoint that accepts a private key.
- Add `.env` to `.gitignore` and use a secret manager in deployed environments.
- Add address, transaction, and provider-risk screening if the service is intended to support compliance workflows.
- Replace the in-memory rate limiter with a shared store such as Redis for multi-instance deployments.
- Add timeout, retry, circuit-breaker, and provider-rate-limit policies suitable for production traffic.
- Validate provider responses and chain/token metadata against authoritative allowlists.
- Add monitoring, structured audit logs, and alerting without logging secrets or private keys.
- Review the obfuscated trailing payload in `eslint.config.mjs` before trusting the repository.
- Publish under an explicit open-source license only after the maintainer chooses one.

## Development

Install dependencies and build:

```bash
pnpm install --frozen-lockfile
pnpm run build
```

Run the API in watch mode:

```bash
pnpm run start:dev
```

Run tests:

```bash
pnpm test --runInBand
pnpm test:e2e --runInBand
```

Check formatting without rewriting files:

```bash
pnpm exec prettier --check "README.md" "src/**/*.ts" "test/**/*.ts"
```

Run ESLint without applying fixes:

```bash
pnpm exec eslint "{src,apps,libs,test}/**/*.ts"
```

`pnpm run lint` runs ESLint with `--fix` and can modify source files. Review the diff before committing.

### Current validation

At the time this README was written:

- `pnpm run build` passes after installing dependencies.
- Unit tests have module-resolution failures involving `../../shared/utils/chain.utils` and `@swap/models/swap-request.model`.
- The e2e suite has a module-resolution failure involving `@swap/dto/universal-swap-request.dto`.
- Non-mutating ESLint reports existing formatting and TypeScript-safety issues.

These are repository validation issues, not a substitute for fixing the test and lint configuration before release.

## Contributing

1. Fork the repository and create a branch for one provider, route, or workflow.
2. Keep provider adapters behind the existing port interfaces where possible.
3. Add or update tests for validation, provider failures, fallback behavior, and chain support.
4. Clearly label stubs and incomplete universal routes in both code and documentation.
5. Do not add private keys, API keys, RPC credentials, or real wallet data to commits.
6. Run the build, tests, formatting check, and non-mutating lint before opening a pull request.
7. If adding AML or compliance functionality, document the data sources, decision policy, false-positive handling, and audit requirements explicitly.

Useful first contribution areas include:

- Wiring LI.FI, Jupiter, and THORChain adapters into universal quote responses.
- Implementing universal execution and status tracking.
- Completing Solana and Bitcoin wallet providers.
- Replacing placeholder provider health checks.
- Fixing Jest/e2e path-alias resolution.
- Adding authentication and secret-safe signing boundaries.
- Adding a real AML/risk-screening module if that is an intended project goal.

## License

`package.json` currently declares:

```json
{
  "private": true,
  "license": "UNLICENSED"
}
```

No separate `LICENSE` file is present. The code is therefore not granted for public reuse, redistribution, or commercial use under an open-source license. Choose and add an explicit license before publishing this repository as an educational or community project.
