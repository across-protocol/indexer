import winston from "winston";

import {
  DataSource,
  entities,
  utils as dbUtils,
  InsertResult,
  UpdateResult,
  SaveQueryResultType,
  Not,
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
  constructor(
    private readonly postgres: DataSource,
    private readonly logger: winston.Logger,
    private readonly chainId: number,
    private readonly webhookWriteFn?: eventProcessorManager.WebhookWriteFn,
  ) {}

  public async process(
    events: StoreEventsResult,
    deletedDeposits: entities.V3FundsDeposited[],
  ) {
    // Update relay hash info records related to deleted deposits
    await this.processDeletedDeposits(deletedDeposits);

    const newDeposits = dbUtils.filterSaveQueryResults(
      events.deposits,
      SaveQueryResultType.Inserted,
    );

    const newFills = dbUtils.filterSaveQueryResults(
      events.fills,
      SaveQueryResultType.Inserted,
    );
    const updatedFills = dbUtils.filterSaveQueryResults(
      events.fills,
      SaveQueryResultType.Updated,
    );

    const newSlowFillRequests = dbUtils.filterSaveQueryResults(
      events.slowFillRequests,
      SaveQueryResultType.Inserted,
    );
    const updatedSlowFillRequests = dbUtils.filterSaveQueryResults(
      events.slowFillRequests,
      SaveQueryResultType.Updated,
    );

    // Assign events to relay hash info
    const timeToAssignSpokeEventsToRelayHashInfoStart = performance.now();
    await this.assignSpokeEventsToRelayHashInfo({
      deposits: newDeposits,
      fills: [...newFills, ...updatedFills],
      slowFillRequests: [...newSlowFillRequests, ...updatedSlowFillRequests],
    });
    const timeToAssignSpokeEventsToRelayHashInfoEnd = performance.now();

    // Update expired deposits
    const timeToUpdateExpiredRelaysStart = performance.now();
    const expiredDeposits = await this.updateExpiredRelays();
    const timeToUpdateExpiredRelaysEnd = performance.now();

    // Update refunded deposits
    const timeToUpdateRefundedDepositsStart = performance.now();
    const refundedDeposits = await this.updateRefundedDepositsStatus();
    const timeToUpdateRefundedDepositsEnd = performance.now();

    // Send webhook notifications
    // Notify webhook of new deposits
    newDeposits.forEach((deposit) => {
      this.webhookWriteFn?.({
        type: WebhookTypes.DepositStatus,
        event: {
          depositId: deposit.depositId,
          originChainId: deposit.originChainId,
          depositTxHash: deposit.transactionHash,
          status: RelayStatus.Unfilled,
        },
      });
    });

    // Notify webhook of new slow fill requests
    newSlowFillRequests.forEach((deposit) => {
      this.webhookWriteFn?.({
        type: WebhookTypes.DepositStatus,
        event: {
          depositId: deposit.depositId,
          originChainId: deposit.originChainId,
          depositTxHash: deposit.transactionHash,
          status: RelayStatus.SlowFillRequested,
        },
      });
    });

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

    this.logger.debug({
      at: "Indexer#SpokePoolProcessor#process",
      message: "System Time Log for SpokePoolProcessor#process",
      spokeChainId: this.chainId,
      timeToAssignSpokeEventsToRelayHashInfo:
        timeToAssignSpokeEventsToRelayHashInfoEnd -
        timeToAssignSpokeEventsToRelayHashInfoStart,
      timeToUpdateExpiredRelays:
        timeToUpdateExpiredRelaysEnd - timeToUpdateExpiredRelaysStart,
      timeToUpdateRefundedDeposits:
        timeToUpdateRefundedDepositsEnd - timeToUpdateRefundedDepositsStart,
      totalTime:
        timeToUpdateRefundedDepositsEnd -
        timeToAssignSpokeEventsToRelayHashInfoStart,
    });
  }

  /**
   * Updates relayHashInfo table to include recently stored events
   * @param events An object with stored deposits, fills and slow fill requests
   * @returns A void promise
   */
  private async assignSpokeEventsToRelayHashInfo(events: {
    deposits: entities.V3FundsDeposited[];
    fills: entities.FilledV3Relay[];
    slowFillRequests: entities.RequestedV3SlowFill[];
  }): Promise<void> {
    await Promise.all([
      this.assignDepositEventsToRelayHashInfo(events.deposits),
      this.assignFillEventsToRelayHashInfo(events.fills),
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
        };

        // Start a transaction
        await this.postgres.transaction(async (transactionalEntityManager) => {
          const relayHashInfoRepository =
            transactionalEntityManager.getRepository(entities.RelayHashInfo);

          // Convert relayHash into a 32-bit integer for database lock usage
          const lockKey = this.relayHashToInt32(item.internalHash as string);
          // Acquire a lock to prevent concurrent modifications on the same relayHash.
          // The lock is automatically released when the transaction commits or rolls back.
          await transactionalEntityManager.query(
            `SELECT pg_advisory_xact_lock($2, $1)`,
            [item.originChainId, lockKey],
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

    this.logRelayHashInfoAssignmentResult(
      SpokePoolEvents.V3FundsDeposited,
      insertResults,
      updateResults,
    );
  }

  /**
   * Updates relayHashInfo table to include recently stored fills
   * @param events An array of already stored fills
   * @returns A void promise
   */
  private async assignFillEventsToRelayHashInfo(
    events: entities.FilledV3Relay[],
  ): Promise<void> {
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
          fillEventId: event.id,
          status: RelayStatus.Filled, // Mark the status as filled.
          fillTxHash: event.transactionHash,
        };

        // Start a transaction

        await this.postgres.transaction(async (transactionalEntityManager) => {
          const relayHashInfoRepository =
            transactionalEntityManager.getRepository(entities.RelayHashInfo);

          // Convert relayHash into a 32-bit integer for database lock usage
          const lockKey = this.relayHashToInt32(item.internalHash as string);
          // Acquire a lock to prevent concurrent modifications on the same relayHash.
          // The lock is automatically released when the transaction commits or rolls back.
          await transactionalEntityManager.query(
            `SELECT pg_advisory_xact_lock($2, $1)`,
            [item.originChainId, lockKey],
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

    this.logRelayHashInfoAssignmentResult(
      SpokePoolEvents.FilledV3Relay,
      insertResults,
      updateResults,
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
        };

        // Start a transaction
        await this.postgres.transaction(async (transactionalEntityManager) => {
          const relayHashInfoRepository =
            transactionalEntityManager.getRepository(entities.RelayHashInfo);

          // Convert relayHash into a 32-bit integer for database lock usage
          const lockKey = this.relayHashToInt32(item.internalHash as string);
          // Acquire a lock to prevent concurrent modifications on the same relayHash.
          // The lock is automatically released when the transaction commits or rolls back.
          await transactionalEntityManager.query(
            `SELECT pg_advisory_xact_lock($2, $1)`,
            [item.originChainId, lockKey],
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
              status: RelayStatus.SlowFillRequested,
            });
            insertResults.push(insertedRow);
          } else {
            // Update the existing row if a match is found.
            const updatedRow = await relayHashInfoRepository.update(
              { id: existingRow.id, internalHash: item.internalHash },
              {
                ...item,
                // Update status to SlowFillRequested only if it is not already marked as Filled.
                ...(existingRow.status !== RelayStatus.Filled && {
                  status: RelayStatus.SlowFillRequested,
                }),
              },
            );
            updateResults.push(updatedRow);
          }
        });
      }),
    );

    this.logRelayHashInfoAssignmentResult(
      SpokePoolEvents.RequestedV3SlowFill,
      insertResults,
      updateResults,
    );
  }

  private logRelayHashInfoAssignmentResult(
    eventType: SpokePoolEvents,
    insertResults: InsertResult[],
    updateResults: UpdateResult[],
  ) {
    this.logger.debug({
      at: "Indexer#SpokePoolProcessor#assignSpokeEventsToRelayHashInfo",
      message: `${eventType} events associated with RelayHashInfo`,
      insertedRows: insertResults.reduce(
        (acc, res) => acc + res.generatedMaps.length,
        0,
      ),
      updatedRows: updateResults.reduce((acc, res) => acc + res.affected!, 0),
    });
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
  private async processDeletedDeposits(
    deletedDeposits: entities.V3FundsDeposited[],
  ) {
    for (const deposit of deletedDeposits) {
      await this.postgres.transaction(async (transactionalEntityManager) => {
        const relayHashInfoRepository =
          transactionalEntityManager.getRepository(entities.RelayHashInfo);

        this.logger.debug({
          at: "spokePoolProcessor#processDeletedDeposits",
          message: `Processing deleted deposit event with id ${deposit.id}`,
        });

        // Convert relayHash into a 32-bit integer for database lock usage
        const lockKey = this.relayHashToInt32(deposit.internalHash!);
        // Acquire a lock to prevent concurrent modifications on the same relayHash.
        // The lock is automatically released when the transaction commits or rolls back.
        await transactionalEntityManager.query(
          `SELECT pg_advisory_xact_lock($2, $1)`,
          [deposit.originChainId, lockKey],
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
            this.logger.debug({
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
                { depositEventId: undefined, depositTxHash: undefined },
              );
              this.logger.debug({
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
              this.logger.debug({
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
    const refundEvents = (await bundleEventsRepository
      .createQueryBuilder("be")
      .innerJoinAndSelect("be.bundle", "bundle")
      .innerJoin(
        entities.RelayHashInfo,
        "rhi",
        "be.relayHash = rhi.internalHash",
      )
      .innerJoinAndMapOne(
        "be.deposit",
        entities.V3FundsDeposited,
        "dep",
        "rhi.depositEventId = dep.id AND be.eventChainId = dep.originChainId AND be.eventBlockNumber = dep.blockNumber AND be.eventLogIndex = dep.logIndex",
      )
      .where("be.type = :expiredDeposit", {
        expiredDeposit: entities.BundleEventType.ExpiredDeposit,
      })
      .andWhere("rhi.status = :expired", {
        expired: entities.RelayStatus.Expired,
      })
      .andWhere("rhi.originChainId = :chainId", { chainId: this.chainId })
      .orderBy("be.bundleId", "DESC")
      .limit(100)
      .getMany()) as (entities.BundleEvent & {
      deposit: entities.V3FundsDeposited;
    })[];

    const updatedRows: entities.RelayHashInfo[] = [];
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
      await this.postgres.transaction(async (transactionalEntityManager) => {
        const relayHashInfoRepo = transactionalEntityManager.getRepository(
          entities.RelayHashInfo,
        );

        // Convert relayHash into a 32-bit integer for database lock usage
        const lockKey = this.relayHashToInt32(
          refundEvent.deposit.internalHash!,
        );
        // Acquire a lock to prevent concurrent modifications on the same relayHash.
        // The lock is automatically released when the transaction commits or rolls back.
        await transactionalEntityManager.query(
          `SELECT pg_advisory_xact_lock($2, $1)`,
          [refundEvent.deposit.originChainId, lockKey],
        );

        const rowToUpdate = await relayHashInfoRepo.findOne({
          where: {
            internalHash: refundEvent.relayHash,
            depositEvent: {
              originChainId: refundEvent.deposit.originChainId,
              blockNumber: refundEvent.deposit.blockNumber,
              logIndex: refundEvent.deposit.logIndex,
            },
          },
        });
        if (rowToUpdate) {
          const updatedRow = await relayHashInfoRepo
            .createQueryBuilder()
            .update()
            .set({
              status: entities.RelayStatus.Refunded,
              depositRefundTxHash:
                executedRelayerRefundRootEvent.transactionHash,
            })
            .where("id = :rowToUpdateId", {
              rowToUpdateId: rowToUpdate.id,
            })
            .returning("*")
            .execute();
          updatedRows.push(updatedRow.raw);
        }
      });
    }
    if (updatedRows.length > 0) {
      this.logger.debug({
        at: "Indexer#SpokePoolProcessor#updateRefundedDepositsStatus",
        message: `Updated ${updatedRows.length} refunded deposits`,
      });
    }
    return updatedRows;
  }

  /**
   * Generates a 32bit integer based on an input string
   */
  private relayHashToInt32(relayHash: string): number {
    let hash = 0;
    let chr;

    // If the input string is empty, return 0
    if (relayHash.length === 0) return hash;

    // Loop through each character in the string
    for (let i = 0; i < relayHash.length; i++) {
      // Get the Unicode value of the character
      chr = relayHash.charCodeAt(i);

      // Perform bitwise operations to generate a hash
      // This shifts the hash left by 5 bits, subtracts itself, and adds the character code
      hash = (hash << 5) - hash + chr;

      // Convert the result into a 32-bit integer by forcing it into the signed integer range
      hash |= 0;
    }

    // Return the final computed 32-bit integer hash
    return hash;
  }
}
