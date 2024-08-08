import Redis from "ioredis";

import { createDataSource } from "./data-source";
import { User } from "./entities/User.entity";

/**
 * Connects to PostgreSQL, performs some dummy queries, and logs the results.
 *
 * - Creates a table if it doesn't exist.
 * - Inserts a dummy row.
 * - Selects all rows from the table.
 *
 * @param {Record<string, string | undefined>} env - Environment variables for configuration.
 */
async function queryPostgres(env: Record<string, string | undefined>) {
  // Set up Data Source
  const AppDataSource = createDataSource({
    host: env.DATABASE_HOST || "localhost",
    port: env.DATABASE_PORT || "5432",
    user: env.DATABASE_USER || "user",
    password: env.DATABASE_PASSWORD || "password",
    dbName: env.DATABASE_NAME || "database",
  });

  try {
    // Connect to Data Source
    await AppDataSource.initialize();
    console.log("Connected to PostgreSQL");

    // Insert a dummy row. Table should be already created by migrations
    console.log("Inserting a new user into the database...");
    const user = new User();
    user.firstName = "Timber";
    user.lastName = "Saw";
    user.age = 25;
    await AppDataSource.manager.save(user);
    console.log("Saved a new user with id: " + user.id);

    // Query the table
    console.log("Loading users from the database...");
    const users = await AppDataSource.manager.find(User);
    console.log("Loaded users: ", users);
  } catch (error) {
    console.error("Error querying PostgreSQL:", error);
  } finally {
    // Disconnect from PostgreSQL
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      console.log("Disconnected from PostgreSQL");
    }
  }
}

/**
 * Connects to Redis, performs some dummy queries, and logs the results.
 *
 * - Sets a key-value pair.
 * - Retrieves the value for the key.
 *
 * @param {Record<string, string | undefined>} env - Environment variables for configuration.
 */
async function queryRedis(env: Record<string, string | undefined>) {
  // Initialize Redis client
  const redisClient = new Redis({
    host: env.REDIS_HOST,
    port: parseInt(env.REDIS_PORT || "6379", 10),
  });

  try {
    console.log("Connected to Redis");

    // Set a dummy value
    await redisClient.set("test_key", "dummy_value");

    // Get the dummy value
    const value = await redisClient.get("test_key");
    console.log("Redis query result:", value);
  } catch (error) {
    console.error("Error querying Redis:", error);
  } finally {
    // Disconnect from Redis
    redisClient.disconnect();
    console.log("Disconnected from Redis");
  }
}

/**
 * Main function that executes queries for both PostgreSQL and Redis.
 *
 * @param {Record<string, string | undefined>} env - Environment variables for configuration.
 */
export async function Main(env: Record<string, string | undefined>) {
  await queryPostgres(env);
  await queryRedis(env);
}
