import Bottleneck from "bottleneck";
import {
  parseAbi,
  type Log,
  type PublicClient,
  type Transport,
  type Chain,
  type Transaction,
  TransactionReceipt,
} from "viem";
import { Logger } from "winston";
import { DataDogMetricsService } from "../../services/MetricsService";

/**
 * @file Implements the "WebSocket Listener" service.
 * This service acts as the **Event Producer** in the pub/sub architecture.
 *
 * It is responsible for:
 * - Establishing a persistent connection to a blockchain node (via Viem PublicClient).
 * - Subscribing to specific on-chain events based on a provided configuration.
 * - Parsing raw event logs into a standardized, clean format (`IndexerEventPayload`).
 * - Pushing the clean payload into the next stage of the pipeline via a callback.
 */

/**
 * Defines the configuration for a single event subscription.
 * This allows the listener service to be generic and data-driven.
 */
export interface EventConfig {
  /** The contract address to listen to. */
  address: `0x${string}`;
  /**
   * Human-readable ABI fragment for the event.
   * e.g., ["event Transfer(address indexed from, address indexed to, uint256 value)"]
   */
  abi: string[];
  /** The specific name of the event in the ABI to subscribe to. */
  eventName: string;
}

/**
 * The standardized, internal representation of a captured on-chain event.
 * This is the object that gets passed into the message queue.
 */
export interface IndexerEventPayload {
  /** The ID of the chain where the event was emitted. */
  chainId: number;
  /** The name of the event (e.g., "Transfer"). */
  eventName: string;
  /** The timestamp of the block the event was created in */
  blockTimestamp: bigint;
  /** The block number of the most recent block as indexed by the RPC node */
  currentBlockHeight: bigint;
  /** The log that was captured. */
  log: Log;
  /** The transaction that generated the event. */
  transaction?: Transaction;
  /** The receipt of the transaction that generated the event. */
  transactionReceipt?: TransactionReceipt;
}

/**
 * Request object for subscribing to an event.
 * @template TPayload The type of the event payload.
 */
export interface SubscribeToEventRequest<TPayload> {
  /** The Viem public client instance. */
  client: PublicClient<Transport, Chain>;
  /** The queue to use for processing events. */
  processingQueue: Bottleneck;
  /** The ID of the blockchain chain. */
  chainId: number;
  /** The configuration for the event to subscribe to. */
  config: EventConfig;
  /** The callback function to be executed when an event is received. */
  onEvent: (payload: TPayload) => void;
  /** * Callback to trigger when the subscription encounters a non-recoverable error.
   * This allows the orchestrator to restart the subsystem.
   */
  onFatalError: (error: Error) => void;
  /** An optional logger instance. */
  logger: Logger;
  /** An optional metrics service instance. */
  metrics?: DataDogMetricsService;
}

/**
 * Request object for processing a batch of logs.
 * @template TPayload The type of the event payload.
 */
export interface ProcessLogBatchArgs<TPayload> {
  logs: Log[];
  config: EventConfig;
  chainId: number;
  client: PublicClient<Transport, Chain>;

  onEvent: (payload: TPayload) => void;
  logger: Logger;
  metrics?: DataDogMetricsService;
}

/**
 * Subscribes to a single event on a given client and wires it up to a callback.
 *
 * @param request The request object containing client, chainId, config, onEvent, and an optional logger.
 */
export const subscribeToEvent = <TPayload>(
  request: SubscribeToEventRequest<TPayload>,
) => {
  const {
    client,
    processingQueue,
    chainId,
    config,
    onEvent,
    onFatalError,
    logger,
    metrics,
  } = request;
  // Viem requires parsing the human-readable string array into a typed ABI
  const parsedAbi = parseAbi(config.abi);

  // Watch for the specific event on the contract
  // Note: Viem returns an `unwatch` function if we need to stop listening later.
  const unwatch = client.watchContractEvent({
    address: config.address,
    abi: parsedAbi,
    eventName: config.eventName,
    onLogs: (logs: Log[]) => {
      // Fire and forget: Add the batch processing to the queue
      processingQueue.schedule(() =>
        processLogBatch({
          logs,
          config,
          chainId,
          client,
          onEvent,
          logger,
          metrics,
        }),
      );
    },
    onError: (error: Error) => {
      logger.error({
        at: "genericEventListener#subscribeToEvent",
        message: `Fatal error watching event ${config.eventName}. Triggering restart.`,
        error: error,
        notificationPath: "across-indexer-error",
      });

      // Notify the orchestrator that this listener has died
      onFatalError(error);
    },
  });

  return unwatch;
};

/**
 * Processes a batch of logs efficiently by pre-fetching all required data in parallel.
 *
 * This function iterates over the logs in the batch and:
 * 1. Fetches the block and transactions for each log (deduplicated by block number).
 * 2. Fetches the transaction receipt for each log (deduplicated by tx hash).
 * 3. Constructs the payload.
 * 4. Calls the `onEvent` callback.
 *
 * All network requests are initiated in parallel to maximize throughput.
 * Internal caches are used to prevent redundant RPC calls for logs in the same block or transaction.
 *
 * @param args - The arguments object containing logs, config, client, etc.
 */
async function processLogBatch<TPayload>(
  args: ProcessLogBatchArgs<TPayload>,
): Promise<void> {
  const { logs, config, chainId, client, onEvent, logger, metrics } = args;
  const batchStart = Date.now();
  const tags = [
    `websocketIndexer`,
    `processLogBatch`,
    `chainId:${chainId}`,
    `event:${config.eventName}`,
  ];

  // Create caches for this batch to avoid duplicate requests/parallel fetching
  const blockCache = new Map<
    bigint,
    { timestamp: bigint; transactions: Transaction[] }
  >();
  const receiptCache = new Map<string, TransactionReceipt>();

  // Process all logs in parallel
  await Promise.all(
    logs.map(async (logItem) => {
      const startProcessingTime = Date.now();
      try {
        // Skip pending logs that don't have a block number yet
        if (!logItem.blockNumber) {
          return;
        }

        // --- Fetch Block & Transactions (Deduplicated) ---
        let blockInformation = blockCache.get(logItem.blockNumber);
        if (!blockInformation) {
          blockInformation = await client.getBlock({
            blockNumber: logItem.blockNumber,
            includeTransactions: true,
          });
          metrics?.addCountMetric("rpcCallGetBlock", tags);

          blockCache.set(logItem.blockNumber, blockInformation);
        }
        const { timestamp: blockTimestamp, transactions } = blockInformation;

        // --- Find Transaction ---
        let transaction: Transaction | undefined;
        if (transactions) {
          transaction = transactions.find(
            (t: any) => t.hash === logItem.transactionHash,
          );
        }

        // --- Fetch Transaction Receipt (Deduplicated) ---
        let transactionReceipt: TransactionReceipt | undefined;
        if (logItem.transactionHash) {
          transactionReceipt = receiptCache.get(logItem.transactionHash);
          if (!transactionReceipt) {
            transactionReceipt = await client.getTransactionReceipt({
              hash: logItem.transactionHash,
            });
            metrics?.addCountMetric("rpcCallGetTransactionReceipt", tags);
            receiptCache.set(logItem.transactionHash, transactionReceipt);
          }
        }

        const payload = {
          chainId,
          eventName: config.eventName,
          log: logItem,
          blockTimestamp,
          // The events are emitted at head so we can simply take the block number of the log as the currentBlockHeight
          currentBlockHeight: logItem.blockNumber,
          transaction,
          transactionReceipt,
        } as TPayload;

        // Trigger the side effect (Forward it to an event processor or message queue)
        logger.debug({
          at: "genericEventListener#processLog",
          message: `Received Log for ${config.eventName} in tx ${logItem.transactionHash}`,
          chainId,
          blockTimestamp,
          contractAddress: config.address,
        });
        onEvent(payload);

        metrics?.addGaugeMetric(
          "processLog",
          Date.now() - startProcessingTime,
          tags,
        );
        metrics?.addGaugeMetric(
          "websocketToBlockLatency",
          // BlockTimestamp is in seconds, system time is in seconds. We cannot meausre latency that is below a second.
          (batchStart - Number(blockTimestamp) * 1000) / 1000,
          tags,
        );
      } catch (error) {
        logger.error({
          at: "genericEventListener#processLog",
          message: "Error processing log item",
          error,
          logIndex: logItem.logIndex,
          txHash: logItem.transactionHash,
        });
        metrics?.addCountMetric("processLogError", tags);
      }
    }),
  );
  metrics?.addGaugeMetric("processLogBatch", Date.now() - batchStart, tags);
}
