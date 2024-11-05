import { Logger } from "winston";

import { DataSource, entities } from "@repo/indexer-database";
import { assert } from "@repo/error-handling";

import { WebhookClientRepository } from "./database/webhookClientRepository";
import { JSONValue, IEventProcessor } from "./types";
import {
  WebhooksQueues,
  WebhooksQueuesService,
} from "./adapter/messaging/WebhooksQueuesService";
import { WebhookTypes } from "./factory";
import { WebhookRequestQueueJob } from "./adapter/messaging/WebhookRequestWorker";

export type EventProcessorRecord = Record<string, IEventProcessor>;

export type WebhookWriteFn = (event: EventType) => void;

export type EventType = {
  type: WebhookTypes;
  event: JSONValue;
};

export type Config = {
  requireApiKey: boolean;
};

export type Dependencies = {
  postgres: DataSource;
  logger: Logger;
  webhooksQueuesService: WebhooksQueuesService;
  clientRepository: WebhookClientRepository;
};
export class EventProcessorManager {
  private logger: Logger;
  private clientRepository: WebhookClientRepository;
  private processors = new Map<WebhookTypes, IEventProcessor>();
  private webhooksQueuesService: WebhooksQueuesService;

  constructor(deps: Dependencies) {
    this.logger = deps.logger;
    this.webhooksQueuesService = deps.webhooksQueuesService;
    this.clientRepository = deps.clientRepository;
  }

  // Register a new type of webhook processor able to be written to
  public registerEventProcessor(name: WebhookTypes, webhook: IEventProcessor) {
    this.logger.debug(
      `Attempting to register event processor with name: ${name}`,
    );
    assert(
      !this.processors.has(name),
      `Webhook with that name already exists: ${name}`,
    );
    this.processors.set(name, webhook);
    this.logger.debug(
      `Successfully registered event processor with name: ${name}`,
    );
  }

  private getEventProcessor(name: WebhookTypes) {
    const eventProcessor = this.processors.get(name);
    assert(eventProcessor, `EventProcessor does not exist by type: ${name}`);
    return eventProcessor;
  }
  write: WebhookWriteFn = (event: EventType): void => {
    const webhook = this.getEventProcessor(event.type);
    webhook.write(event.event);
  };

  async registerWebhook(
    id: string,
    params: { type: string; url: string; filter: JSONValue },
    apiKey: string,
  ) {
    this.logger.debug(
      `Attempting to register webhook of type: ${params.type} with URL: ${params.url}`,
    );
    const client = await this.clientRepository.getClientByApiKey(apiKey);
    // TODO: Re-enable this potentially when we need it, but not great for testing
    // const urlDomain = new URL(params.url).hostname;
    // const isDomainValid = client.domains.includes(urlDomain);
    // assert(
    //   isDomainValid,
    //   "The base URL of the provided webhook does not match any of the client domains",
    // );
    assert((params.filter as any).depositTxHash, "depositTxHash is required");
    assert((params.filter as any).originChainId, "originChainId is required");
    const webhook = this.getEventProcessor(params.type as WebhookTypes);
    const webhookRequestId = await webhook.register(
      id,
      params.url,
      params.filter,
      client.id,
    );
    this.logger.debug(
      `Successfully registered webhook with ID: ${webhookRequestId}`,
    );
    this.webhooksQueuesService.publishMessage<WebhookRequestQueueJob>(
      WebhooksQueues.WebhookRequest,
      {
        webhookRequestId,
        depositTxHash: (params.filter as any).depositTxHash,
        originChainId: (params.filter as any).originChainId,
      },
    );
    return webhookRequestId;
  }

  // TODO: gaurd this with api key
  async unregisterWebhook(
    params: { type: string; id: string },
    apiKey?: string,
  ) {
    this.logger.debug(
      `Attempting to unregister webhook of type: ${params.type} with ID: ${params.id}`,
    );
    const webhook = this.getEventProcessor(params.type as WebhookTypes);
    await webhook.unregister(params.id);
    this.logger.debug(
      `Successfully unregistered webhook with ID: ${params.id}`,
    );
  }
}
