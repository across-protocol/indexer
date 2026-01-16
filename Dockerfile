# Set the build image
FROM node:24

# Set the work directory
WORKDIR /usr/src/app

# We need to install pnpm globally to use it in the next step
RUN npm install -g pnpm turbo

# Copy in the dependencies files
COPY package.json ./
COPY pnpm-*.yaml ./
COPY turbo.json ./

COPY apps/node/package.json ./apps/node/package.json
COPY packages/indexer/package.json ./packages/indexer/package.json
COPY packages/indexer-api/package.json ./packages/indexer-api/package.json
COPY packages/indexer-database/package.json ./packages/indexer-database/package.json
COPY packages/persistence-example/package.json ./packages/persistence-example/package.json
COPY packages/template/package.json ./packages/template/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
COPY packages/webhooks/package.json ./packages/webhooks/package.json
COPY packages/error-handling/package.json ./packages/error-handling/package.json

# Build the dependencies into a node_modules folder
RUN pnpm install --frozen-lockfile

# Copy the rest of the files & build the app
COPY . .

# Build the monorepo
RUN pnpm build
