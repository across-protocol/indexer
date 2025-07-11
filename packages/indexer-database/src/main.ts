import "reflect-metadata";
import {
  DataSource,
  Repository,
  InsertResult,
  UpdateResult,
  In,
  LessThan,
  Not,
} from "typeorm";
import * as entities from "./entities";
import { DatabaseConfig } from "./model";

export {
  DataSource,
  Repository,
  InsertResult,
  UpdateResult,
  In,
  LessThan,
  Not,
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
      entities.SetPoolRebalanceRoute,
      // SpokePool
      entities.BridgedToHubPool,
      entities.ClaimedRelayerRefunds,
      entities.ExecutedRelayerRefundRoot,
      entities.FilledV3Relay,
      entities.RelayedRootBundle,
      entities.RequestedSpeedUpV3Deposit,
      entities.RequestedV3SlowFill,
      entities.TokensBridged,
      entities.V3FundsDeposited,
      entities.SwapBeforeBridge,
      // Bundle
      entities.Bundle,
      entities.BundleBlockRange,
      entities.BundleEvent,
      entities.RootBundleExecutedJoinTable,
      // Others
      entities.RelayHashInfo,
      // Webhooks
      entities.WebhookRequest,
      entities.WebhookClient,
      // Indexer
      entities.IndexerProgressInfo,
      // Historic Price
      entities.HistoricPrice,
    ],
    migrationsTableName: "_migrations",
    migrations: ["migrations/*.ts"],
  });
};
