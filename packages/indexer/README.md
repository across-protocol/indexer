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

## Test
In this package run `pnpm test`

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

PROVIDER_CACHE_NAMESPACE=indexer_provider_cache
MAX_CONCURRENCY=1
PCT_RPC_CALLS_LOGGED=100
STANDARD_TTL_BLOCK_DISTANCE=1
NO_TTL_BLOCK_DISTANCE=1000
PROVIDER_CACHE_TTL=100000
NODE_QUORUM_THRESHOLD=1
RETRIES=2
DELAY=1000
```
