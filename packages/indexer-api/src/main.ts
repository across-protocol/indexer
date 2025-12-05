import { assert } from "@repo/error-handling";
import { ExpressApp } from "./express-app";
import { createDataSource, DatabaseConfig } from "@repo/indexer-database";
import * as routers from "./routers";
import winston from "winston";
import { type Router } from "express";
import Redis from "ioredis";
import * as Indexer from "@repo/indexer";
import * as Webhooks from "@repo/webhooks";
import * as utils from "./utils";

export async function Main(
  env: Record<string, string | undefined>,
  logger: winston.Logger,
) {
  const { PORT = "8080" } = env;
  const port = Number(PORT);

  const postgresConfig = utils.getPostgresConfig(env);
  const postgres = await utils.connectToDatabase(postgresConfig, logger);
  const redisConfig = Indexer.parseRedisConfig(env);
  const redis = await utils.initializeRedis(redisConfig, logger);
  const webhooks = await Webhooks.WebhookFactory(
    {
      enabledWebhooks: [Webhooks.WebhookTypes.DepositStatus],
      enabledWebhookRequestWorkers: false,
      // indexer will register clients
      clients: [],
    },
    { postgres, logger, redis },
  );

  const allRouters: Record<string, Router> = {
    deposits: routers.deposits.getRouter(postgres, redis),
    balances: routers.balances.getRouter(redis),
    statsPage: routers.statsPage.getRouter(postgres),
    fills: routers.fills.getRouter(postgres), // Added fills router
    webhook: webhooks.router,
    sponsorships: routers.sponsorships.getRouter(postgres),
  };
  const app = ExpressApp(allRouters);

  logger.info({
    at: "IndexerAPI#Main",
    message: `Starting indexer api on port ${port}`,
  });
  void (await new Promise((res) => {
    app.listen(port, () => res(app));
  }));
}
