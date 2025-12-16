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
  logger?: Logger;
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
    chainId,
    config,
    onEvent,
    onFatalError,
    logger = console as unknown as Logger,
  } = request;
  // Viem requires parsing the human-readable string array into a typed ABI
  const parsedAbi = parseAbi(config.abi);

  // Watch for the specific event on the contract
  // Note: Viem returns an `unwatch` function if we need to stop listening later.
  const unwatch = client.watchContractEvent({
    address: config.address,
    abi: parsedAbi,
    eventName: config.eventName,
    onLogs: async (logs: Log[]) => {
      // Create a temporary cache for this batch to avoid duplicate requests
      // Cache stores timestamp and the transactions list
      const blockCache = new Map<
        bigint,
        { timestamp: bigint; transactions: Transaction[] }
      >();
      // Viem receives a batch of logs (array). We iterate and push them individually.
      for (const logItem of logs) {
        try {
          // Skip pending logs that don't have a block number yet
          if (!logItem.blockNumber) {
            continue;
          }

          // Check cache first, otherwise fetch from RPC
          let cachedBlock = blockCache.get(logItem.blockNumber);
          let blockTimestamp = cachedBlock?.timestamp;

          // We essentially need two things:
          // 1. Block Timestamp (for the event payload)
          // 2. Transaction (for filtering and transforming)
          // We can get both by fetching the block with transactions.
          // Note: We use a cache to avoid fetching the same block multiple times for different logs in the same batch.

          let transaction: Transaction | undefined;

          if (!cachedBlock) {
            const block = await client.getBlock({
              blockNumber: logItem.blockNumber,
              includeTransactions: true,
            });
            blockTimestamp = block.timestamp;
            cachedBlock = {
              timestamp: blockTimestamp,
              transactions: block.transactions,
            };
            blockCache.set(logItem.blockNumber, cachedBlock);
          }

          if (cachedBlock && cachedBlock.transactions) {
            // Find the transaction that corresponds to the log
            const tx = cachedBlock.transactions.find(
              (t: any) => t.hash === logItem.transactionHash,
            );
            if (tx) {
              transaction = tx;
            }
          }

          // Fetch transaction receipt
          // Filtering and transformation functions often require the transaction receipt
          // To avoid fetching the receipt multiple times, we fetch it here and pass it to the functions
          let transactionReceipt: TransactionReceipt | undefined;
          if (logItem.transactionHash) {
            transactionReceipt = await client.getTransactionReceipt({
              hash: logItem.transactionHash,
            });
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
        } catch (error) {
          logger.error({
            at: "genericEventListener#processLog",
            message: "Error processing log batch",
            error,
          });
        }
      }
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
