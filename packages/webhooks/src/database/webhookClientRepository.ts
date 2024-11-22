import { entities, DataSource } from "@repo/indexer-database";
import assert from "assert";

// This class is intended to store integration clients allowed to use the webhook service.
export class WebhookClientRepository {
  private repository;

  constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(entities.WebhookClient);
  }

  public async registerClient(client: entities.WebhookClient): Promise<void> {
    const existingClient = await this.repository.findOne({
      where: { id: client.id },
    });
    if (existingClient) {
      throw new Error(`Client with id ${client.id} already exists.`);
    }
    await this.repository.insert(client);
  }

  public async unregisterClient(clientId: number): Promise<void> {
    const existingClient = await this.repository.findOne({
      where: { id: clientId },
    });
    if (!existingClient) {
      throw new Error(`Client with id ${clientId} does not exist.`);
    }
    await this.repository.delete({ id: clientId });
  }

  public async getClient(
    clientId: number,
  ): Promise<entities.WebhookClient | undefined> {
    return (
      (await this.repository.findOne({ where: { id: clientId } })) ?? undefined
    );
  }

  public async listClients(): Promise<entities.WebhookClient[]> {
    return this.repository.find();
  }

  public async getClientByApiKey(
    apiKey: string,
  ): Promise<entities.WebhookClient> {
    const result = await this.repository.findOne({ where: { apiKey } });
    assert(result, "Invalid api key");
    return result;
  }

  public async getWebhookClientById(
    id: number,
  ): Promise<entities.WebhookClient | undefined> {
    const client = await this.repository.findOne({ where: { id } });
    return client ?? undefined;
  }
}
