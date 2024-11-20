import { DataSource } from "typeorm";
import { WebhookRequest } from "../types";
import { entities } from "@repo/indexer-database";

export class WebhookRequestRepository {
  private repository;

  constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(entities.WebhookRequest);
  }

  public async register(webhook: WebhookRequest): Promise<void> {
    const existingWebhook = await this.repository.findOne({
      where: { id: webhook.id },
    });
    if (existingWebhook) {
      throw new Error(`Webhook with id ${webhook.id} already exists.`);
    }
    await this.repository.save(webhook);
  }

  public async unregister(webhookId: string): Promise<void> {
    const existingWebhook = await this.repository.findOne({
      where: { id: webhookId },
    });
    if (!existingWebhook) {
      throw new Error(`Webhook with id ${webhookId} does not exist.`);
    }
    await this.repository.delete({ id: webhookId });
  }

  public async getWebhook(
    webhookId: string,
  ): Promise<WebhookRequest | undefined> {
    return (
      (await this.repository.findOne({ where: { id: webhookId } })) ?? undefined
    );
  }

  public async listWebhooks(): Promise<WebhookRequest[]> {
    return this.repository.find();
  }

  public async filterWebhooks(filter: string): Promise<WebhookRequest[]> {
    return this.repository.find({ where: { filter } });
  }

  public async hasWebhook(webhookId: string): Promise<boolean> {
    const count = await this.repository.count({ where: { id: webhookId } });
    return count > 0;
  }
}
