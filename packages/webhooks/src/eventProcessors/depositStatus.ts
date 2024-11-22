import assert from "assert";
import * as ss from "superstruct";

import { DataSource, entities } from "@repo/indexer-database";
import { WebhookRequestRepository } from "../database/webhookRequestRepository";
import { customId } from "../utils";

import { IEventProcessor, NotificationPayload } from "../types";

export const DepositStatusEvent = ss.object({
  originChainId: ss.number(),
  depositTxHash: ss.string(),
  depositId: ss.number(),
  status: ss.string(),
});
export type DepositStatusEvent = ss.Infer<typeof DepositStatusEvent>;

export const DepositStatusFilter = ss.object({
  originChainId: ss.number(),
  depositTxHash: ss.string(),
});
export type DepositStatusFilter = ss.Infer<typeof DepositStatusFilter>;

export type Dependencies = {
  notify: (params: NotificationPayload) => void;
  postgres: DataSource;
};
export class DepositStatusProcessor implements IEventProcessor {
  private webhookRequests: WebhookRequestRepository;
  private notify: (params: NotificationPayload) => void;
  private postgres: DataSource;
  constructor(
    deps: Dependencies,
    private type: string = "DepositStatus",
  ) {
    this.webhookRequests = new WebhookRequestRepository(deps.postgres);
    this.notify = deps.notify;
    this.postgres = deps.postgres;
  }
  private async _write(event: DepositStatusEvent): Promise<void> {
    const filter = customId(
      this.type,
      event.originChainId,
      event.depositTxHash,
    );
    const hooks =
      await this.webhookRequests.findWebhookRequestsByFilter(filter);
    //TODO: unregister any hooks where event has reached terminal state
    await Promise.all(
      hooks.map((hook) => {
        this.notify({
          url: hook.url,
          data: event,
        });
      }),
    );
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
    clientId?: string,
  ): Promise<string> {
    const filter = customId(
      this.type,
      clientId ?? "",
      params.originChainId,
      params.depositTxHash,
    );
    const existingFilters =
      await this.webhookRequests.findWebhookRequestsByFilter(filter);
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
    const relayHashInfoRepository = this.postgres.getRepository(
      entities.RelayHashInfo,
    );
    const relayHashInfo = await relayHashInfoRepository.findOne({
      where: params,
    });
    if (relayHashInfo)
      this._write({
        depositId: relayHashInfo.depositId,
        status: relayHashInfo.status,
        ...params,
      });
    return id;
  }
  async register(id: string, url: string, params: unknown, clientId?: string) {
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
