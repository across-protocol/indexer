import { assert } from "@repo/error-handling";
import { createDataSource, DatabaseConfig } from "@repo/indexer-database";
import Redis from "ioredis";
import winston from "winston";
import * as Indexer from "@repo/indexer";

export async function initializeRedis(
  config: Indexer.RedisConfig,
  logger: winston.Logger,
) {
  const redis = new Redis({
    ...config,
  });

  return new Promise<Redis>((resolve, reject) => {
    redis.on("ready", () => {
      logger.debug({
        at: "IndexerAPI#initializeRedis",
        message: "Redis connection established",
        config,
      });
      resolve(redis);
    });

    redis.on("error", (err) => {
      logger.error({
        at: "IndexerAPI#initializeRedis",
        message: "Redis connection failed",
        notificationPath: "across-indexer-error",
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
    logger.debug({
      at: "IndexerAPI#connectToDatabase",
      message: "Postgres connection established",
    });
    return database;
  } catch (error) {
    logger.error({
      at: "IndexerAPI#connectToDatabase",
      message: "Unable to connect to database",
      notificationPath: "across-indexer-error",
      error,
    });
    throw error;
  }
}

export function getPostgresConfig(
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
