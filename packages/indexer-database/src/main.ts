import "reflect-metadata";
import { DataSource } from "typeorm";

export const createDataSource = (config: {
  host: string | undefined;
  port: string | undefined;
  user: string | undefined;
  password: string | undefined;
  dbName: string | undefined;
}): DataSource => {
  for (const [key, value] of Object.entries(config)) {
    console.log(key, value);
    if (!value)
      throw new Error(`Missing required environment variable: ${key}`);
  }
  return new DataSource({
    type: "postgres",
    host: config.host,
    port: parseInt(config.port || "5432", 10),
    username: config.user,
    password: config.password,
    database: config.dbName,
    logging: false,
    entities: ["entities/*.ts"],
    migrationsTableName: "_migrations",
    migrations: ["migrations/*.ts"],
  });
};
