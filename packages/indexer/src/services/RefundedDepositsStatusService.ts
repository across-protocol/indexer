import winston from "winston";

import { DataSource, entities } from "@repo/indexer-database";

import { getDbLockKeyForDeposit } from "../utils";

export class RefundedDepositsStatusService {
  public constructor(
    private readonly logger: winston.Logger,
    private readonly postgres: DataSource,
  ) {}

  /**
   * Calls the database to find relays with related refunds in the bundle events table.
   * When a matching refund is found, updates the relay status to refunded
   * @returns An array with the updated relays
   */
  public async updateRelayStatusForRefundedDeposits(
    chainId: number,
  ): Promise<entities.RelayHashInfo[]> {
    this.logger.debug({
      at: "Indexer#BundleIncludedEventsService#updateRefundedDepositsStatus",
      message: `Updating status for refunded deposits for chain ${chainId}`,
    });
    const bundleEventsRepository = this.postgres.getRepository(
      entities.BundleEvent,
    );
    const refundEventsQb = bundleEventsRepository
      .createQueryBuilder("be")
      .innerJoinAndSelect("be.bundle", "bundle")
      .innerJoinAndMapOne(
        "be.deposit",
        entities.V3FundsDeposited,
        "dep",
        // there can be multiple deposits with the same relay hash,
        // but we only want to update the status for the exact event that was included in the bundle
        "be.relayHash = dep.internalHash AND be.eventChainId = dep.originChainId AND be.eventBlockNumber = dep.blockNumber AND be.eventLogIndex = dep.logIndex",
      )
      .innerJoin(entities.RelayHashInfo, "rhi", "dep.id = rhi.depositEventId")
      .where("be.type = :expiredDeposit", {
        expiredDeposit: entities.BundleEventType.ExpiredDeposit,
      })
      .andWhere("dep.originChainId = :chainId", { chainId })
      .andWhere("rhi.status = :status", {
        status: entities.RelayStatus.Expired,
      })
      .orderBy("be.bundleId", "DESC")
      .limit(100);

    const refundEvents =
      (await refundEventsQb.getMany()) as (entities.BundleEvent & {
        deposit: entities.V3FundsDeposited;
      })[];

    if (refundEvents.length > 0) {
      this.logger.debug({
        at: "Indexer#BundleIncludedEventsService#updateRefundedDepositsStatus",
        message: `Found ${refundEvents.length} ${entities.BundleEventType.ExpiredDeposit} bundle events on chain ${chainId}`,
      });
    }

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
        .andWhere("rrb.chainId = :chainId", { chainId })
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
        .andWhere("err.chainId = :chainId", { chainId })
        .getOne();
      if (!executedRelayerRefundRootEvent) continue;

      // If we found the execution of the relayer refund root, we can update the relay status
      await this.postgres.transaction(async (transactionalEntityManager) => {
        const relayHashInfoRepo = transactionalEntityManager.getRepository(
          entities.RelayHashInfo,
        );
        const lockKey = getDbLockKeyForDeposit(refundEvent.deposit);
        // Acquire a lock to prevent concurrent modifications on the same relayHash.
        // The lock is automatically released when the transaction commits or rolls back.
        await transactionalEntityManager.query(
          `SELECT pg_advisory_xact_lock($2, $1)`,
          lockKey,
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
          if (rowToUpdate.status === entities.RelayStatus.Filled) {
            this.logger.warn({
              at: "SpokePoolProcessor#updateRefundedDepositsStatus",
              message: `Found a filled relay with id ${rowToUpdate.id} that is being unexpectedly refunded.`,
            });
          }
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
            .returning(["id"])
            .execute();
          updatedRows.push(updatedRow.raw[0]);
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
}
