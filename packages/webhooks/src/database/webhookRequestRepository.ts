import { entities, DataSource } from "@repo/indexer-database";
import assert from "assert";
import { exists } from "../utils";

export class WebhookRequestRepository {
  private repository;

  constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(entities.WebhookRequest);
  }

  public async register(
    webhook: Omit<entities.WebhookRequest, "createdAt">,
  ): Promise<void> {
    const existingWebhook = await this.repository.findOne({
      where: { id: webhook.id },
    });
    if (existingWebhook) {
      throw new Error(`Webhook with id ${webhook.id} already exists.`);
    }
    await this.repository.insert(webhook);
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

  public async getWebhookRequest(
    webhookId: string,
  ): Promise<entities.WebhookRequest> {
    const result = await this.repository.findOne({ where: { id: webhookId } });
    assert(result, "Webhook request not found");
    return result;
  }

  public async listWebhookRequests(): Promise<entities.WebhookRequest[]> {
    return this.repository.find();
  }

  public async findWebhookRequestsByFilter(
    filter: string,
  ): Promise<entities.WebhookRequest[]> {
    return this.repository.find({ where: { filter } });
  }

  public async findWebhookRequestsByFilterAndClient(
    filter: string,
    clientId: number,
  ): Promise<entities.WebhookRequest[]> {
    return this.repository.find({ where: { filter, clientId } });
  }

  public async hasWebhookRequest(webhookId: string): Promise<boolean> {
    const result = await this.repository.findOne({
      where: { id: webhookId },
    });
    return exists(result);
  }
}
