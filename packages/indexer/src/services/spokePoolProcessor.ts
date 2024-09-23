import { DataSource, entities } from "@repo/indexer-database";
import winston from "winston";
import { RelayStatus } from "../../../indexer-database/dist/src/entities";

enum SpokePoolEvents {
  V3FundsDeposited = "V3FundsDeposited",
  FilledV3Relay = "FilledV3Relay",
  RequestedV3SlowFill = "RequestedV3SlowFill",
}

export class Processor {
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
    if (events.executedRefundRoots.length > 0)
      await this.updateRefundedDepositsStatus(events.executedRefundRoots);
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

    const updatedRelays = await relayHashInfoRepository.upsert(
      events.map((event) => {
        const eventField = eventTypeToField[eventType];
        return {
          relayHash: event.relayHash,
          depositId: event.depositId,
          originChainId: event.originChainId,
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
      }),
      ["relayHash"],
    );
    this.logger.info({
      at: "SpokePoolProcessor#assignSpokeEventsToRelayHashInfo",
      message: `${eventType} events associated with RelayHashInfo`,
      updatedRelayHashInfoRows: updatedRelays.generatedMaps.length,
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
   * Calls the database to find expired relays and looks for related refunds within
   * the recently saved executedRelayerRefundRoot events.
   * When a matching refund is found, updates the relay status to refunded
   * @param executedRefundRoots An array of already stored executedRelayerRefundRoot events
   * @returns A void promise
   */
  private async updateRefundedDepositsStatus(
    executedRefundRoots: entities.ExecutedRelayerRefundRoot[],
  ): Promise<void> {
    const relayHashInfoRepository = this.postgres.getRepository(
      entities.RelayHashInfo,
    );
    const expiredDeposits = await relayHashInfoRepository.find({
      where: {
        status: entities.RelayStatus.Expired,
        originChainId: this.chainId,
      },
      relations: ["depositEvent"],
    });
    let updatedRows = 0;
    for (const expiredDeposit of expiredDeposits) {
      const {
        depositor,
        inputAmount,
        inputToken,
        blockNumber: depositBlockNumber,
      } = expiredDeposit.depositEvent;
      // TODO: modify this once we are associating events with bundles. This is a temporary solution.
      const matchingRefunds = executedRefundRoots.filter((refund) => {
        return (
          refund.l2TokenAddress === inputToken &&
          refund.blockNumber > depositBlockNumber &&
          refund.refundAddresses.some(
            (address, idx) =>
              address === depositor &&
              refund.refundAmounts[idx] === inputAmount,
          )
        );
      });
      if (matchingRefunds.length > 1) {
        this.logger.warn({
          at: "SpokePoolProcessor#updateRefundedDepositsStatus",
          message: `Unable to set refund for deposit with id ${expiredDeposit.depositEventId}. Found ${matchingRefunds.length} matches.`,
        });
      } else if (matchingRefunds[0]) {
        await relayHashInfoRepository.update(
          { id: expiredDeposit.id },
          {
            depositRefundTxHash: matchingRefunds[0].transactionHash,
            status: entities.RelayStatus.Refunded,
          },
        );
        updatedRows += 1;
      }
    }
    if (updatedRows > 0) {
      this.logger.info({
        at: "SpokePoolProcessor#updateRefundedDepositsStatus",
        message: `Updated ${updatedRows} refunded deposits`,
      });
    }
  }
}
