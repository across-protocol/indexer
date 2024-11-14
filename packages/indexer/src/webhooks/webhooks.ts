import { MemoryStore } from "./store";
import { WebhookClientManager, WebhookClient } from "./clients";
import { DataSource, entities } from "@repo/indexer-database";
import { Logger } from "winston";
import assert from "assert";
import { JSONValue, IWebhook, NotificationPayload } from "./types";
import { DepositStatusWebhook } from "./webhook";

export type WebhookRecord = Record<string, IWebhook>;

type EventType = {
  type: string;
  payload: JSONValue;
};

export type Config = {
  requireApiKey: boolean;
};

export type Dependencies = {
  postgres: DataSource;
  logger: Logger;
};
export class Webhooks {
  private logger: Logger;
  private clientManager: WebhookClientManager;
  private webhooks = new Map<string, IWebhook>();

  constructor(
    private config: Config,
    deps: Dependencies,
  ) {
    this.logger = deps.logger;
    this.clientManager = new WebhookClientManager(new MemoryStore()); // Initialize the client manager
  }
  // Register a new type of webhook processor able to be written to
  public registerWebhookProcessor(name: string, webhook: IWebhook) {
    assert(
      !this.webhooks.has(name),
      `Webhook with that name already exists: ${name}`,
    );
    this.webhooks.set(name, webhook);
  }

  private getWebhook(name: string) {
    const webhook = this.webhooks.get(name);
    assert(webhook, "Webhook does not exist by type: ${event.type}");
    return webhook;
  }
  write(event: EventType): void {
    const webhook = this.getWebhook(event.type);
    webhook.write(event.payload);
  }

  async registerWebhook(
    params: { type: string; url: string; filter: JSONValue },
    apiKey?: string,
  ) {
    if (this.config.requireApiKey) {
      if (apiKey === undefined) throw new Error("Api Key required");
      const clients = await this.clientManager.findClientsByApiKey(apiKey);
      assert(clients.length > 0, "Invalid api key");
      const urlDomain = new URL(params.url).hostname;
      const isDevDomain =
        urlDomain === "localhost" || urlDomain.startsWith("127.");
      if (!isDevDomain) {
        const isDomainValid = clients.some((client) =>
          client.domains.includes(urlDomain),
        );
        assert(
          isDomainValid,
          "The base URL of the provided webhook does not match any of the client domains",
        );
      }
    }
    const webhook = this.getWebhook(params.type);
    return webhook.register(params.url, params.filter);
  }

  // TODO: gaurd this with api key
  async unregisterWebhook(
    params: { type: string; id: string },
    apiKey?: string,
  ) {
    // Assuming the IWebhook interface has an unregister method
    const webhook = this.getWebhook(params.type);
    return webhook.unregister(params.id);
  }

  async registerClient(client: WebhookClient) {
    return this.clientManager.registerClient(client);
  }
}
