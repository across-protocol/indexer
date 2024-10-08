import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "./entities/User.entity";

export const createDataSource = (config: {
  host: string;
  port: string;
  user: string;
  password: string;
  dbName: string;
}): DataSource => {
  return new DataSource({
    type: "postgres",
    host: config.host,
    port: parseInt(config.port, 10),
    username: config.user,
    password: config.password,
    database: config.dbName,
    logging: false,
    entities: [User],
    migrationsTableName: "_migrations",
    migrations: ["migrations/*.ts"],
  });
};
