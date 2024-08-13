import { createDataSource, DatabaseConfig } from "@repo/indexer-database";

export async function connectToDatabase(databaseConfig: DatabaseConfig) {
  try {
    const database = await createDataSource(databaseConfig).initialize();
    return database;
  } catch (error) {
    console.log("Unable to connect to database", error);
    throw error;
  }
}
