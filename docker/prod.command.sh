#!/bin/bash

# This should be loaded in the apps/node directory

# Only run migrations if the RUN_MIGRATIONS environment variable is set to true
if [ "$RUN_MIGRATIONS" = "true" ]; then
    # We need to run the migrations files located in the `packages/indexer-database` package
    # We need to do the following:
    #   1. Change directory to `packages/indexer-database`
    #   2. Run the migration files (overriding the default `migrations.config.ts` file
    #      with `migrations.config.js`)
    #   3. Reset the directory back to `apps/node`
    # Note: this operation is idempotent, so it can be run multiple times without any issues
    cd ../../packages/indexer-database
    npm run typeorm migration:run -- --dataSource dist/migrations.config.js
    cd ../../apps/node
fi

node dist/app.js
