import assert from "assert";
import { ExpressApp } from "./express-app";
import { createDataSource, DatabaseConfig } from "@repo/indexer-database";
import * as routers from "./routers";
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
): DatabaseConfig {
  assert(env.DATABASE_HOST, "requires DATABASE_HOST");
  assert(env.DATABASE_PORT, "requires DATABASE_PORT");
  assert(env.DATABASE_USER, "requires DATABASE_USER");
  assert(env.DATABASE_PASSWORD, "requires DATABASE_PASSWORD");
  assert(env.DATABASE_NAME, "requires DATABASE_NAME");
  return {
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    dbName: env.DATABASE_NAME,
  };
}

export async function Main(
  env: Record<string, string | undefined>,
  logger: winston.Logger,
) {
  const { PORT = "8080" } = env;
  const port = Number(PORT);

  const postgresConfig = getPostgresConfig(env);
  const postgres = await connectToDatabase(postgresConfig, logger);

  const allServices: Record<string, Router> = {
    indexer: routers.indexer.getRouter(postgres),
  };
  const app = ExpressApp(allServices);

  logger.info({
    message: `Starting indexer api on port ${port}`,
  });
  void (await new Promise((res) => {
    app.listen(port, () => res(app));
  }));
}
