import { AsyncStore } from "../store";
import { WebhookRequest } from "../types";

export class WebhookRequestRepository {
  constructor(private store: AsyncStore<WebhookRequest>) {}

  public async register(webhook: WebhookRequest): Promise<void> {
    if (await this.store.has(webhook.id)) {
      throw new Error(`Webhook with id ${webhook.id} already exists.`);
    }
    await this.store.set(webhook.id, webhook);
  }

  public async unregister(webhookId: string): Promise<void> {
    if (!(await this.store.has(webhookId))) {
      throw new Error(`Webhook with id ${webhookId} does not exist.`);
    }
    await this.store.delete(webhookId);
  }

  public async getWebhook(
    webhookId: string,
  ): Promise<WebhookRequest | undefined> {
    return this.store.get(webhookId);
  }

  public async listWebhooks(): Promise<WebhookRequest[]> {
    const webhooks: WebhookRequest[] = [];
    for await (const webhook of this.store.values()) {
      webhooks.push(webhook);
    }
    return webhooks;
  }

  public async filterWebhooks(filter: string): Promise<WebhookRequest[]> {
    const webhooks: WebhookRequest[] = [];
    for await (const webhook of this.store.values()) {
      if (webhook.filter === filter) {
        webhooks.push(webhook);
      }
    }
    return webhooks;
  }

  public async hasWebhook(webhookId: string): Promise<boolean> {
    return this.store.has(webhookId);
  }
}
