import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "./entities/User.entity";

export const createDataSource = (
  env: Record<string, string | undefined>,
): DataSource => {
  return new DataSource({
    type: "postgres",
    host: env.DATABASE_HOST,
    port: parseInt(env.DATABASE_PORT || "5432", 10),
    username: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
    logging: false,
    entities: [User],
    migrationsTableName: "_migrations",
    migrations: ["migrations/*.ts"],
  });
};
