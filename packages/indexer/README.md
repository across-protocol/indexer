# Indexer
This package is meant to read data from an rpc provider, modify it as necessary and insert into a database.

## Run
Using Docker:

From the root folder, run:
- `pnpm run dev-env:up`
- `pnpm run dev-env:run-app:indexer` this command will execute migrations if needed and run the indexer.

Without docker:

1. Set the database connection environment variables in packages/indexer-database/.env
2. From packages/indexer-database run `pnpm run db:migration:run` or from the root folder run `pnpm run db:indexer-database:migrate:run`.
3. Go to apps/node and run `APP=indexer pnpm start` or from the root folder run `pnpm run start:indexer`

## Testing

This package includes unit, integration, and non-Docker end-to-end (E2E) tests.

**Test File Naming Conventions**:
To ensure proper test execution with the new commands, please adhere to the following naming conventions for your test files:
*   **Unit Tests**: Files should end with `*.unit.test.ts`
*   **Integration Tests**: Files should end with `*.integration.test.ts`
*   **Docker E2E Tests**: Files should end with `*.e2e.test.ts`

**Configuration**:
For these tests to run correctly, you need to provide RPC URLs for the testnet chains. Create a `.env.test` file at the **root of the repository** (if it doesn't already exist) and add the necessary RPC provider URLs.

For example, if running CCTP tests that interact with Arbitrum Sepolia (chain ID 421614), you must include:

```
RPC_PROVIDER_URLS_421614="<your_arbitrum_sepolia_rpc_url>"
```

**Running Tests**:
Navigate to the `packages/indexer` directory to run the following commands:

*   **Run all tests (Unit, Integration, and E2E)**:
    ```bash
    pnpm test
    ```
*   **Run only Unit Tests**:
    ```bash
    pnpm test:unit
    ```
*   **Run only Integration Tests**:
    ```bash
    pnpm test:integration
    ```
*   **Run only E2E Tests**:
    ```bash
    pnpm test:e2e
    ```

## ENV
```
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=user
DATABASE_PASSWORD=password
DATABASE_NAME=mydatabase

REDIS_HOST=localhost
REDIS_PORT=6380

RPC_PROVIDER_URLS_1=https://mainnet.infura.io/v3/xxx
RPC_PROVIDER_URLS_10=https://optimism-mainnet.infura.io/v3/xxx
RPC_PROVIDER_URLS_137=https://polygon-mainnet.infura.io/v3/xxx
HUBPOOL_CHAIN=1
SPOKEPOOL_CHAINS_ENABLED=1,2
PROVIDER_CACHE_TTL=3600

// optional
PROVIDER_CACHE_NAMESPACE=indexer_provider_cache
NODE_MAX_CONCURRENCY=1
NODE_PCT_RPC_CALLS_LOGGED_=100
STANDARD_TTL_BLOCK_DISTANCE=1
NO_TTL_BLOCK_DISTANCE=1000
PROVIDER_CACHE_TTL=100000
NODE_QUORUM=1
NODE_RETRIES=2
NODE_RETRY_DELAY=1000

ENABLE_HUBPOOL_INDEXER=true
ENABLE_BUNDLE_EVENTS_PROCESSOR=true
ENABLE_BUNDLE_INCLUDED_EVENTS_SERVICE=true
ENABLE_BUNDLE_BUILDER=true
ENABLE_PRICE_WORKER=false
ENABLE_CCTP_INDEXER=false

COINGECKO_API_KEY=
BUNDLE_EVENTS_SERVICE_START_BLOCK_NUMBER=
INDEXING_DELAY_SECONDS=
```
