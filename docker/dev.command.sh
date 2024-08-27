#!/bin/bash

# Check if the APP ENV is indexer-api
if [ "$APP" = "indexer-api" ]; then
    pnpm db:indexer-database:migrate:run
fi

pnpm --filter @repo/node-app start
