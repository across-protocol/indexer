import { post, generateUniqueId } from "./utils";
import { JSONValue, NotificationPayload } from "./types";
import { AsyncStore } from "./store";
import { Logger } from "winston";

export type Notification = {
  id: string;
  nextTry: number;
  tryCount: number;
  payload: NotificationPayload;
  created: number;
};

export type Dependencies = {
  pending: AsyncStore<Notification>;
  completed: AsyncStore<Notification>;
  logger: Logger;
  notify: (url: string, event: any) => Promise<void>;
};

export class BaseNotifier {
  private pending: AsyncStore<Notification>;
  private completed: AsyncStore<Notification>;
  private logger: Logger;

  constructor(private deps: Dependencies) {
    this.pending = deps.pending;
    this.completed = deps.completed;
    this.logger = deps.logger;
  }

  create = async (
    payload: NotificationPayload,
    id?: string,
    now?: number,
  ): Promise<string> => {
    now = now ?? Date.now();
    id = id ?? generateUniqueId(now);
    const notification: Notification = {
      id,
      nextTry: Date.now(),
      tryCount: 0,
      payload,
      created: Date.now(),
    };
    await this.pending.set(id, notification);
    return id;
  };
  public notify = (payload: NotificationPayload): void => {
    this.create(payload).catch((error) => {
      this.logger.error(`Error creating notification:`, error);
    });
  };

  public tick = async (now = Date.now()): Promise<void> => {
    for await (const notification of this.pending.values()) {
      if (notification.nextTry <= now) {
        try {
          await this.deps.notify(
            notification.payload.url,
            notification.payload.event,
          );
          this.logger.info(
            `Successfully processed notification for ${notification.id}`,
          );
          await this.completed.set(notification.id, notification);
          await this.pending.delete(notification.id);
        } catch (error) {
          this.logger.error(
            `Error processing notification for ${notification.id}:`,
            error,
          );
          notification.tryCount += 1;
          notification.nextTry =
            now + Math.min(60000 * notification.tryCount, 3600000); // Exponential backoff with cap
          await this.pending.set(notification.id, notification);
        }
      }
    }
  };
  public async listPending(): Promise<Notification[]> {
    const pendingNotifications: Notification[] = [];
    for await (const notification of this.pending.values()) {
      pendingNotifications.push(notification);
    }
    return pendingNotifications;
  }

  public async listCompleted(): Promise<Notification[]> {
    const completedNotifications: Notification[] = [];
    for await (const notification of this.completed.values()) {
      completedNotifications.push(notification);
    }
    return completedNotifications;
  }
}

export class WebhookNotifier extends BaseNotifier {
  constructor(deps: Omit<Dependencies, "notify">) {
    super({ ...deps, notify: post });
  }
}
