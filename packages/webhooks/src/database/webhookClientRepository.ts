import { entities, DataSource } from "@repo/indexer-database";
import { exists } from "../utils";
import assert from "assert";

// This class is intended to store integration clients allowed to use the webhook service.
export class WebhookClientRepository {
  private repository;

  constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(entities.WebhookClient);
  }

  public async registerClient(
    client: Omit<entities.WebhookClient, "id">,
  ): Promise<entities.WebhookClient> {
    assert(
      !(await this.hasClientByName(client.name)),
      "Client with that name already exists",
    );
    const result = await this.repository.insert(client);
    return result.raw[0];
  }
  public async upsertClient(
    client: Omit<entities.WebhookClient, "id">,
  ): Promise<entities.WebhookClient> {
    if (await this.hasClientByName(client.name)) {
      return this.updateClientByName(client);
    } else {
      return this.registerClient(client);
    }
  }
  public async updateClientByName(
    client: Omit<entities.WebhookClient, "id">,
  ): Promise<entities.WebhookClient> {
    const result = await this.repository.update({ name: client.name }, client);
    return result.raw[0];
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
  public async hasClientByName(name: string): Promise<boolean> {
    const result = await this.repository.findOne({ where: { name } });
    return exists(result);
  }
  public async getClientByName(name: string): Promise<entities.WebhookClient> {
    const result = await this.repository.findOne({ where: { name } });
    assert(result, `Client by name: ${name} does not exist`);
    return result;
  }
  public async getClientByApiKey(
    apiKey: string,
  ): Promise<entities.WebhookClient> {
    const result = await this.repository.findOne({ where: { apiKey } });
    assert(result, `Client by apiKey: ${apiKey} does not exist`);
    return result;
  }

  public async getWebhookClientById(
    id: number,
  ): Promise<entities.WebhookClient | undefined> {
    const client = await this.repository.findOne({ where: { id } });
    return client ?? undefined;
  }
}
