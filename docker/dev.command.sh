#!/bin/bash
pnpm db:indexer-database:migrate:run
pnpm --filter @repo/node-app start
