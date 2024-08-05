# Package Name

This is meant to be an example of using a persistence layer in this monorepo.

## Adding a new package

Refer to the `template` package for a basic template to start a new package.

## Template features

This template will set you up with typescript, eslint, prettier, some basic scripts, and a main file entry point.

### Scripts

- build - typescript build and output to dist
- watch - build watching for changes
- format - prettier code fixing
- lint - eslint code fixing
- fix - eslint and prettier code fixing
- lint:check - eslint code checking ( no changes )
- format:check - prettier code checking ( no changes )
- build:check - run type check without emitting files
- check - eslint and prettier and typescript code checking ( no changes )
- test - run mocha testing
- test:watch - run mocha testing
- coverage - see testing coverage

### Adding tests

Add a `example.test.ts` file to any folder and mocha will find it.
** note: chai v5 breaks typescript support, so we explicitly use chai 4 **
