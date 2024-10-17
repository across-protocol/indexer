import { utils } from "@across-protocol/sdk";
import { DataSource, entities } from "@repo/indexer-database";
import winston from "winston";
import { RelayStatus } from "../../../indexer-database/dist/src/entities";

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
  ) {}

  public async process(events: {
    deposits: entities.V3FundsDeposited[];
    fills: entities.FilledV3Relay[];
    slowFillRequests: entities.RequestedV3SlowFill[];
    executedRefundRoots: entities.ExecutedRelayerRefundRoot[];
  }) {
    if (events.deposits.length > 0)
      await this.assignSpokeEventsToRelayHashInfo(
        SpokePoolEvents.V3FundsDeposited,
        events.deposits,
      );
    if (events.slowFillRequests.length > 0)
      await this.assignSpokeEventsToRelayHashInfo(
        SpokePoolEvents.RequestedV3SlowFill,
        events.slowFillRequests,
      );
    if (events.fills.length > 0)
      await this.assignSpokeEventsToRelayHashInfo(
        SpokePoolEvents.FilledV3Relay,
        events.fills,
      );
    await this.updateExpiredRelays();
    await this.updateRefundedDepositsStatus();
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
    const chunkedData = utils.chunk(data, this.queryBatchSize);
    const upsertResult = await Promise.all(
      chunkedData.map((chunk) =>
        relayHashInfoRepository.upsert(chunk, ["relayHash"]),
      ),
    );
    this.logger.info({
      at: "SpokePoolProcessor#assignSpokeEventsToRelayHashInfo",
      message: `${eventType} events associated with RelayHashInfo`,
      updatedRelayHashInfoRows: upsertResult.reduce(
        (acc, res) => acc + res.generatedMaps.length,
        0,
      ),
    });
  }

  /**
   * Updates the status of expired relays originated from this processor's chain id
   * @returns A void promise
   */
  private async updateExpiredRelays(): Promise<void> {
    const relayHashInfoRepository = this.postgres.getRepository(
      entities.RelayHashInfo,
    );
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
      .execute();
    this.logger.info({
      at: "SpokePoolProcessor#updateExpiredRelays",
      message: `Updated status for expired relays`,
      updatedRelayHashInfoRows: expiredDeposits.generatedMaps.length,
    });
  }

  /**
   * Calls the database to find expired relays and looks for related
   * refunds in the bundle events table.
   * When a matching refund is found, updates the relay status to refunded
   * @returns A void promise
   */
  private async updateRefundedDepositsStatus(): Promise<void> {
    const relayHashInfoRepository = this.postgres.getRepository(
      entities.RelayHashInfo,
    );
    const bundleEventsRepository = this.postgres.getRepository(
      entities.BundleEvents,
    );

    const expiredDeposits = await relayHashInfoRepository
      .createQueryBuilder("rhi")
      .select("rhi.relayHash")
      .where("rhi.status = :expired", { expired: entities.RelayStatus.Expired })
      .andWhere("rhi.originChainId = :chainId", { chainId: this.chainId })
      .limit(100)
      .getMany();

    let updatedRows = 0;
    for (const expiredDeposit of expiredDeposits) {
      // Check if this deposited is associated with a bundle
      const refundBundleEvent = await bundleEventsRepository
        .createQueryBuilder("be")
        .leftJoinAndSelect("bundle", "bundle", "be.bundleId = bundle.id")
        .where("be.eventType = :expiredDeposit", {
          expiredDeposit: entities.BundleEventTypes.ExpiredDeposit,
        })
        .andWhere("be.relayHash = :expiredDepositRelayHash", {
          expiredDepositRelayHash: expiredDeposit.relayHash,
        })
        .getOne();
      if (!refundBundleEvent) continue;

      // Get the relayerRefundRoot that included this refund
      const relayerRefundRoot = refundBundleEvent.bundle.relayerRefundRoot;

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
      await relayHashInfoRepository
        .createQueryBuilder()
        .update()
        .set({
          status: entities.RelayStatus.Refunded,
          depositRefundTxHash: executedRelayerRefundRootEvent.transactionHash,
        })
        .where("relayHash = :relayHash", {
          relayHash: expiredDeposit.relayHash,
        })
        .execute();

      updatedRows += 1;
    }
    if (updatedRows > 0) {
      this.logger.info({
        at: "SpokePoolProcessor#updateRefundedDepositsStatus",
        message: `Updated ${updatedRows} refunded deposits`,
      });
    }
  }
}
