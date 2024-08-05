import { Client } from "pg";
import Redis from "ioredis";

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
  // Initialize PostgreSQL client
  const pgClient = new Client({
    host: env.DATABASE_HOST,
    port: parseInt(env.DATABASE_PORT || "5432", 10),
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
  });

  try {
    // Connect to PostgreSQL
    await pgClient.connect();
    console.log("Connected to PostgreSQL");

    // Create a table if it doesn't exist
    await pgClient.query(
      "CREATE TABLE IF NOT EXISTS test_table (id SERIAL PRIMARY KEY, name VARCHAR(50));",
    );

    // Insert a dummy row
    await pgClient.query("INSERT INTO test_table (name) VALUES ('dummy');");

    // Query the table
    const res = await pgClient.query("SELECT * FROM test_table;");
    console.log("PostgreSQL query result:", res.rows);
  } catch (error) {
    console.error("Error querying PostgreSQL:", error);
  } finally {
    // Disconnect from PostgreSQL
    await pgClient.end();
    console.log("Disconnected from PostgreSQL");
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
