import "reflect-metadata";
import { DataSource } from "typeorm";

export type DatabaseConfig = {
  host: string;
  port: string;
  user: string;
  password: string;
  dbName: string;
};

export const createDataSource = (config: DatabaseConfig): DataSource => {
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
