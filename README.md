# Across Indexer

Across Indexer monorepo

## What's inside?

You can read further details on each component's README file

### Packages

Configuration packages:

- `@repo/eslint-config`: `eslint` configurations
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

Other components that need to use these configurations should include the package names in their dev dependencies and then extend the configurations from component-local configuration files. For example:

```json
// a component package.json
{
  // ...
  "devDependencies": {
    // ...
    "eslint-config": "workspace:*",
    "tsconfig": "workspace:*"
  }
}
```

```json
// a component tsconfig.json
{
  "extends": "@repo/typescript-config/base.json",
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"],
  // ...
}
```

```javascript
// a component .eslintrc.js
module.exports = {
  extends: ["@repo/eslint-config/index.js"],
  // ...
};
```

### Utilities

This Turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting

## How to use

### Prerequisites

Before getting started, ensure that the following are installed and available in your environment:

- **Node.js**: Version 20.x
- **Redis**
- **Docker**

#### Environment Variables

The development environment requires a set of environment variables to be configured. Please refer to the `.env.example` file in the root for the complete list of required variables. To set up your configuration, you can copy the template as follows:

```bash
cp .env.example .env
```

### Installing dependencies:

To install dependencies for all apps and packages, run the following command from the root of the repository:

```bash
pnpm install
```

### Build

To build all apps and packages, run the following command:

```bash
pnpm build
```

**Note:** Call `pnpm install` before running `pnpm build` if you've added a new package or updated dependencies.

#### Configuration Options

- **HubPool Indexer:**  
  To enable the hubpool indexer, set the `ENABLE_HUBPOOL_INDEXER` environment variable to `true`.

- **SpokePool Indexer:**  
  To enable the spoke pool indexer, set the `SPOKEPOOL_CHAINS_ENABLED` environment variable to a comma-separated list of chain IDs you wish to index (e.g., `SPOKEPOOL_CHAINS_ENABLED=1,10,137`).  
  Additionally, ensure that a corresponding RPC environment variable is set for each enabled chain.

For any additional configuration, refer to the `.env.example` file for a list of required environment variables.

### Using a Developer Environment

This repository is configured to use Docker Compose to create a development environment with all external dependencies.

#### Starting Docker Development Environment

To start the development environment, run the following command:

```sh
docker-compose up
```

#### Stopping the Environment

To stop the development environment, run the following command:

```sh
docker-compose down
```
#### Running Applications

Each application (the indexer + the api) will run in the development environment. This is
enabled by default and managed by the `docker-compose.yml` file.

### Running the Indexer Locally

To run the indexer locally, follow the steps below. All commands should be executed from the root directory of the repository.

1. **Install Dependencies**

Install all project dependencies using:

```sh
pnpm install
```

2. **Start Database Services**

Launch the required Redis and Postgres services using Docker:

```sh
docker compose up redis postgres -d
```

3. **Run Database Migrations**

Copy your `.env` file over to `./packages/index-database`

Apply database migrations to ensure the schema is up to date:

```sh
pnpm db:indexer-database:migrate:run
```

4. **Build and Start the Indexer**

Copy of your `.env` over to `apps/node/src`.

Build the project and start the indexer application:

```sh
pnpm build && pnpm start:indexer
```

### Managing Dependencies with Turborepo and pnpm

Turborepo recommends installing dependencies directly within the component or package that uses them.

To add a dependency to the `package.json` of the current workspace, run:

```bash
pnpm add some-runtime-package
pnpm add -D some-dev-dependency-package
```

To add a dependency to a specific workspace by name, regardless of your current directory, use:

```bash
pnpm add some-runtime-package --filter someworkspace
pnpm add -D some-dev-dependency-package --filter someworkspace
```

To update the root `package.json` from any location, add or remove dependencies using the `-w` (workspace root) flag:

```bash
pnpm add -w some-runtime-package
pnpm add -wD some-dev-dependency-package
```

**Example:**

### Creating a new library

Avoid putting shared code in any app. Instead, create a new package with the shared code and have the apps import it. To do so, you can use this repo's template package following instructions [here](./packages/template/README.md).

## Useful Links

Learn more about the power of Turborepo:

- [Tasks](https://turbo.build/repo/docs/core-concepts/monorepos/running-tasks)
- [Caching](https://turbo.build/repo/docs/core-concepts/caching)
- [Remote Caching](https://turbo.build/repo/docs/core-concepts/remote-caching)
- [Filtering](https://turbo.build/repo/docs/core-concepts/monorepos/filtering)
- [Configuration Options](https://turbo.build/repo/docs/reference/configuration)
- [CLI Usage](https://turbo.build/repo/docs/reference/command-line-reference)
