import "reflect-metadata";
import { DataSource } from "typeorm";
import * as entities from "./entities";

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
      // HubPool
      entities.ProposedRootBundle,
      entities.RootBundleCanceled,
      entities.RootBundleDisputed,
      entities.RootBundleExecuted,
      // SpokePool
      entities.ExecutedRelayerRefundRoot,
      entities.FilledV3Relay,
      entities.RelayedRootBundle,
      entities.RequestedSpeedUpV3Deposit,
      entities.RequestedV3SlowFill,
      entities.TokensBridged,
      entities.V3FundsDeposited,
    ],
    migrationsTableName: "_migrations",
    migrations: ["migrations/*.ts"],
  });
};
