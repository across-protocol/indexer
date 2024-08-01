# Package Name
This is meant to be a template for quickly adding new package libraries.  Replace this readme with relevant information for your package.

## Adding a new package
1. go into the package folder in this repo.
2. cp -r template your_package_name
3. Edit the package.json file renaming the "name" property.
4. add dependencies as needed.

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
- check - eslint and prettier code checking ( no changes )
- test - run jest testing

