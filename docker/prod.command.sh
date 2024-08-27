#!/bin/bash

# This should be loaded in the apps/node directory

# Check if the APP ENV is indexer-api
if [ "$APP" = "indexer-api" ]; then
    cd ../../packages/indexer-database
    npm run typeorm migration:run -- --dataSource dist/migrations.config.js
    cd ../../apps/node
fi

node dist/app.js
