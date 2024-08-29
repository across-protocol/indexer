#!/bin/bash

# Only run migrations if the RUN_MIGRATIONS environment variable is set to true
if [ "$RUN_MIGRATIONS" = "true" ]; then
    pnpm db:indexer-database:migrate:run
fi
pnpm --filter @repo/node-app start
