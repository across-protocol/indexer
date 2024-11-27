import { Logger } from "winston";
import { Redis } from "ioredis";

import { DataSource } from "@repo/indexer-database";
import { assert } from "@repo/error-handling";

import { EventProcessorManager } from "./eventProcessorManager";
import { WebhookNotifier } from "./notifier";
import { DepositStatusProcessor } from "./eventProcessors";
import { WebhookRouter } from "./router";
import { WebhooksQueuesService } from "./adapter/messaging/WebhooksQueuesService";
import { WebhookRequestWorker } from "./adapter/messaging/WebhookRequestWorker";

export enum WebhookTypes {
  DepositStatus = "DepositStatus",
}

export type Config = {
  enabledWebhooks: WebhookTypes[];
  enabledWebhookRequestWorkers: boolean;
};
type Dependencies = {
  postgres: DataSource;
  redis: Redis;
  logger: Logger;
};

export function WebhookFactory(config: Config, deps: Dependencies) {
  const { logger, postgres, redis } = deps;
  const notifier = new WebhookNotifier({ logger });
  assert(
    config.enabledWebhooks.length,
    "No webhooks enabled, specify one in config",
  );
  const webhooksQueuesService = new WebhooksQueuesService(redis);
  const eventProcessorManager = new EventProcessorManager({
    postgres,
    logger,
    webhooksQueuesService,
  });
  config.enabledWebhooks.forEach((name) => {
    switch (name) {
      // add more webhook types here
      case WebhookTypes.DepositStatus: {
        eventProcessorManager.registerEventProcessor(
          name,
          new DepositStatusProcessor(
            {
              postgres,
              logger,
              notify: notifier.notify,
            },
            WebhookTypes.DepositStatus,
          ),
        );
        break;
      }
      default: {
        throw new Error(`Unhandled webhook type: ${name}`);
      }
    }
  });
  if (config.enabledWebhookRequestWorkers) {
    new WebhookRequestWorker(
      redis,
      postgres,
      logger,
      eventProcessorManager.write,
    );
  }
  const router = WebhookRouter({ eventProcessorManager });
  return {
    write: eventProcessorManager.write,
    router,
  };
}
export type WebhookFactory = ReturnType<typeof WebhookFactory>;
