import dotenv from "dotenv";
import { DataSource } from "typeorm";
import * as fs from "fs";
import * as path from "path";

// First, check for a .env file in the current directory
const localEnvPath = path.resolve(__dirname, ".env");
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
} else {
  // Fall back to the .env file in the project root
  const rootEnvPath = path.resolve(__dirname, "../../.env");
  dotenv.config({ path: rootEnvPath });
}

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || "5432", 10),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  logging: "all",
  entities: ["src/entities/**/*.ts"],
  migrationsTableName: "_migrations",
  migrations: ["src/migrations/*.ts"],
});
