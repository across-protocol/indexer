# Indexer
This package is meant to read data from an rpc provider, modify it as necessary and insert into a database.

## Run
To run:

1. Go to packages/indexer-database and run `pnpm db:migration:run`. When running without docker, set the database config on packages/indexer-database/.env
2. Go to apps/node and run `APP=indexer pnpm start`

## Test
In this package run `pnpm test`
