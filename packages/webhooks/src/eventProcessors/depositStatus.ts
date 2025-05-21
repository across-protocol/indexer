import * as ss from "superstruct";
import { Logger } from "winston";

import { assert } from "@repo/error-handling";
import { DataSource, entities } from "@repo/indexer-database";

import { WebhookRequestRepository } from "../database/webhookRequestRepository";
import { customId } from "../utils";

import { IEventProcessor, NotificationPayload } from "../types";
import { WebhookClientRepository } from "../database/webhookClientRepository";

export const DepositStatusEvent = ss.object({
  originChainId: ss.coerce(ss.number(), ss.string(), (value) =>
    parseInt(value),
  ),
  depositTxHash: ss.string(),
  depositId: ss.string(),
  status: ss.string(),
});
export type DepositStatusEvent = ss.Infer<typeof DepositStatusEvent>;

export const DepositStatusFilter = ss.object({
  originChainId: ss.coerce(ss.number(), ss.string(), (value) =>
    parseInt(value),
  ),
  depositTxHash: ss.string(),
});
export type DepositStatusFilter = ss.Infer<typeof DepositStatusFilter>;

export type Dependencies = {
  notify: (params: NotificationPayload) => void;
  postgres: DataSource;
  logger: Logger;
};
export class DepositStatusProcessor implements IEventProcessor {
  private webhookRequests: WebhookRequestRepository;
  private webhookClientsRepository: WebhookClientRepository;
  private notify: (params: NotificationPayload) => void;
  private logger: Logger;

  constructor(
    deps: Dependencies,
    private type: string = "DepositStatus",
  ) {
    this.webhookRequests = new WebhookRequestRepository(deps.postgres);
    this.webhookClientsRepository = new WebhookClientRepository(deps.postgres);
    this.notify = deps.notify;
    this.logger = deps.logger;
  }
  private async _write(event: DepositStatusEvent): Promise<void> {
    const filter = customId(
      this.type,
      event.originChainId,
      event.depositTxHash,
    );
    const webhookRequests =
      await this.webhookRequests.findWebhookRequestsByFilter(filter);
    const uniqueClientIds = [
      ...new Set(webhookRequests.map((hook) => hook.clientId)),
    ];
    const clients = await Promise.all(
      uniqueClientIds.map((id) =>
        this.webhookClientsRepository.getWebhookClientById(id),
      ),
    );
    const clientsMap = clients
      .filter(
        (client): client is entities.WebhookClient => client !== undefined,
      )
      .reduce(
        (acc, client) => {
          acc[client.id] = client;
          return acc;
        },
        {} as Record<number, entities.WebhookClient>,
      );

    //TODO: unregister any hooks where event has reached terminal state
    webhookRequests.forEach((hook) => {
      const client = clientsMap[hook.clientId];
      if (client) {
        this.notify({
          url: hook.url,
          data: {
            ...event,
            depositId:
              typeof event.depositId === "string"
                ? parseInt(event.depositId)
                : event.depositId,
            webhookRequestId: hook.id,
          },
          apiKey: client.apiKey,
        });
      } else {
        this.logger.error({
          at: "DepositStatusProcessor::_write",
          message: `Client not found for webhook request ${hook.id}`,
          webhookRequest: hook,
        });
      }
    });
  }

  write(e: unknown) {
    this._write(ss.create(e, DepositStatusEvent)).catch((err) =>
      console.error(err),
    );
  }

  private async _register(
    id: string,
    url: string,
    params: DepositStatusFilter,
    clientId: number,
  ): Promise<string> {
    const filter = customId(
      this.type,
      params.originChainId,
      params.depositTxHash,
    );
    const existingFilters =
      await this.webhookRequests.findWebhookRequestsByFilterAndClient(
        filter,
        clientId,
      );
    assert(
      existingFilters.length === 0,
      "Webhook already exists for this filter",
    );
    await this.webhookRequests.register({
      id,
      filter,
      url,
      clientId,
    });
    return id;
  }
  async register(id: string, url: string, params: unknown, clientId: number) {
    return this._register(
      id,
      url,
      ss.create(params, DepositStatusFilter),
      clientId,
    );
  }
  async unregister(id: string): Promise<void> {
    assert(
      await this.webhookRequests.hasWebhookRequest(id),
      "This webhook does not exist",
    );
    await this.webhookRequests.unregister(id);
  }
}
