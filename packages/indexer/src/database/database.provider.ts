import winston from "winston";
import { createDataSource, DatabaseConfig } from "@repo/indexer-database";

export async function connectToDatabase(
  databaseConfig: DatabaseConfig,
  logger: winston.Logger,
) {
  try {
    const database = await createDataSource(databaseConfig).initialize();
    logger.info({
      at: "Indexer#connectToDatabase",
      message: "Postgres connection established",
    });
    return database;
  } catch (error) {
    logger.error({
      at: "Indexer#connectToDatabase",
      message: "Unable to connect to database",
      error,
    });
    throw error;
  }
}
