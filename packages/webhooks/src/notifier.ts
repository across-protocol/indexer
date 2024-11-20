import { post } from "./utils";
import { NotificationPayload } from "./types";
import { AsyncStore } from "./store";
import { Logger } from "winston";

export type Dependencies = {
  notify: (payload: NotificationPayload) => Promise<void>;
  logger: Logger;
};

export class BaseNotifier {
  private logger: Logger;

  constructor(private deps: Dependencies) {}

  public notify = (payload: NotificationPayload): void => {
    this.deps.notify(payload).catch((error) => {
      this.logger.error(`Error calling webhook`, error);
    });
  };
}

export class WebhookNotifier extends BaseNotifier {
  constructor(deps: Omit<Dependencies, "notify">) {
    super({ ...deps, notify: post });
  }
}
