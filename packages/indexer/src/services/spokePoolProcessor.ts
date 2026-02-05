import winston from "winston";
import { utils } from "@across-protocol/sdk";

import {
  DataSource,
  entities,
  InsertResult,
  UpdateResult,
  Not,
} from "@repo/indexer-database";
import { WebhookTypes, eventProcessorManager } from "@repo/webhooks";
import {
  DepositSwapPair,
  FillCallsFailedPair,
  FillSwapMetadataPair,
} from "../data-indexing/service/SpokePoolIndexerDataHandler";
import { FillTargetChainActionPair } from "../utils/targetChainActionsUtils";
import { StoreEventsResult } from "../database/SpokePoolRepository";
import { getDbLockKeyForDeposit } from "../utils";

enum SpokePoolEvents {
  V3FundsDeposited = "V3FundsDeposited",
  FilledV3Relay = "FilledV3Relay",
  RequestedV3SlowFill = "RequestedV3SlowFill",
}

export class SpokePoolProcessor {
  constructor(
    private readonly postgres: DataSource,
    private readonly chainId: number,
    private readonly logger: winston.Logger,
    private readonly webhookWriteFn?: eventProcessorManager.WebhookWriteFn,
  ) {}

  public async process(
    events: StoreEventsResult,
    deletedDeposits: entities.V3FundsDeposited[],
    depositSwapPairs: DepositSwapPair[],
    fillCallsFailedPairs: FillCallsFailedPair[],
    fillSwapMetadataPairs: FillSwapMetadataPair[],
    fillTargetChainActionPairs: FillTargetChainActionPair[],
    fillsGasFee?: Record<string, bigint | undefined>,
  ) {
    // Update relay hash info records related to deleted deposits
    await this.processDeletedDeposits(deletedDeposits);

    // Assign events to relay hash info
    const timeToAssignSpokeEventsToRelayHashInfoStart = performance.now();
    await this.assignSpokeEventsToRelayHashInfo({
      deposits: events.deposits.map((d) => d.data),
      fills: events.fills.map((f) => f.data),
      slowFillRequests: events.slowFillRequests.map((s) => s.data),
      fillsGasFee,
    });
    await this.assignSwapEventToRelayHashInfo(depositSwapPairs);
    await this.assignCallsFailedEventToRelayHashInfo(fillCallsFailedPairs);
    await this.assignSwapMetadataEventToRelayHashInfo(fillSwapMetadataPairs);
    await this.assignTargetChainActionEventToRelayHashInfo(
      fillTargetChainActionPairs,
    );
    const timeToAssignSpokeEventsToRelayHashInfoEnd = performance.now();

    // Update expired deposits
    const timeToUpdateExpiredRelaysStart = performance.now();
    await this.updateExpiredRelays();
    const timeToUpdateExpiredRelaysEnd = performance.now();
    const end = performance.now();

    this.logger.debug({
      at: "Indexer#SpokePoolProcessor#process",
      message: "System Time Log for SpokePoolProcessor#process",
      spokeChainId: this.chainId,
      timeToAssignSpokeEventsToRelayHashInfo:
        timeToAssignSpokeEventsToRelayHashInfoEnd -
        timeToAssignSpokeEventsToRelayHashInfoStart,
      timeToUpdateExpiredRelays:
        timeToUpdateExpiredRelaysEnd - timeToUpdateExpiredRelaysStart,
      totalTime: end - timeToAssignSpokeEventsToRelayHashInfoStart,
    });
  }

  /**
   * Updates relayHashInfo table to include recently stored events
   * @param events An object with stored deposits, fills and slow fill requests
   * @returns A void promise
   */
  public async assignSpokeEventsToRelayHashInfo(events: {
    deposits: entities.V3FundsDeposited[];
    fills: entities.FilledV3Relay[];
    slowFillRequests: entities.RequestedV3SlowFill[];
    fillsGasFee?: Record<string, bigint | undefined>;
  }): Promise<void> {
    await Promise.all([
      this.assignDepositEventsToRelayHashInfo(events.deposits),
      this.assignFillEventsToRelayHashInfo(events.fills, events.fillsGasFee),
      this.assignSlowFillRequestedEventsToRelayHashInfo(
        events.slowFillRequests,
      ),
    ]);
  }

  /**
   * Updates relayHashInfo table to include recently stored deposits
   * @param events An array of already stored deposits
   * @returns A void promise
   */
  private async assignDepositEventsToRelayHashInfo(
    events: entities.V3FundsDeposited[],
  ): Promise<void> {
    const results = await assignDepositEventsToRelayHashInfo(
      events,
      this.postgres,
    );

    this.logRelayHashInfoAssignmentResult(
      SpokePoolEvents.V3FundsDeposited,
      results.insertResults,
      results.updateResults,
    );
  }

  /**
   * Updates relayHashInfo table to include recently stored fills
   * @param events An array of already stored fills
   * @returns A void promise
   */
  private async assignFillEventsToRelayHashInfo(
    events: entities.FilledV3Relay[],
    fillsGasFee?: Record<string, bigint | undefined>,
  ): Promise<void> {
    const results = await assignFillEventsToRelayHashInfo(
      events,
      this.postgres,
      fillsGasFee,
    );

    this.logRelayHashInfoAssignmentResult(
      SpokePoolEvents.FilledV3Relay,
      results.insertResults,
      results.updateResults,
    );
  }

  /**
   * Updates relayHashInfo table to include recently requested slow fill events
   * @param events An array of already stored requested slow fills
   * @returns A void promise
   */
  private async assignSlowFillRequestedEventsToRelayHashInfo(
    events: entities.RequestedV3SlowFill[],
  ): Promise<void> {
    const results = await assignSlowFillRequestedEventsToRelayHashInfo(
      events,
      this.postgres,
    );

    this.logRelayHashInfoAssignmentResult(
      SpokePoolEvents.RequestedV3SlowFill,
      results.insertResults,
      results.updateResults,
    );
  }

  private logRelayHashInfoAssignmentResult(
    eventType: SpokePoolEvents,
    insertResults: InsertResult[],
    updateResults: UpdateResult[],
  ) {
    const insertedRows = insertResults.reduce(
      (acc, res) => acc + res.generatedMaps.length,
      0,
    );
    const updatedRows = updateResults.reduce(
      (acc, res) => acc + res.affected!,
      0,
    );
    if (insertedRows > 0 || updatedRows > 0) {
      this.logger.debug({
        at: "Indexer#SpokePoolProcessor#assignSpokeEventsToRelayHashInfo",
        message: `${eventType} events associated with RelayHashInfo`,
        insertedRows,
        updatedRows,
      });
    }
  }

  /**
   * Updates or deletes relay rows related to deleted deposit events.
   *
   * This function iterates over a list of deleted deposit events and ensures that its
   * corresponding rows in RelayHashInfo are properly updated or deleted.
   * - If a relay row has no other associated events (`fillEventId`, `slowFillRequestEventId`, `depositRefundTxHash`),
   *   it is deleted.
   * - If a relay row has other associated events and there are no other rows matching the `relayHash`, only the
   *   reference to the deleted deposit is removed.
   * - If other relay rows match the relayHash, the deposit information is transferred to the row with other
   *   events, and deletes the extra row.
   * Operations are wrapped in a transaction and use a lock to avoid race conditions with processes that might
   * be updating rows for the same relayHash.
   * @param deletedDeposits - List of deleted deposit events.
   * @returns A void promise
   */
  public async processDeletedDeposits(
    deletedDeposits: entities.V3FundsDeposited[],
  ) {
    for (const deposit of deletedDeposits) {
      await this.postgres.transaction(async (transactionalEntityManager) => {
        const relayHashInfoRepository =
          transactionalEntityManager.getRepository(entities.RelayHashInfo);

        this.logger.warn({
          at: "spokePoolProcessor#processDeletedDeposits",
          message: `Processing deleted deposit event with id ${deposit.id}`,
          deletedDepositDetails: {
            originChainId: deposit.originChainId,
            txHash: deposit.transactionHash,
            blockNumber: deposit.blockNumber,
            txIndex: deposit.transactionIndex,
            logIndex: deposit.logIndex,
          },
        });
        const lockKey = getDbLockKeyForDeposit(deposit);
        // Acquire a lock to prevent concurrent modifications on the same relayHash.
        // The lock is automatically released when the transaction commits or rolls back.
        await transactionalEntityManager.query(
          `SELECT pg_advisory_xact_lock($2, $1)`,
          lockKey,
        );

        const relatedRelayRow = await relayHashInfoRepository.findOne({
          where: { depositEventId: deposit.id },
        });

        if (relatedRelayRow) {
          const { fillEventId, slowFillRequestEventId, depositRefundTxHash } =
            relatedRelayRow;

          if (!fillEventId && !slowFillRequestEventId && !depositRefundTxHash) {
            // There are no other related events then it's safe to delete the row
            await relayHashInfoRepository.delete({ id: relatedRelayRow.id });
            this.logger.warn({
              at: "spokePoolProcessor#processDeletedDeposits",
              message: `Deleted relay row with id ${relatedRelayRow.id}. No related events.`,
            });
          } else {
            // There are other related events with the relay row
            // Check if there are other rows with matching internalHash
            const relayHashRecords = await relayHashInfoRepository.find({
              where: {
                id: Not(relatedRelayRow.id),
                internalHash: deposit.internalHash,
              },
              order: { depositEventId: "ASC" },
            });

            if (relayHashRecords.length === 0) {
              // There are no other rows for this relayHash
              // Only delete the reference to the deleted event in the existing row
              await relayHashInfoRepository.update(
                { id: relatedRelayRow.id },
                { depositEventId: null, depositTxHash: null },
              );
              this.logger.warn({
                at: "spokePoolProcessor#processDeletedDeposits",
                message: `Updated relay row with id ${relatedRelayRow.id} to remove reference to deleted deposit event ${deposit.id}.`,
              });
            } else {
              // There are other rows matching this relayHash
              // Get the one with the lowest depositEventId
              const nextMatchingRow = relayHashRecords[0]!;

              // We don't expect this row to have any associated events as those
              // were already associated with the row we got from the first query
              if (
                nextMatchingRow.fillEventId ||
                nextMatchingRow.slowFillRequestEventId ||
                nextMatchingRow.depositRefundTxHash
              ) {
                throw new Error(
                  `Unexpected event associations found in next matching row with id: ${nextMatchingRow.id}`,
                );
              }

              // Delete the row with matching relayHash and transfer its data to the row we are updating.
              await relayHashInfoRepository.delete({ id: nextMatchingRow.id });
              await relayHashInfoRepository.update(
                { id: relatedRelayRow.id },
                {
                  depositEventId: nextMatchingRow.depositEventId,
                  depositTxHash: nextMatchingRow.depositTxHash,
                },
              );
              this.logger.warn({
                at: "spokePoolProcessor#processDeletedDeposits",
                message: `Merged data from relay row with id ${nextMatchingRow.id} into ${relatedRelayRow.id} and deleted the former.`,
              });
            }
          }
        }
      });
    }
  }

  /**
   * Updates the status of expired relays originated from this processor's chain id
   * @returns An array with the updated relays
   */
  public async updateExpiredRelays(): Promise<entities.RelayHashInfo[]> {
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
   * Assigns the swap event to the relay hash info
   */
  private async assignSwapEventToRelayHashInfo(
    depositSwapPairs: DepositSwapPair[],
  ) {
    await assignSwapEventToRelayHashInfo(depositSwapPairs, this.postgres);
  }

  /**
   * Assigns the CallsFailed event to the relay hash info
   */
  private async assignCallsFailedEventToRelayHashInfo(
    fillCallsFailedPairs: FillCallsFailedPair[],
  ) {
    await assignCallsFailedEventToRelayHashInfo(
      fillCallsFailedPairs,
      this.postgres,
    );
  }

  /**
   * Assigns the SwapMetadata events to the relay hash info
   * Updates each swap metadata record with the corresponding relay hash info ID
   */
  private async assignSwapMetadataEventToRelayHashInfo(
    fillSwapMetadataPairs: FillSwapMetadataPair[],
  ) {
    await assignSwapMetadataEventToRelayHashInfo(
      fillSwapMetadataPairs,
      this.postgres,
    );
  }

  /**
   * Assigns target chain action information to the relay hash info
   */
  private async assignTargetChainActionEventToRelayHashInfo(
    fillTargetChainActionPairs: FillTargetChainActionPair[],
  ) {
    await assignTargetChainActionEventToRelayHashInfo(
      fillTargetChainActionPairs,
      this.postgres,
    );
  }

  private notifyWebhooks(
    deposits: entities.V3FundsDeposited[],
    fills: entities.FilledV3Relay[],
    slowFillRequests: entities.RequestedV3SlowFill[],
    expiredDeposits: entities.RelayHashInfo[],
  ) {
    // Send webhook notifications
    // Notify webhook of new deposits
    deposits.forEach((deposit) => {
      this.webhookWriteFn?.({
        type: WebhookTypes.DepositStatus,
        event: {
          depositId: deposit.depositId,
          originChainId: deposit.originChainId,
          depositTxHash: deposit.transactionHash,
          status: entities.RelayStatus.Unfilled,
        },
      });
    });

    // Notify webhook of new slow fill requests
    slowFillRequests.forEach((deposit) => {
      this.webhookWriteFn?.({
        type: WebhookTypes.DepositStatus,
        event: {
          depositId: deposit.depositId,
          originChainId: deposit.originChainId,
          depositTxHash: deposit.transactionHash,
          status: entities.RelayStatus.SlowFillRequested,
        },
      });
    });

    // Notify webhook of new fills
    fills.forEach((fill) => {
      this.webhookWriteFn?.({
        type: WebhookTypes.DepositStatus,
        event: {
          depositId: fill.depositId,
          originChainId: fill.originChainId,
          depositTxHash: fill.transactionHash,
          status: entities.RelayStatus.Filled,
        },
      });
    });

    // Notify webhook of expired deposits
    expiredDeposits.forEach((deposit) => {
      this.webhookWriteFn?.({
        type: WebhookTypes.DepositStatus,
        event: {
          depositId: deposit.depositId,
          originChainId: deposit.originChainId,
          depositTxHash: deposit.depositTxHash,
          status: entities.RelayStatus.Expired,
        },
      });
    });
  }
}

export const assignDepositEventsToRelayHashInfo = async (
  events: entities.V3FundsDeposited[],
  db: DataSource,
): Promise<{
  insertResults: InsertResult[];
  updateResults: UpdateResult[];
}> => {
  const insertResults: InsertResult[] = [];
  const updateResults: UpdateResult[] = [];
  await Promise.all(
    events.map(async (event) => {
      // Format from event to relayHashInfo row
      const item = {
        relayHash: event.relayHash,
        internalHash: event.internalHash,
        depositId: event.depositId,
        originChainId: event.originChainId,
        destinationChainId: event.destinationChainId,
        fillDeadline: event.fillDeadline,
        depositEventId: event.id,
        depositTxHash: event.transactionHash,
        includedActions: !utils.isMessageEmpty(event.message),
      };

      // Start a transaction
      await db.transaction(async (transactionalEntityManager) => {
        const relayHashInfoRepository =
          transactionalEntityManager.getRepository(entities.RelayHashInfo);

        const lockKey = getDbLockKeyForDeposit(event);
        // Acquire a lock to prevent concurrent modifications on the same relayHash.
        // The lock is automatically released when the transaction commits or rolls back.
        await transactionalEntityManager.query(
          `SELECT pg_advisory_xact_lock($2, $1)`,
          lockKey,
        );

        // Retrieve an existing entry that either:
        // - Matches the relayHash and has no associated depositEventId.
        // - Matches both relayHash and depositEventId.
        const existingRow = await relayHashInfoRepository
          .createQueryBuilder()
          .where('"internalHash" = :itemInternalHash', {
            itemInternalHash: item.internalHash,
          })
          .andWhere(
            '"depositEventId" IS NULL OR "depositEventId" = :itemEventId',
            { itemEventId: item.depositEventId },
          )
          .getOne();

        // Insert a new record if no matching entry is found.
        if (!existingRow) {
          const insertedRow = await relayHashInfoRepository.insert(item);
          insertResults.push(insertedRow);
        } else {
          // Update the existing row if a match is found.
          const updatedRow = await relayHashInfoRepository.update(
            { id: existingRow.id, internalHash: item.internalHash },
            item,
          );
          updateResults.push(updatedRow);
        }
      });
    }),
  );

  return {
    insertResults,
    updateResults,
  };
};

export const assignSwapEventToRelayHashInfo = async (
  depositSwapPair: DepositSwapPair[],
  db: DataSource,
): Promise<void> => {
  const relayHashInfoRepository = db.getRepository(entities.RelayHashInfo);
  await Promise.all(
    depositSwapPair.map((depositSwapPair) =>
      relayHashInfoRepository.update(
        { depositEventId: depositSwapPair.deposit.id },
        {
          swapBeforeBridgeEventId: depositSwapPair.swapBeforeBridge.id,
        },
      ),
    ),
  );
};

export const assignFillEventsToRelayHashInfo = async (
  events: entities.FilledV3Relay[],
  db: DataSource,
  fillsGasFee?: Record<string, bigint | undefined>,
): Promise<{
  insertResults: InsertResult[];
  updateResults: UpdateResult[];
}> => {
  const insertResults: InsertResult[] = [];
  const updateResults: UpdateResult[] = [];
  await Promise.all(
    events.map(async (event) => {
      // Format from event to relayHashInfo row
      const fillGasFee = fillsGasFee?.[event.transactionHash];
      if (fillsGasFee && !fillGasFee) {
        throw new Error(
          `Fill gas fee not found for fill event ${event.id} and transaction hash ${event.transactionHash}`,
        );
      }
      const item: Partial<entities.RelayHashInfo> = {
        internalHash: event.internalHash,
        depositId: event.depositId,
        originChainId: event.originChainId,
        destinationChainId: event.destinationChainId,
        fillDeadline: event.fillDeadline,
        fillEventId: event.id,
        status: entities.RelayStatus.Filled, // Mark the status as filled.
        fillTxHash: event.transactionHash,
        fillGasFee: fillGasFee?.toString(),
        includedActions: !utils.isFillOrSlowFillRequestMessageEmpty(
          event.updatedMessage,
        ),
      };

      // Start a transaction

      await db.transaction(async (transactionalEntityManager) => {
        const relayHashInfoRepository =
          transactionalEntityManager.getRepository(entities.RelayHashInfo);
        const lockKey = getDbLockKeyForDeposit(event);
        // Acquire a lock to prevent concurrent modifications on the same relayHash.
        // The lock is automatically released when the transaction commits or rolls back.
        await transactionalEntityManager.query(
          `SELECT pg_advisory_xact_lock($2, $1)`,
          lockKey,
        );
        // Retrieve an existing entry based on the relayHash.
        // If multiple rows exist, prioritize updating the one from the first deposit event indexed.
        const existingRow = await relayHashInfoRepository
          .createQueryBuilder()
          .where(`"internalHash" = :itemInternalHash`, {
            itemInternalHash: item.internalHash,
          })
          .orderBy('"depositEventId"', "ASC")
          .getOne();

        // Insert a new record if no matching entry is found.
        if (!existingRow) {
          const insertedRow = await relayHashInfoRepository.insert(item);
          insertResults.push(insertedRow);
        } else {
          // Update the existing row if a match is found.
          const updatedRow = await relayHashInfoRepository.update(
            { id: existingRow.id, internalHash: item.internalHash },
            item,
          );
          updateResults.push(updatedRow);
        }
      });
    }),
  );

  return { insertResults, updateResults };
};

export const assignSlowFillRequestedEventsToRelayHashInfo = async (
  events: entities.RequestedV3SlowFill[],
  db: DataSource,
): Promise<{
  insertResults: InsertResult[];
  updateResults: UpdateResult[];
}> => {
  const insertResults: InsertResult[] = [];
  const updateResults: UpdateResult[] = [];
  await Promise.all(
    events.map(async (event) => {
      // Format from event to relayHashInfo row
      const item = {
        internalHash: event.internalHash,
        depositId: event.depositId,
        originChainId: event.originChainId,
        destinationChainId: event.destinationChainId,
        fillDeadline: event.fillDeadline,
        slowFillRequestEventId: event.id,
        includedActions: !utils.isFillOrSlowFillRequestMessageEmpty(
          event.message,
        ),
      };

      // Start a transaction
      await db.transaction(async (transactionalEntityManager) => {
        const relayHashInfoRepository =
          transactionalEntityManager.getRepository(entities.RelayHashInfo);
        const lockKey = getDbLockKeyForDeposit(event);
        // Acquire a lock to prevent concurrent modifications on the same relayHash.
        // The lock is automatically released when the transaction commits or rolls back.
        await transactionalEntityManager.query(
          `SELECT pg_advisory_xact_lock($2, $1)`,
          lockKey,
        );

        // Retrieve an existing entry based on the relayHash.
        // If multiple rows exist, prioritize updating the one from the first deposit event indexed.
        const existingRow = await relayHashInfoRepository
          .createQueryBuilder()
          .where(`"internalHash" = :itemInternalHash`, {
            itemInternalHash: item.internalHash,
          })
          .orderBy('"depositEventId"', "ASC")
          .getOne();

        // Insert a new record if no matching entry is found.
        if (!existingRow) {
          const insertedRow = await relayHashInfoRepository.insert({
            ...item,
            status: entities.RelayStatus.SlowFillRequested,
          });
          insertResults.push(insertedRow);
        } else {
          // Update the existing row if a match is found.
          const updatedRow = await relayHashInfoRepository.update(
            { id: existingRow.id, internalHash: item.internalHash },
            {
              ...item,
              // Update status to SlowFillRequested only if it is not already marked as Filled.
              ...(existingRow.status !== entities.RelayStatus.Filled && {
                status: entities.RelayStatus.SlowFillRequested,
              }),
            },
          );
          updateResults.push(updatedRow);
        }
      });
    }),
  );

  return { insertResults, updateResults };
};

export const assignCallsFailedEventToRelayHashInfo = async (
  fillCallsFailedPairs: FillCallsFailedPair[],
  db: DataSource,
) => {
  const relayHashInfoRepository = db.getRepository(entities.RelayHashInfo);
  await Promise.all(
    fillCallsFailedPairs.map((fillCallsFailedPair) =>
      relayHashInfoRepository.update(
        { fillEventId: fillCallsFailedPair.fill.id },
        {
          callsFailedEventId: fillCallsFailedPair.callsFailed.id,
        },
      ),
    ),
  );
};

export const assignSwapMetadataEventToRelayHashInfo = async (
  fillSwapMetadataPairs: FillSwapMetadataPair[],
  db: DataSource,
) => {
  const swapMetadataRepository = db.getRepository(entities.SwapMetadata);
  const relayHashInfoRepository = db.getRepository(entities.RelayHashInfo);

  // Get relay hash info IDs for each fill
  const fillToRelayHashInfoId = await Promise.all(
    fillSwapMetadataPairs.map(async (pair) => {
      const relayHashInfo = await relayHashInfoRepository.findOne({
        where: { fillEventId: pair.fill.id },
      });
      return {
        swapMetadataId: pair.swapMetadata.id,
        relayHashInfoId: relayHashInfo?.id,
      };
    }),
  );

  // Update swap metadata records with relay hash info IDs
  await Promise.all(
    fillToRelayHashInfoId
      .filter((item) => item.relayHashInfoId !== undefined)
      .map((item) =>
        swapMetadataRepository.update(
          { id: item.swapMetadataId },
          { relayHashInfoId: item.relayHashInfoId },
        ),
      ),
  );
};

export const assignTargetChainActionEventToRelayHashInfo = async (
  fillTargetChainActionPairs: FillTargetChainActionPair[],
  db: DataSource,
) => {
  const relayHashInfoRepository = db.getRepository(entities.RelayHashInfo);
  await Promise.all(
    fillTargetChainActionPairs.map((fillTargetChainActionPair) =>
      relayHashInfoRepository.update(
        { fillEventId: fillTargetChainActionPair.fill.id },
        {
          actionsTargetChainId: fillTargetChainActionPair.actionsTargetChainId,
        },
      ),
    ),
  );
};
