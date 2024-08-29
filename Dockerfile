# Set the build image
FROM node:20 AS development

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

# Build the dependencies into a node_modules folder
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy the rest of the files & build the app
COPY ./apps ./apps
COPY ./packages ./packages
RUN pnpm build

# Set the production image
FROM node:20-alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

# Copy pnpm from the development stage
COPY --from=development /usr/local/bin/pnpm /usr/local/bin/pnpm

# Copy over the built files from the development stage
COPY --from=development /usr/src/app/apps ./apps
COPY --from=development /usr/src/app/packages ./packages
COPY --from=development /usr/src/app/node_modules ./node_modules

# Change the working directory to the apps/node directory
WORKDIR /usr/src/app/apps/node

COPY ./docker ./docker

CMD ["sh", "./docker/prod.command.sh"]
