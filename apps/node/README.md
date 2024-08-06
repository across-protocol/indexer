# apps/node
Generalizes entrypoint for any Node js applications.

## Different runtimes
This app is meant for running general node applications, it may not be suitable for other runtimes or frameworks,
in that case you must make a new application. 

## Start the example
1. Install dependencies with `pnpm install`. 
2. Build everything with `pnpm build`. 
3. Start the template example app with `APP=template pnpm start`

## adding an app
### Package requirements
This expects a package that conforms to a basic interface:
Create a package which exports a "main" function, which takes in an env type: `Record<string, string
Return value of the library is not used in the app, so you are free to return anything without affecting the runtime of the application.
You can copy packages/template to get you started quickly. 

### Adding a new app
You can copy packages/template into a new folder to get you started quickly. Follow directions in that readme for more info.

#### 1. Update package.json
1. In this package, edit the package.json file, adding the local repos package to dependencies, for example `"@repo/template": "workspace:*"`. 
The `workspace:*` notation is pnpm's way of denoting a local package. 
2. Run `pnpm install` to make sure it gets linked correctly.

#### 2. Update src/app.ts
Edit the src/app.ts file:
1. import the package, for example `import * as Template from "@repo/template"`
2. give it a unique name in the switch statement within the run function, for example: `case "template":`
3. Call the packages main function, passing in process.env, awaiting if necessary, for example: `await Template.Main(process.env);`
4. Return any data you want to log on success.

## Testing the new app
1. try a pnpm build in this package.
2. try a pnpm build in the root of the repo.
3. try a pnpm start in this package, using your app name as an env, for example: `APP=template pnpm start` and see that it runs.

