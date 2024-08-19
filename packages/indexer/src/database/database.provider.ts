import winston from "winston";
import { createDataSource, DatabaseConfig } from "@repo/indexer-database";

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
