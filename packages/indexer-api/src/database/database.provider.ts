import { createDataSource } from "@repo/indexer-database";

export async function connectToDatabase(
  env: Record<string, string | undefined>,
) {
  const databaseConfig = {
    host: env.DATABASE_HOST || "localhost",
    port: env.DATABASE_PORT || "5432",
    user: env.DATABASE_USER || "user",
    password: env.DATABASE_PASSWORD || "password",
    dbName: env.DATABASE_NAME || "database",
  };
  try {
    const database = await createDataSource(databaseConfig).initialize();
    return database;
  } catch (error) {
    console.log("Unable to connect to database", error);
    throw error;
  }
}
