import winston from "winston";
import { createDataSource, DatabaseConfig } from "@repo/indexer-database";

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
