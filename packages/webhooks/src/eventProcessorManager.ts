import { MemoryStore } from "./store";
import {
  WebhookClientRepository,
  WebhookClient,
} from "./database/webhookClientRepository";
import { DataSource, entities } from "@repo/indexer-database";
import { Logger } from "winston";
import assert from "assert";
import { JSONValue, IEventProcessor } from "./types";

export type EventProcessorRecord = Record<string, IEventProcessor>;

type EventType = {
  type: string;
  event: JSONValue;
};

export type Config = {
  requireApiKey: boolean;
};

export type Dependencies = {
  postgres: DataSource;
  logger: Logger;
};
export class EventProcessorManager {
  private logger: Logger;
  private clientRepository: WebhookClientRepository;
  private processors = new Map<string, IEventProcessor>();

  constructor(
    private config: Config,
    deps: Dependencies,
  ) {
    this.logger = deps.logger;
    this.clientRepository = new WebhookClientRepository(new MemoryStore()); // Initialize the client manager
  }
  // Register a new type of webhook processor able to be written to
  public registerEventProcessor(name: string, webhook: IEventProcessor) {
    assert(
      !this.processors.has(name),
      `Webhook with that name already exists: ${name}`,
    );
    this.processors.set(name, webhook);
  }

  private getEventProcessor(name: string) {
    const eventProcessor = this.processors.get(name);
    assert(
      eventProcessor,
      "EventProcessor does not exist by type: ${event.type}",
    );
    return eventProcessor;
  }
  write = (event: EventType): void => {
    const webhook = this.getEventProcessor(event.type);
    webhook.write(event.event);
  };

  async registerWebhook(
    params: { type: string; url: string; filter: JSONValue },
    apiKey?: string,
  ) {
    if (this.config.requireApiKey) {
      if (apiKey === undefined) throw new Error("Api Key required");
      const clients = await this.clientRepository.findClientsByApiKey(apiKey);
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
    const webhook = this.getEventProcessor(params.type);
    return webhook.register(params.url, params.filter);
  }

  // TODO: gaurd this with api key
  async unregisterWebhook(
    params: { type: string; id: string },
    apiKey?: string,
  ) {
    // Assuming the IWebhook interface has an unregister method
    const webhook = this.getEventProcessor(params.type);
    return webhook.unregister(params.id);
  }

  async registerClient(client: WebhookClient) {
    return this.clientRepository.registerClient(client);
  }
}
