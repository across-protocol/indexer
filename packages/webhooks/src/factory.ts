import assert from "assert";
import { EventProcessorManager } from "./eventProcessorManager";
import { MemoryStore } from "./store";
import { DataSource } from "@repo/indexer-database";
import { Logger } from "winston";
import { WebhookNotifier } from "./notifier";
import { DepositStatusProcessor } from "./eventProcessors";
import { WebhookRequests } from "./webhookRequests";
import { WebhookRouter } from "./router";

type Config = {
  requireApiKey: boolean;
  enabledEventProcessors: string[];
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
  assert(
    config.enabledEventProcessors.length,
    "No webhooks enabled, specify one in config",
  );
  const eventProcessorManager = new EventProcessorManager(
    config ?? { requireApiKey: false },
    {
      postgres,
      logger,
    },
  );
  config.enabledEventProcessors.forEach((name) => {
    const hooks = new WebhookRequests(new MemoryStore());
    switch (name) {
      // add more webhook types here
      case "DepositStatus": {
        eventProcessorManager.registerWebhookProcessor(
          name,
          new DepositStatusProcessor({
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
  const router = WebhookRouter({ eventProcessorManager });
  return {
    eventProcessorManager,
    router,
    notifier,
  };
}
export type WebhookFactory = ReturnType<typeof WebhookFactory>;
