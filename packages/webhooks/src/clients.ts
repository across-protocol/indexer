import { AsyncStore } from "./store";

export interface WebhookClient {
  id: string;
  apiKey: string;
  url: string;
  domains: string[];
}

// This class is intended to store integration clients allowed to use the webhook service.
export class WebhookClientManager {
  constructor(private store: AsyncStore<WebhookClient>) {}

  public async registerClient(client: WebhookClient): Promise<void> {
    if (await this.store.has(client.id)) {
      throw new Error(`Client with id ${client.id} already exists.`);
    }
    await this.store.set(client.id, client);
  }

  public async unregisterClient(clientId: string): Promise<void> {
    if (!(await this.store.has(clientId))) {
      throw new Error(`Client with id ${clientId} does not exist.`);
    }
    await this.store.delete(clientId);
  }

  public async getClient(clientId: string): Promise<WebhookClient | undefined> {
    return this.store.get(clientId);
  }

  public async listClients(): Promise<WebhookClient[]> {
    const clients: WebhookClient[] = [];
    for await (const client of this.store.values()) {
      clients.push(client);
    }
    return clients;
  }

  public async findClientsByApiKey(apiKey: string): Promise<WebhookClient[]> {
    const clients: WebhookClient[] = [];
    for await (const client of this.store.values()) {
      if (client.apiKey === apiKey) {
        clients.push(client);
      }
    }
    return clients;
  }
}
