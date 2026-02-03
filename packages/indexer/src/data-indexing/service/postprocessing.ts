import {
  DataSource,
  EntityTarget,
  FindOptionsWhere,
  ObjectLiteral,
} from "typeorm";
import { entities } from "@repo/indexer-database";
import {
  assignDepositEventsToRelayHashInfo,
  assignSwapEventToRelayHashInfo,
} from "../../services/spokePoolProcessor";
import { IndexerEventPayload } from "./genericEventListening";
import { FUNDS_DEPOSITED_V3_ABI } from "../model/abis";
import { FUNDS_DEPOSITED_V3_EVENT_NAME } from "./constants";
import { transformV3FundsDepositedEvent } from "./transforming";
import { storeV3FundsDepositedEvent } from "./storing";
import { decodeEventsFromReceipt } from "./preprocessing";
import { processEvent } from "./genericEventProcessing";
import { V3FundsDepositedArgs } from "../model/eventTypes";
import { parseAbi } from "viem";
import { Logger } from "winston";
import { getBlockTime } from "../../web3/constants";
import { PostProcessor, Transformer, Storer } from "../model/genericTypes";

/**
 * Post-processes a stored V3FundsDeposited entity by assigning it to relay hash info.
 * @param db - The TypeORM database connection.
 * @param storedItem - The V3FundsDeposited entity that was just stored.
 */
export const postProcessDepositEvent = async (
  db: DataSource,
  storedItem: entities.V3FundsDeposited,
) => {
  await assignDepositEventsToRelayHashInfo([storedItem], db);
};

/**
 * Request object for waitForEntity function.
 * @template T - The entity type extending TypeORM's ObjectLiteral.
 */
type WaitForEntityRequest<T extends ObjectLiteral> = {
  /** The TypeORM database connection */
  db: DataSource;
  /** The entity class to query */
  entityTarget: EntityTarget<T>;
  /** The where clause conditions to search for */
  findOptions: FindOptionsWhere<T>;
  /** Maximum time in milliseconds to wait for the entity */
  waitTimeoutMs: number;
  /** Time in milliseconds between retry attempts (default: 100ms) */
  retryIntervalMs?: number;
};

/**
 * Waits for an entity to be stored in the database within a specified timeout.
 * Polls the database at regular intervals until the entity is found or timeout is reached.
 * @template T - The entity type extending TypeORM's ObjectLiteral.
 * @param request - The request object containing database connection, entity target, and search criteria.
 * @returns The found entity or null if not found within the timeout period.
 */
const waitForEntity = async <T extends ObjectLiteral>(
  request: WaitForEntityRequest<T>,
): Promise<T | null> => {
  const {
    db,
    entityTarget,
    findOptions,
    waitTimeoutMs,
    retryIntervalMs = 100,
  } = request;
  const startTime = Date.now();
  const repository = db.getRepository(entityTarget);

  while (Date.now() - startTime < waitTimeoutMs) {
    const entity = await repository.findOne({
      where: findOptions,
    });

    if (entity) {
      return entity;
    }

    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
  }

  return null;
};

/**
 * Request object for insertEvent function.
 * @template TPreprocessed - The decoded event arguments type.
 * @template TTransformed - The transformed event data type.
 * @template TStored - The stored database entity type.
 */
type InsertEventRequest<
  TPreprocessed,
  TTransformed,
  TStored extends ObjectLiteral,
> = {
  /** The TypeORM database connection */
  db: DataSource;
  /** Logger instance for logging */
  logger: Logger;
  /** The event data with transaction hash and log index */
  event: TPreprocessed & { logIndex: number; transactionHash: string };
  /** The indexer event payload containing transaction and receipt data */
  payload: IndexerEventPayload;
  /** Function to transform event arguments into storable format */
  transform: Transformer<IndexerEventPayload, TPreprocessed, TTransformed>;
  /** Function to store the transformed data */
  store: Storer<DataSource, TTransformed, TStored>;
  /** Optional post-processing function to run after storage */
  postProcess?: PostProcessor<DataSource, IndexerEventPayload, TStored>;
};

/**
 * Inserts an event into the database using the processEvent pipeline.
 * Retrieves the event log from the transaction receipt and processes it through transformation and storage.
 * @template TPreprocessed - The preprocessed event type.
 * @template TTransformed - The transformed event data type.
 * @template TStored - The stored database entity type.
 * @param request - The request object containing all necessary data and functions for insertion.
 * @throws Error if the event log is not found in the transaction receipt.
 */
const insertEvent = async <
  TPreprocessed,
  TTransformed,
  TStored extends ObjectLiteral,
>(
  request: InsertEventRequest<TPreprocessed, TTransformed, TStored>,
): Promise<void> => {
  const { db, logger, payload, event, transform, store, postProcess } = request;

  const eventLog = (await payload.transactionReceipt)?.logs?.find(
    (l: any) => l.logIndex === event.logIndex,
  );
  if (!eventLog) {
    const message = `Event log not found for event ${event.transactionHash} at log index ${event.logIndex}`;
    logger.error({
      message,
      payload,
      event,
    });
    throw new Error(message);
  }

  await processEvent({
    db,
    source: async () => ({ ...payload, log: eventLog }),
    preprocess: async (_) => Promise.resolve(event as TPreprocessed),
    filter: async () => true,
    transform,
    store,
    postProcess,
    logger,
  });
};

/**
 * Request object for waitForOrInsertEvent function.
 * @template TPreprocessed - The preprocessed event type.
 * @template TTransformed - The transformed event data type.
 * @template TStored - The stored database entity type.
 */
type WaitForOrInsertEventRequest<
  TPreprocessed,
  TTransformed,
  TStored extends ObjectLiteral,
> = {
  /** The TypeORM database connection */
  db: DataSource;
  /** Logger instance for logging */
  logger: Logger;
  /** The event data with transaction hash and log index */
  event: TPreprocessed & { logIndex: number; transactionHash: string };
  /** The indexer event payload containing transaction and receipt data */
  payload: IndexerEventPayload;
  /** Maximum time in milliseconds to wait for the event to appear */
  waitTimeoutMs: number;
  /** Time in milliseconds between retry attempts when waiting */
  retryIntervalMs?: number;
  /** The entity class to query and store */
  entityTarget: EntityTarget<TStored>;
  /** Function to transform event arguments into storable format */
  transform: Transformer<IndexerEventPayload, TPreprocessed, TTransformed>;
  /** Function to store the transformed data */
  store: Storer<DataSource, TTransformed, TStored>;
  /** Optional post-processing function to run after storage */
  postProcess?: PostProcessor<DataSource, IndexerEventPayload, TStored>;
};

/**
 * Orchestrates waiting for an existing event in the database or inserting it if missing.
 * First attempts to find the event by polling the database. If not found within the timeout,
 * manually inserts the event using the provided transformation and storage functions.
 * @template TPreprocessed - The preprocessed event type.
 * @template TTransformed - The transformed event data type.
 * @template TStored - The stored database entity type.
 * @param request - The request object containing all necessary data and functions.
 * @returns The found or newly inserted entity, or null if insertion failed.
 */
const waitForOrInsertEvent = async <
  TPreprocessed,
  TTransformed,
  TStored extends ObjectLiteral,
>(
  request: WaitForOrInsertEventRequest<TPreprocessed, TTransformed, TStored>,
): Promise<TStored | null> => {
  const {
    db,
    logger,
    event,
    payload,
    waitTimeoutMs,
    entityTarget,
    transform,
    store,
    postProcess,
  } = request;
  // Default retry to half of block time (converted to ms)
  const retryIntervalMs =
    request.retryIntervalMs ?? (getBlockTime(payload.chainId) * 1000) / 2;

  // Try to find it by waiting
  const existingEvent = await waitForEntity({
    db,
    entityTarget,
    findOptions: {
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
    } as unknown as FindOptionsWhere<TStored>,
    waitTimeoutMs,
    retryIntervalMs,
  });

  if (existingEvent) {
    return existingEvent;
  }

  logger.debug({
    message: "Event not found after waiting, attempting manual insertion",
    payload,
    depositEvent: event,
  });

  // If not found, attempt insertion
  await insertEvent({
    db,
    logger,
    payload,
    event,
    transform,
    store,
    postProcess,
  });

  // Fetch again to return the entity
  return db.getRepository(entityTarget).findOne({
    where: {
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
    } as unknown as FindOptionsWhere<TStored>,
  });
};

/**
 * Request object for postProcessSwapBeforeBridge function.
 */
type PostProcessSwapBeforeBridgeRequest = {
  /** The TypeORM database connection */
  db: DataSource;
  /** The indexer event payload containing transaction and receipt data */
  payload: IndexerEventPayload;
  /** Logger instance for logging */
  logger: Logger;
  /** The stored SwapBeforeBridge entity to post-process */
  storedItem: entities.SwapBeforeBridge;
};

/**
 * Post-processes a stored SwapBeforeBridge entity by finding and linking its corresponding V3FundsDeposited event.
 * This function:
 * 1. Decodes V3FundsDeposited events from the transaction receipt
 * 2. Finds the deposit event that occurs after the swap event
 * 3. Waits for or inserts the deposit event
 * 4. Links both events through RelayHashInfo
 * @param request - The request object containing database connection, payload, logger, and stored swap entity.
 * @throws Error if transaction receipt or transaction is missing, or if RelayHashInfo creation fails.
 */
export const postProcessSwapBeforeBridge = async (
  request: PostProcessSwapBeforeBridgeRequest,
) => {
  const { db, payload, logger, storedItem } = request;
  const viemReceipt = await payload.transactionReceipt;
  const transaction = payload.transaction;

  if (!viemReceipt || !transaction) {
    const message = `Transaction receipt or transaction not found for swap before bridge. Payload: ${JSON.stringify(payload)}`;
    logger.error({
      message,
      txHash: storedItem.transactionHash,
    });
    throw new Error(message);
  }

  const v3FundsDepositedEvents = decodeEventsFromReceipt<V3FundsDepositedArgs>(
    viemReceipt,
    parseAbi(FUNDS_DEPOSITED_V3_ABI),
    FUNDS_DEPOSITED_V3_EVENT_NAME,
  );

  // Find the deposit that appears *after* this swap event in the same transaction
  // SwapBeforeBridge is emitted before V3FundsDeposited
  const depositEvent = v3FundsDepositedEvents
    .filter((d) => d.logIndex > storedItem.logIndex)
    .sort((a, b) => a.logIndex - b.logIndex)[0];

  if (!depositEvent) {
    const message = `No matching deposit found for swap before bridge in transaction receipt`;
    logger.error({
      message,
      payload,
    });
    throw new Error(message);
  }

  const depositEntity = await waitForOrInsertEvent({
    db,
    logger,
    event: {
      ...depositEvent.event,
      logIndex: depositEvent.logIndex,
      transactionHash: transaction.hash,
    },
    payload,
    waitTimeoutMs: getBlockTime(payload.chainId) * 1000 * 10,
    entityTarget: entities.V3FundsDeposited,
    transform: (args: V3FundsDepositedArgs, p: IndexerEventPayload) =>
      transformV3FundsDepositedEvent(args, p, logger),
    store: (event: Partial<entities.V3FundsDeposited>, ds: DataSource) =>
      storeV3FundsDepositedEvent(event, ds, logger),
    postProcess: async (
      db: DataSource,
      _: IndexerEventPayload,
      storedItem: entities.V3FundsDeposited,
    ) => {
      await postProcessDepositEvent(db, storedItem);
    },
  });

  if (!depositEntity) {
    logger.error({
      message: "Failed to find or insert corresponding deposit event for swap",
      transactionHash: transaction.hash,
      depositLogIndex: depositEvent.logIndex,
      payload,
    });
    return;
  }

  // Wait for RelayHashInfo to be created by the deposit's post-processing
  let relayHashInfo = await waitForEntity({
    db,
    entityTarget: entities.RelayHashInfo,
    findOptions: {
      depositTxHash: depositEntity.transactionHash,
    },
    waitTimeoutMs: getBlockTime(payload.chainId) * 1000,
  });

  // If RelayHashInfo doesn't exist after waiting, create it ourselves
  // This can happen if the deposit was created by a different indexer and its post-processing already completed
  if (!relayHashInfo) {
    const message =
      "Failed to create or find relay hash info for deposit event after manual creation";
    logger.error({
      message,
      depositTxHash: depositEntity.transactionHash,
      depositId: depositEntity.id,
      payload,
    });
    throw new Error(message);
  }
  await assignDepositEventsToRelayHashInfo([depositEntity], db);

  // Finally, assign the swap event to the relay hash info
  await assignSwapEventToRelayHashInfo(
    [
      {
        deposit: depositEntity,
        swapBeforeBridge: storedItem,
      },
    ],
    db,
  );
};
