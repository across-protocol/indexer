import { post } from "./utils";
import { NotificationPayload } from "./types";
import { Logger } from "winston";

export type Dependencies = {
  notify: (payload: NotificationPayload) => Promise<void>;
  logger: Logger;
};

export class BaseNotifier {
  private logger: Logger;

  constructor(private deps: Dependencies) {
    this.logger = deps.logger;
  }

  public notify = (payload: NotificationPayload): void => {
    this.deps.notify(payload).catch((error) => {
      this.logger.error({
        at: "BaseNotifier#notify",
        message: `Error calling webhook`,
        notificationPath: "across-indexer-error",
        error,
        payload,
      });
    });
  };
}

export class WebhookNotifier extends BaseNotifier {
  constructor(deps: Omit<Dependencies, "notify">) {
    super({ ...deps, notify: post });
  }
}
