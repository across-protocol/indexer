import assert from "assert";
import { EventProcessorManager } from "./eventProcessorManager";
import { DataSource } from "@repo/indexer-database";
import { Logger } from "winston";
import { WebhookNotifier } from "./notifier";
import { DepositStatusProcessor } from "./eventProcessors";
import { WebhookRouter } from "./router";

export enum WebhookTypes {
  DepositStatus = "DepositStatus",
}

export type Config = {
  requireApiKey: boolean;
  enabledWebhooks: WebhookTypes[];
};
type Dependencies = {
  postgres: DataSource;
  logger: Logger;
};

export function WebhookFactory(config: Config, deps: Dependencies) {
  const { logger, postgres } = deps;
  const notifier = new WebhookNotifier({ logger });
  assert(
    config.enabledWebhooks.length,
    "No webhooks enabled, specify one in config",
  );
  const eventProcessorManager = new EventProcessorManager(
    config ?? { requireApiKey: false },
    {
      postgres,
      logger,
    },
  );
  config.enabledWebhooks.forEach((name) => {
    switch (name) {
      // add more webhook types here
      case WebhookTypes.DepositStatus: {
        eventProcessorManager.registerEventProcessor(
          name,
          new DepositStatusProcessor(
            {
              postgres,
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
  const router = WebhookRouter({ eventProcessorManager });
  return {
    write: eventProcessorManager.write,
    router,
  };
}
export type WebhookFactory = ReturnType<typeof WebhookFactory>;
