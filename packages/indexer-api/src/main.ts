import { object, string, assert } from "superstruct";
import { ExpressApp } from "./express-app";
import { createDataSource, DatabaseConfig } from "@repo/indexer-database";
import * as services from "./services";
import winston from "winston";
import { type Router } from "express";

export async function connectToDatabase(
  databaseConfig: DatabaseConfig,
  logger: winston.Logger,
) {
  try {
    const database = await createDataSource(databaseConfig).initialize();
    logger.info("Postgres connection established");
    return database;
  } catch (error) {
    logger.error("Unable to connect to database", error);
    throw error;
  }
}
function getPostgresConfig(
  env: Record<string, string | undefined>,
): DatabaseConfig | undefined {
  return env.DATABASE_HOST &&
    env.DATABASE_PORT &&
    env.DATABASE_USER &&
    env.DATABASE_PASSWORD &&
    env.DATABASE_NAME
    ? {
        host: env.DATABASE_HOST,
        port: env.DATABASE_PORT,
        user: env.DATABASE_USER,
        password: env.DATABASE_PASSWORD,
        dbName: env.DATABASE_NAME,
      }
    : undefined;
}

export async function Main(
  env: Record<string, string | undefined>,
  logger: winston.Logger,
) {
  const { PORT = "8080" } = env;
  const port = Number(PORT);

  const postgresConfig = getPostgresConfig(env);
  const postgres = postgresConfig
    ? await connectToDatabase(postgresConfig, logger)
    : undefined;

  const exampleRouter = services.example.getRouter();
  const allServices: Record<string, Router> = {
    example: exampleRouter,
  };
  if (postgres) {
    const indexerRouter = services.indexer.getRouter(postgres);
    allServices.indexer = indexerRouter;
  }
  const app = ExpressApp(allServices);

  logger.info({
    message: `Starting indexer api on port ${port}`,
  });
  void (await new Promise((res) => {
    app.listen(port, () => res(app));
  }));
}
