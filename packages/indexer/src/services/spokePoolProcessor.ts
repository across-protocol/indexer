import { utils } from "@across-protocol/sdk";
import winston from "winston";

import {
  DataSource,
  entities,
  utils as dbUtils,
  SaveQueryResultType,
} from "@repo/indexer-database";
import { WebhookTypes, eventProcessorManager } from "@repo/webhooks";

import { RelayStatus } from "../../../indexer-database/dist/src/entities";
import { StoreEventsResult } from "../data-indexing/service/SpokePoolIndexerDataHandler";

enum SpokePoolEvents {
  V3FundsDeposited = "V3FundsDeposited",
  FilledV3Relay = "FilledV3Relay",
  RequestedV3SlowFill = "RequestedV3SlowFill",
}

export class SpokePoolProcessor {
  private queryBatchSize = 100;

  constructor(
    private readonly postgres: DataSource,
    private readonly logger: winston.Logger,
    private readonly chainId: number,
    private readonly webhookWriteFn?: eventProcessorManager.WebhookWriteFn,
  ) {}

  public async process(events: StoreEventsResult) {
    const newDeposits = dbUtils.filterSaveQueryResults(
      events.deposits,
      SaveQueryResultType.Inserted,
    );
    const updatedDeposits = dbUtils.filterSaveQueryResults(
      events.deposits,
      SaveQueryResultType.Updated,
    );
    await this.assignSpokeEventsToRelayHashInfo(
      SpokePoolEvents.V3FundsDeposited,
      [...newDeposits, ...updatedDeposits],
    );

    // Notify webhook of new deposits
    newDeposits.forEach((deposit) => {
      this.webhookWriteFn?.({
        type: WebhookTypes.DepositStatus,
        event: {
          depositId: deposit.id,
          originChainId: deposit.originChainId,
          depositTxHash: deposit.transactionHash,
          status: RelayStatus.Unfilled,
        },
      });
    });
    const newSlowFillRequests = dbUtils.filterSaveQueryResults(
      events.slowFillRequests,
      SaveQueryResultType.Inserted,
    );
    const updatedSlowFillRequests = dbUtils.filterSaveQueryResults(
      events.slowFillRequests,
      SaveQueryResultType.Updated,
    );
    await this.assignSpokeEventsToRelayHashInfo(
      SpokePoolEvents.RequestedV3SlowFill,
      [...newSlowFillRequests, ...updatedSlowFillRequests],
    );

    // Notify webhook of new slow fill requests
    newSlowFillRequests.forEach((deposit) => {
      this.webhookWriteFn?.({
        type: WebhookTypes.DepositStatus,
        event: {
          depositId: deposit.id,
          originChainId: deposit.originChainId,
          depositTxHash: deposit.transactionHash,
          status: RelayStatus.SlowFillRequested,
        },
      });
    });

    const newFills = dbUtils.filterSaveQueryResults(
      events.fills,
      SaveQueryResultType.Inserted,
    );
    const updatedFills = dbUtils.filterSaveQueryResults(
      events.fills,
      SaveQueryResultType.Updated,
    );
    await this.assignSpokeEventsToRelayHashInfo(SpokePoolEvents.FilledV3Relay, [
      ...newFills,
      ...updatedFills,
    ]);

    // Notify webhook of new fills
    newFills.forEach((fill) => {
      this.webhookWriteFn?.({
        type: WebhookTypes.DepositStatus,
        event: {
          depositId: fill.depositId,
          originChainId: fill.originChainId,
          depositTxHash: fill.transactionHash,
          status: RelayStatus.Filled,
        },
      });
    });

    const expiredDeposits = await this.updateExpiredRelays();
    // Notify webhook of expired deposits
    expiredDeposits.forEach((deposit) => {
      this.webhookWriteFn?.({
        type: WebhookTypes.DepositStatus,
        event: {
          depositId: deposit.depositId,
          originChainId: deposit.originChainId,
          depositTxHash: deposit.depositTxHash,
          status: RelayStatus.Expired,
        },
      });
    });

    const refundedDeposits = await this.updateRefundedDepositsStatus();

    // Notify webhook of refunded deposits
    refundedDeposits.forEach((deposit) => {
      this.webhookWriteFn?.({
        type: WebhookTypes.DepositStatus,
        event: {
          depositId: deposit.depositId,
          originChainId: deposit.originChainId,
          depositTxHash: deposit.depositTxHash,
          status: RelayStatus.Refunded,
        },
      });
    });
  }

  /**
   * Updates relayHashInfo table to include recently stored events
   * @param events An array of already stored deposits, fills or slow fill requests
   * @returns A void promise
   */
  private async assignSpokeEventsToRelayHashInfo(
    eventType: SpokePoolEvents,
    events:
      | entities.V3FundsDeposited[]
      | entities.FilledV3Relay[]
      | entities.RequestedV3SlowFill[],
  ): Promise<void> {
    const relayHashInfoRepository = this.postgres.getRepository(
      entities.RelayHashInfo,
    );
    const eventTypeToField = {
      [SpokePoolEvents.V3FundsDeposited]: "depositEventId",
      [SpokePoolEvents.FilledV3Relay]: "fillEventId",
      [SpokePoolEvents.RequestedV3SlowFill]: "requestSlowFillEventId",
    };
    const data = events.map((event) => {
      const eventField = eventTypeToField[eventType];
      return {
        relayHash: event.relayHash,
        depositId: event.depositId,
        originChainId: event.originChainId,
        destinationChainId: event.destinationChainId,
        fillDeadline: event.fillDeadline,
        [eventField]: event.id,
        ...(eventType === SpokePoolEvents.V3FundsDeposited && {
          depositTxHash: event.transactionHash,
        }),
        ...(eventType === SpokePoolEvents.FilledV3Relay && {
          status: RelayStatus.Filled,
          fillTxHash: event.transactionHash,
        }),
        ...(eventType === SpokePoolEvents.RequestedV3SlowFill && {
          status: RelayStatus.SlowFillRequested,
        }),
      };
    });

    const upsertResults = [];
    for (const item of data) {
      upsertResults.push(
        await relayHashInfoRepository.upsert(item, ["relayHash"]),
      );
    }

    this.logger.debug({
      at: "Indexer#SpokePoolProcessor#assignSpokeEventsToRelayHashInfo",
      message: `${eventType} events associated with RelayHashInfo`,
      updatedRelayHashInfoRows: upsertResults.reduce(
        (acc, res) => acc + res.generatedMaps.length,
        0,
      ),
    });
  }

  /**
   * Updates the status of expired relays originated from this processor's chain id
   * @returns An array with the updated relays
   */
  private async updateExpiredRelays(): Promise<entities.RelayHashInfo[]> {
    const relayHashInfoRepository = this.postgres.getRepository(
      entities.RelayHashInfo,
    );
    this.logger.debug({
      at: "Indexer#SpokePoolProcessor#updateExpiredRelays",
      message: `Updating status for expired relays`,
    });
    const expiredDeposits = await relayHashInfoRepository
      .createQueryBuilder()
      .update()
      .set({ status: entities.RelayStatus.Expired })
      .where("originChainId = :chainId", { chainId: this.chainId })
      .andWhere("fillDeadline < NOW()")
      .andWhere("status IN (:...pendingStatuses)", {
        pendingStatuses: [
          entities.RelayStatus.Unfilled,
          entities.RelayStatus.SlowFillRequested,
        ],
      })
      .returning("*")
      .execute();

    if ((expiredDeposits.affected ?? 0) > 0) {
      this.logger.debug({
        at: "Indexer#SpokePoolProcessor#updateExpiredRelays",
        message: `Updated status for ${expiredDeposits.affected} expired relays`,
      });
    }

    return expiredDeposits.raw;
  }

  /**
   * Calls the database to find expired relays and looks for related
   * refunds in the bundle events table.
   * When a matching refund is found, updates the relay status to refunded
   * @returns An array with the updated relays
   */
  private async updateRefundedDepositsStatus(): Promise<
    entities.RelayHashInfo[]
  > {
    this.logger.debug({
      at: "Indexer#SpokePoolProcessor#updateRefundedDepositsStatus",
      message: `Updating status for refunded deposits`,
    });
    const bundleEventsRepository = this.postgres.getRepository(
      entities.BundleEvent,
    );
    const refundEvents = await bundleEventsRepository
      .createQueryBuilder("be")
      .innerJoinAndSelect("be.bundle", "bundle")
      .innerJoin(entities.RelayHashInfo, "rhi", "be.relayHash = rhi.relayHash")
      .where("be.type = :expiredDeposit", {
        expiredDeposit: entities.BundleEventType.ExpiredDeposit,
      })
      .andWhere("rhi.status = :expired", {
        expired: entities.RelayStatus.Expired,
      })
      .andWhere("rhi.originChainId = :chainId", { chainId: this.chainId })
      .orderBy("be.bundleId", "DESC")
      .limit(100)
      .getMany();

    let updatedRows = [];
    for (const refundEvent of refundEvents) {
      // Get the relayerRefundRoot that included this refund
      const relayerRefundRoot = refundEvent.bundle.relayerRefundRoot;

      // Look for a relayed root bundle event that matches the relayerRefundRoot
      const relayRootBundleRepo = this.postgres.getRepository(
        entities.RelayedRootBundle,
      );
      const relayedRootBundleEvent = await relayRootBundleRepo
        .createQueryBuilder("rrb")
        .select("rrb.rootBundleId")
        .where("rrb.relayerRefundRoot = :relayerRefundRoot", {
          relayerRefundRoot,
        })
        .andWhere("rrb.chainId = :chainId", { chainId: this.chainId })
        .getOne();
      if (!relayedRootBundleEvent) continue;

      // Look for the execution of the relayer refund root using the rootBundleId
      const rootBundleId = relayedRootBundleEvent.rootBundleId;
      const executedRelayerRefundRepo = this.postgres.getRepository(
        entities.ExecutedRelayerRefundRoot,
      );
      const executedRelayerRefundRootEvent = await executedRelayerRefundRepo
        .createQueryBuilder("err")
        .where("err.rootBundleId = :rootBundleId", {
          rootBundleId,
        })
        .andWhere("err.chainId = :chainId", { chainId: this.chainId })
        .getOne();
      if (!executedRelayerRefundRootEvent) continue;

      // If we found the execution of the relayer refund root, we can update the relay status
      const relayHashInfoRepo = this.postgres.getRepository(
        entities.RelayHashInfo,
      );
      await relayHashInfoRepo
        .createQueryBuilder()
        .update()
        .set({
          status: entities.RelayStatus.Refunded,
          depositRefundTxHash: executedRelayerRefundRootEvent.transactionHash,
        })
        .where("relayHash = :relayHash", {
          relayHash: refundEvent.relayHash,
        })
        .execute();
      const updatedRow = await relayHashInfoRepo.findOne({
        where: { relayHash: refundEvent.relayHash },
      });
      updatedRow && updatedRows.push(updatedRow);
    }
    if (updatedRows.length > 0) {
      this.logger.debug({
        at: "Indexer#SpokePoolProcessor#updateRefundedDepositsStatus",
        message: `Updated ${updatedRows.length} refunded deposits`,
      });
    }
    return updatedRows;
  }
}
