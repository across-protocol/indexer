import assert from "assert";
import { Webhooks } from "./webhooks";
import { MemoryStore } from "./store";
import { ExpressApp } from "./express";
import { DataSource } from "@repo/indexer-database";
import { Logger } from "winston";
import { WebhookNotifier } from "./notifier";
import { DepositStatusWebhook } from "./webhook";
import { WebhookRequests } from "./webhookRequests";

type Config = {
  express?: {
    port: number;
  };
  webhooks?: {
    requireApiKey: boolean;
  };
  enable: string[];
};
type Dependencies = {
  postgres: DataSource;
  logger: Logger;
};

export function WebhookFactory(config: Config, deps: Dependencies) {
  const { logger, postgres } = deps;
  const notifier = new WebhookNotifier({
    logger,
    pending: new MemoryStore(),
    completed: new MemoryStore(),
  });
  assert(config.enable.length, "No webhooks enabled, specify one in config");
  const webhooks = new Webhooks(config?.webhooks ?? { requireApiKey: false }, {
    postgres,
    logger,
  });
  config.enable.forEach((name) => {
    const hooks = new WebhookRequests(new MemoryStore());
    switch (name) {
      // add more webhook types here
      case "DepositStatus": {
        webhooks.registerWebhookProcessor(
          name,
          new DepositStatusWebhook({
            postgres,
            hooks,
            notify: notifier.notify,
          }),
        );
        break;
      }
      default: {
        throw new Error(`Unhandled webhook type: ${name}`);
      }
    }
  });
  const express = ExpressApp(config?.express ?? { port: 3000 }, { webhooks });
  return { webhooks, express, notifier };
}
