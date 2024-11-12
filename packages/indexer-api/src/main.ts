import assert from "assert";
import { ExpressApp } from "./express-app";
import { createDataSource, DatabaseConfig } from "@repo/indexer-database";
import * as routers from "./routers";
import winston from "winston";
import { type Router } from "express";
import Redis from "ioredis";
import * as s from "superstruct";
import * as Indexer from "@repo/indexer";

async function initializeRedis(
  config: Indexer.RedisConfig,
  logger: winston.Logger,
) {
  const redis = new Redis({
    ...config,
  });

  return new Promise<Redis>((resolve, reject) => {
    redis.on("ready", () => {
      logger.info({
        at: "Indexer-API",
        message: "Redis connection established",
        config,
      });
      resolve(redis);
    });

    redis.on("error", (err) => {
      logger.error({
        at: "Indexer-API",
        message: "Redis connection failed",
        error: err,
      });
      reject(err);
    });
  });
}
export async function connectToDatabase(
  databaseConfig: DatabaseConfig,
  logger: winston.Logger,
) {
  try {
    const database = await createDataSource(databaseConfig).initialize();
    logger.info({
      at: "IndexerAPI#connectToDatabase",
      message: "Postgres connection established",
    });
    return database;
  } catch (error) {
    logger.error({
      at: "IndexerAPI#connectToDatabase",
      message: "Unable to connect to database",
      error,
    });
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
  const redisConfig = Indexer.parseRedisConfig(env);
  const redis = await initializeRedis(redisConfig, logger);

  const allRouters: Record<string, Router> = {
    deposits: routers.deposits.getRouter(postgres),
    balances: routers.balances.getRouter(redis),
    statsPage: routers.statsPage.getRouter(postgres),
  };
  const app = ExpressApp(allRouters);

  logger.info({
    message: `Starting indexer api on port ${port}`,
    at: "main.ts",
  });
  void (await new Promise((res) => {
    app.listen(port, () => res(app));
  }));
}
