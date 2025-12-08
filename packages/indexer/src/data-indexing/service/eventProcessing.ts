import { SaveQueryResult } from "@repo/indexer-database";
import * as across from "@across-protocol/sdk";
import { utils } from "@repo/indexer-database";
import { ObjectLiteral } from "typeorm";
import { providers } from "ethers";

/**
 * Formats and saves a batch of blockchain events to the database using a provided formatting function.
 * This generic function is designed to handle different types of events by accepting a specific formatting function for each event type.
 * It maps the raw event data to the database entity format, marks them as finalized if they are within the finalized block range,
 * and then saves them to the database in batches.
 *
 * @param repository The repository for database operations, specifically for saving blockchain events.
 * @param events An array of events to be processed.
 * @param lastFinalisedBlock The last block number that is considered finalized.
 * @param chainId The ID of the chain where these events were emitted.
 * @param blockDates A record mapping block numbers to their corresponding `Date` objects.
 * @param formatEvent A function that takes an event and returns a partial entity.
 * @param entity The entity to save the events to.
 * @param primaryKeyColumns The primary key columns of the entity.
 * @param chunkSize The number of events to save in a single batch. Defaults to 100.
 * @returns A promise that resolves to an array of `SaveQueryResult` for the saved events.
 */
export async function formatAndSaveEvents<T, TEntity extends ObjectLiteral>(
  repository: utils.BlockchainEventRepository,
  events: T[],
  lastFinalisedBlock: number,
  chainId: number,
  blockDates: Record<number, Date>,
  formatEvent: (
    event: T,
    finalised: boolean,
    blockTimestamp: Date,
    chainId: number,
  ) => Partial<TEntity>,
  entity: new () => TEntity,
  primaryKeyColumns: (keyof TEntity)[],
  chunkSize = 100,
): Promise<SaveQueryResult<TEntity>[]> {
  const formattedEvents = events.map((event: any) => {
    const finalised = event.blockNumber <= lastFinalisedBlock;
    const blockTimestamp = blockDates[event.blockNumber]!;
    return formatEvent(event, finalised, blockTimestamp, chainId);
  });

  const chunkedEvents: Partial<TEntity>[][] = across.utils.chunk(formattedEvents, chunkSize);
  const savedEvents = await Promise.all(
    chunkedEvents.map((eventsChunk) =>
      repository.saveAndHandleFinalisationBatch<TEntity>(
        entity,
        eventsChunk,
        primaryKeyColumns as string[],
        [],
      ),
    ),
  );
  const result = savedEvents.flat();
  return result;
}

/**
 * Decodes and extracts events from a collection of transaction receipts using a provided decoding function.
 * This generic function iterates over transaction receipts, decodes logs, and filters for events
 * emitted by a specified contract address.
 *
 * @param transactionReceipts A record of transaction receipts, indexed by their transaction hash.
 * @param contractAddress The address of the contract to filter events from.
 * @param decodeEvents A function that takes a transaction receipt and contract address and returns an array of decoded events.
 * @returns An array of decoded event objects.
 */
export function getEventsFromTransactionReceipts<T>(
  transactionReceipts: Record<string, providers.TransactionReceipt>,
  contractAddress: string,
  decodeEvents: (
    receipt: providers.TransactionReceipt,
    contractAddress?: string,
  ) => T[],
): T[] {
  const events: T[] = [];
  for (const txHash of Object.keys(transactionReceipts)) {
    const transactionReceipt = transactionReceipts[
      txHash
    ] as providers.TransactionReceipt;
    const decodedEvents: T[] = decodeEvents(
      transactionReceipt,
      contractAddress,
    );
    if (decodedEvents.length > 0) {
      events.push(...decodedEvents);
    }
  }
  return events;
}
