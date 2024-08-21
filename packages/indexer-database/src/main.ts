import "reflect-metadata";
import { DataSource } from "typeorm";
import { V3FundsDeposited } from "./entities/evm/V3FundsDeposited";
import { FilledV3Relay } from "./entities/evm/FilledV3Relay";
import { RequestedV3SlowFill } from "./entities/evm/RequestedV3SlowFill";

export { DataSource };

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
    entities: [V3FundsDeposited, FilledV3Relay, RequestedV3SlowFill],
    migrationsTableName: "_migrations",
    migrations: ["migrations/*.ts"],
  });
};

export { V3FundsDeposited, FilledV3Relay, RequestedV3SlowFill };
