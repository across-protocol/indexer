# Indexer API
Serve indexed data from postgres through restful endpoints.

## Usage
To run use the apps/node package and in the package root use `APP=indexer-api pnpm start`.

## Adding new indexer endpoints
This package is designed to allow new endpoints to be developed independently and added easily with minimal boilerplate.

1. Create a new file or folder under `src/services`, see `src/services/example.ts` for the general structure.
2. make sure you export an express router which can call into your indexed data.
3. Add your router into the `src/main.ts` `Main` function, for example
```
  // originally
  const exampleRouter = services.example.getRouter();
  const app = ExpressApp({ example: exampleRouter });

  // becomes
  const exampleRouter = services.example.getRouter();
  const myNewService = services.myNewService.getRouter();

  const app = ExpressApp({ 
      example: exampleRouter,
      myNewService: myNewService 
  });

  // this will expose your service at localhost:8080/myNewService

```

Thats it!

## Testing new indexer endpoints
See the `src/services/example.test.ts` file for how we can test new endpoints, as well as the express endpoints.

