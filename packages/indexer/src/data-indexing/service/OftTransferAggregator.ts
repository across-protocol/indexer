import {
  DataSource,
  entities,
  InsertResult,
  UpdateResult,
} from "@repo/indexer-database";
import { getDbLockKeyForOftEvent } from "../../utils/spokePoolUtils";
import {
  getChainIdForEndpointId,
  getCorrespondingTokenAddress,
  getOftChainConfiguration,
} from "../adapter/oft/service";

/**
 * OftTransferAggregator is responsible for aggregating OFT events into OFT transfers.
 * It handles the lifecycle of OFT transfers in the database by:
 * - Processing deleted OFT events (sent and received) and updating/deleting related OFT transfers
 * - Assigning new OFT events (sent and received) to OFT transfers (insert or update)
 *
 * This class is designed to be easily testable in isolation from the main indexer logic.
 */
export class OftTransferAggregator {
  constructor(private readonly postgres: DataSource) {}

  /**
   * Main entry point for processing database events.
   * Processes deleted events first, then assigns new events to OFT transfers.
   */
  public async processDatabaseEvents(
    deletedOftSentEvents: entities.OFTSent[],
    deletedOftReceivedEvents: entities.OFTReceived[],
    oftSentEvents: entities.OFTSent[],
    oftReceivedEvents: entities.OFTReceived[],
    chainId: number,
  ): Promise<void> {
    await this.processDeletedEvents(
      deletedOftSentEvents,
      deletedOftReceivedEvents,
    );
    await this.assignOftEventsToOftTransfer(
      oftSentEvents,
      oftReceivedEvents,
      chainId,
    );
  }

  /**
   * Processes deleted OFT events and updates or deletes related OFT transfers.
   */
  private async processDeletedEvents(
    deletedOftSentEvents: entities.OFTSent[],
    deletedOftReceivedEvents: entities.OFTReceived[],
  ): Promise<void> {
    await Promise.all([
      this.processDeletedOftSentEvents(deletedOftSentEvents),
      this.processDeletedOftReceivedEvents(deletedOftReceivedEvents),
    ]);
  }

  /**
   * Processes deleted OFTSent events.
   * If the related OFT transfer has no OFTReceived event, it deletes the transfer.
   * Otherwise, it updates the transfer to remove the OFTSent event reference.
   */
  private async processDeletedOftSentEvents(
    deletedOftSentEvents: entities.OFTSent[],
  ): Promise<void> {
    for (const oftSentEvent of deletedOftSentEvents) {
      await this.postgres.transaction(async (tem) => {
        const oftTransferRepository = tem.getRepository(entities.OftTransfer);
        const lockKey = getDbLockKeyForOftEvent(oftSentEvent);
        await tem.query(`SELECT pg_advisory_xact_lock($1)`, lockKey);
        const relatedOftTransfer = await oftTransferRepository.findOne({
          where: { oftSentEventId: oftSentEvent.id },
        });

        if (!relatedOftTransfer) return;

        if (!relatedOftTransfer.oftReceivedEventId) {
          // There is no related OFTReceivedEvent, so we can delete the OFTTransfer row
          await oftTransferRepository.delete({ id: relatedOftTransfer.id });
        } else {
          // There is a related OFTReceivedEvent, so we must update the OFTTransfer row
          await oftTransferRepository.update(
            { id: relatedOftTransfer.id },
            {
              // forced casting because the migration run command returns a weird error
              // for string | null types: "DataTypeNotSupportedError: Data type "Object"
              // in <column_here> is not supported by "postgres" database.
              oftSentEventId: null as any,
              originGasFee: null as any,
              originGasFeeUsd: null as any,
              originGasTokenPriceUsd: null as any,
              originTxnRef: null as any,
            },
          );
        }
      });
    }
  }

  /**
   * Processes deleted OFTReceived events.
   * If the related OFT transfer has no OFTSent event, it deletes the transfer.
   * Otherwise, it updates the transfer to remove the OFTReceived event reference.
   */
  private async processDeletedOftReceivedEvents(
    deletedOftReceivedEvents: entities.OFTReceived[],
  ): Promise<void> {
    for (const oftReceivedEvent of deletedOftReceivedEvents) {
      await this.postgres.transaction(async (tem) => {
        const oftTransferRepository = tem.getRepository(entities.OftTransfer);
        const lockKey = getDbLockKeyForOftEvent(oftReceivedEvent);
        await tem.query(`SELECT pg_advisory_xact_lock($1)`, lockKey);
        const relatedOftTransfer = await oftTransferRepository.findOne({
          where: { oftReceivedEventId: oftReceivedEvent.id },
        });

        if (!relatedOftTransfer) return;

        if (!relatedOftTransfer.oftSentEventId) {
          // There is no related OFTSentEvent, so we can delete the OFTTransfer row
          await oftTransferRepository.delete({ id: relatedOftTransfer.id });
        } else {
          // There is a related OFTSentEvent, so we must update the OFTTransfer row
          await oftTransferRepository.update(
            { id: relatedOftTransfer.id },
            {
              // forced casting because the migration run command returns a weird error
              // for string | null types: "DataTypeNotSupportedError: Data type "Object"
              // in <column_here> is not supported by "postgres" database.
              oftReceivedEventId: null as any,
              destinationTxnRef: null as any,
              status: entities.RelayStatus.Unfilled,
            },
          );
        }
      });
    }
  }

  /**
   * Assigns OFT events to OFT transfers (insert or update).
   */
  private async assignOftEventsToOftTransfer(
    oftSentEvents: entities.OFTSent[],
    oftReceivedEvents: entities.OFTReceived[],
    chainId: number,
  ): Promise<void> {
    await Promise.all([
      this.assignOftSentEventsToOftTransfer(oftSentEvents, chainId),
      this.assignOftReceivedEventsToOftTransfer(oftReceivedEvents, chainId),
    ]);
  }

  /**
   * Assigns OFTSent events to OFT transfers.
   * If no transfer exists with the given GUID, it creates a new one.
   * If a transfer exists but with a different OFTSent event, it updates it.
   */
  private async assignOftSentEventsToOftTransfer(
    oftSentEvents: entities.OFTSent[],
    chainId: number,
  ): Promise<void> {
    const insertResults: InsertResult[] = [];
    const updateResults: UpdateResult[] = [];

    await Promise.all(
      oftSentEvents.map(async (oftSentEvent) => {
        // start a transaction
        await this.postgres.transaction(async (tem) => {
          const oftTransferRepository = tem.getRepository(entities.OftTransfer);
          const lockKey = getDbLockKeyForOftEvent(oftSentEvent);
          // Acquire a lock to prevent concurrent modifications on the same guid.
          // The lock is automatically released when the transaction commits or rolls back.
          await tem.query(`SELECT pg_advisory_xact_lock($1)`, lockKey);
          const existingRow = await oftTransferRepository
            .createQueryBuilder()
            .where('"guid" = :guid', { guid: oftSentEvent.guid })
            .getOne();
          if (!existingRow) {
            const insertedRow = await oftTransferRepository.insert({
              ...this.formatOftSentEventToOftTransfer(oftSentEvent, chainId),
            });
            insertResults.push(insertedRow);
          } else if (
            existingRow &&
            existingRow.oftSentEventId !== oftSentEvent.id
          ) {
            // If oftSentEventId is undefined or has a different value because of a bug
            // in the logic for handling deleted events, we need to update the OftTransfer row.
            const updatedRow = await oftTransferRepository.update(
              { id: existingRow.id },
              this.formatOftSentEventToOftTransfer(oftSentEvent, chainId),
            );
            updateResults.push(updatedRow);
          }
        });
      }),
    );
  }

  /**
   * Assigns OFTReceived events to OFT transfers.
   * If no transfer exists with the given GUID, it creates a new one.
   * If a transfer exists but with a different OFTReceived event, it updates it.
   */
  private async assignOftReceivedEventsToOftTransfer(
    oftReceivedEvents: entities.OFTReceived[],
    chainId: number,
  ): Promise<void> {
    await Promise.all(
      oftReceivedEvents.map(async (oftReceivedEvent) => {
        await this.postgres.transaction(async (tem) => {
          const oftTransferRepository = tem.getRepository(entities.OftTransfer);
          const lockKey = getDbLockKeyForOftEvent(oftReceivedEvent);
          await tem.query(`SELECT pg_advisory_xact_lock($1)`, lockKey);
          const existingRow = await oftTransferRepository
            .createQueryBuilder()
            .where('"guid" = :guid', { guid: oftReceivedEvent.guid })
            .getOne();
          if (!existingRow) {
            await oftTransferRepository.insert({
              ...this.formatOftReceivedEventToOftTransfer(
                oftReceivedEvent,
                chainId,
              ),
            });
          } else if (
            existingRow &&
            existingRow.oftReceivedEventId !== oftReceivedEvent.id
          ) {
            await oftTransferRepository.update(
              { id: existingRow.id },
              this.formatOftReceivedEventToOftTransfer(
                oftReceivedEvent,
                chainId,
              ),
            );
          }
        });
      }),
    );
  }

  /**
   * Formats an OFTSent event into a partial OFT transfer entity.
   */
  private formatOftSentEventToOftTransfer(
    oftSentEvent: entities.OFTSent,
    chainId: number,
  ): Partial<entities.OftTransfer> {
    const destinationChainId = getChainIdForEndpointId(oftSentEvent.dstEid);
    return {
      bridgeFeeUsd: "0",
      destinationChainId: destinationChainId.toString(),
      destinationTokenAddress: getCorrespondingTokenAddress(
        chainId,
        getOftChainConfiguration(chainId).tokens[0]!.address,
        destinationChainId,
      ),
      destinationTokenAmount: oftSentEvent.amountReceivedLD,
      guid: oftSentEvent.guid,
      oftSentEventId: oftSentEvent.id,
      originChainId: chainId.toString(),
      originGasFee: "0", // TODO
      originGasFeeUsd: "0", // TODO
      originGasTokenPriceUsd: "0", // TODO
      originTokenAddress: oftSentEvent.token,
      originTokenAmount: oftSentEvent.amountSentLD,
      originTxnRef: oftSentEvent.transactionHash,
    };
  }

  /**
   * Formats an OFTReceived event into a partial OFT transfer entity.
   */
  private formatOftReceivedEventToOftTransfer(
    oftReceivedEvent: entities.OFTReceived,
    chainId: number,
  ): Partial<entities.OftTransfer> {
    const originChainId = getChainIdForEndpointId(oftReceivedEvent.srcEid);
    return {
      bridgeFeeUsd: "0",
      destinationChainId: chainId.toString(),
      destinationTokenAddress:
        getOftChainConfiguration(chainId).tokens[0]!.address,
      destinationTokenAmount: oftReceivedEvent.amountReceivedLD,
      destinationTxnRef: oftReceivedEvent.transactionHash,
      guid: oftReceivedEvent.guid,
      oftReceivedEventId: oftReceivedEvent.id,
      originChainId: originChainId.toString(),
      originTokenAddress: getCorrespondingTokenAddress(
        chainId,
        oftReceivedEvent.token,
        originChainId,
      ),
      originTokenAmount: oftReceivedEvent.amountReceivedLD,
      status: entities.RelayStatus.Filled,
    };
  }
}
