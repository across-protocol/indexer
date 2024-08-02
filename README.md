# Across Indexer

Across Indexer monorepo

## What's inside?

You can read further details on each component's README file

### Apps

### Packages

Configuration packages:

- `@repo/eslint-config`: `eslint` configurations
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

Other components that need to use these configurations should include the package names in their dev dependencies and then extend the configurations from component-local configuration files. For example:

```
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

```
// a component tsconfig.json
{
  "extends": "@repo/typescript-config/base.json",
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"],
  // ...
}
```

```
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

### Installing dependencies:

To install dependencies for all apps and packages, run the following command from the root of the repository:

```
pnpm install
```

Turborepo suggests to install dependencies directly in the component that uses them.

To do that, add the dependency to the `package.json` of the component running the following commands from within the workspace:

```
pnpm add some-runtime-package
pnpm add -D some-dev-dependency-package
```

To add a dependency to a named workspace, regardless of the current workspace or directory, you can do:

```
pnpm add some-runtime-package --filter someworkspace
pnpm add -D some-dev-dependency-package --filter someworkspace
```

If you ever need to update the root `package.json`, no matter what directory you’re in, you can add and remove by including the -w switch:

```
pnpm add -w some-runtime-package
pnpm add -wD some-dev-dependency-package
```

### Build

To build all apps and packages, run the following command:

```
pnpm build
```

### Develop

To develop all apps and packages, run the following command:

```
pnpm dev
```

To run tasks only for the components you're currently working on, you can use the --filter flag:

```
turbo build --filter=<component>
turbo dev --filter=<component>
```

### Creating a new library

Avoid putting shared code in any app. Instead, create a new package with the shared code and have the apps import it. To do so:

1. Create the folder for the new library under the `/packages` directory.
2. Create the `package.json` with the `exports` key defining the entrypoints of the package. 
3. Create the `tsconfig.json`.
4. Add the `src` directory and the source code of the package.
5. Add the package to an existing app, modyfiying the app's dependencies:
```
// apps/my-app/package.json
{
  // ...
  "dependencies": {
    "@repo/<new-package>": "workspace:*",
  }
  // ...
}
```
As you updated the dependencies, make sure to run pnpm's installation command to update the lockfile.

It's also important to keep `turbo.json` file updated to ensure build outputs will be cached by Turborepo. For example:
```
{
  // ...
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
  }
}
```

## Useful Links

Learn more about the power of Turborepo:

- [Tasks](https://turbo.build/repo/docs/core-concepts/monorepos/running-tasks)
- [Caching](https://turbo.build/repo/docs/core-concepts/caching)
- [Remote Caching](https://turbo.build/repo/docs/core-concepts/remote-caching)
- [Filtering](https://turbo.build/repo/docs/core-concepts/monorepos/filtering)
- [Configuration Options](https://turbo.build/repo/docs/reference/configuration)
- [CLI Usage](https://turbo.build/repo/docs/reference/command-line-reference)
