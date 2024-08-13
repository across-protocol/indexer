import { object, string, assert } from "superstruct";
import { ExpressApp } from "./express-app";
import * as services from "./services";

const databaseConfigStruct = object({
  host: string(),
  port: string(),
  user: string(),
  password: string(),
  dbName: string(),
});

export async function Main(env: Record<string, string | undefined>) {
  const { PORT = "8080" } = env;
  const port = Number(PORT);

  // Validate database config
  const databaseConfig = {
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    dbName: env.DATABASE_NAME,
  };
  assert(databaseConfig, databaseConfigStruct);

  const exampleRouter = services.example.getRouter();
  const app = ExpressApp({ example: exampleRouter });

  void (await new Promise((res) => {
    app.listen(port, () => res(app));
  }));
  console.log(`Indexer api listening on port ${port}`);
}
