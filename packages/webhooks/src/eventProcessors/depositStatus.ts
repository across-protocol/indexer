import assert from "assert";
import { DataSource, entities } from "@repo/indexer-database";
import { WebhookRequestRepository } from "../database/webhookRequestRepository";
import {
  JSONValue,
  IEventProcessor,
  NotificationPayload,
  WebhookRequest,
} from "../types";

import * as ss from "superstruct";

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
  webhookRequests: WebhookRequestRepository;
  notify: (params: NotificationPayload) => void;
  postgres: DataSource;
};
export class DepositStatusProcessor implements IEventProcessor {
  private webhookRequests: WebhookRequestRepository;
  private notify: (params: NotificationPayload) => void;
  private postgres: DataSource;

  constructor(deps: Dependencies) {
    this.webhookRequests = deps.webhookRequests;
    this.notify = deps.notify;
    this.postgres = deps.postgres;
  }
  private async _write(event: DepositStatusEvent): Promise<void> {
    const filter = [event.originChainId, event.depositTxHash].join("!");
    const hooks = await this.webhookRequests.filterWebhooks(filter);
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
    url: string,
    params: DepositStatusFilter,
  ): Promise<string> {
    const id = [url, params.originChainId, params.depositTxHash].join("!");
    const filter = [params.originChainId, params.depositTxHash].join("!");
    assert(
      !(await this.webhookRequests.hasWebhook(id)),
      "This webhook already exists",
    );
    await this.webhookRequests.register({
      id,
      filter,
      url,
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
  async register(url: string, params: unknown) {
    return this._register(url, ss.create(params, DepositStatusFilter));
  }
  async unregister(id: string): Promise<void> {
    assert(
      await this.webhookRequests.hasWebhook(id),
      "This webhook does not exist",
    );
    await this.webhookRequests.unregister(id);
  }
}
