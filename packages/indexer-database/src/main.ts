import "reflect-metadata";
import { DataSource } from "typeorm";
import { ExecutedRelayerRefundRoot } from "./entities/evm/ExecutedRelayerRefundRoot";
import { FilledV3Relay } from "./entities/evm/FilledV3Relay";
import { RelayedRootBundle } from "./entities/evm/RelayedRootBundle";
import { RequestedV3SlowFill } from "./entities/evm/RequestedV3SlowFill";
import { TokensBridged } from "./entities/evm/TokensBridged";
import { V3FundsDeposited } from "./entities/evm/V3FundsDeposited";

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
    entities: [
      ExecutedRelayerRefundRoot,
      FilledV3Relay,
      RelayedRootBundle,
      RequestedV3SlowFill,
      TokensBridged,
      V3FundsDeposited,
    ],
    migrationsTableName: "_migrations",
    migrations: ["migrations/*.ts"],
  });
};

export {
  ExecutedRelayerRefundRoot,
  FilledV3Relay,
  RelayedRootBundle,
  RequestedV3SlowFill,
  TokensBridged,
  V3FundsDeposited,
};
