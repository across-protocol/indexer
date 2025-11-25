import { ethers } from "ethers";

/**
 * @file Implements the "WebSocket Listener" service from the design document.
 * This service acts as the **Event Producer** in the pub/sub architecture.
 *
 * It is responsible for:
 * - Establishing a persistent WebSocket connection to a blockchain node.
 * - Subscribing to specific on-chain events based on a provided configuration.
 * - Parsing raw event logs into a standardized, clean format (`IndexerEventPayload`).
 * - Pushing the clean payload into the next stage of the pipeline (e.g., a message queue)
 *    via a callback function.
 */

/**
 * Defines the configuration for a single event subscription.
 * This allows the listener service to be generic and data-driven.
 */
export interface EventConfig {
  /** The contract address to listen to. */
  address: string;
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
  /** The block number containing the event. */
  blockNumber: number;
  /** The index of the event log within the block. */
  logIndex: number;
  /** The hash of the transaction that emitted the event. */
  transactionHash: string;
  /** The decoded, named arguments of the event. */
  args: Record<string, any>;
  /**
   * The finality status of the event.
   * "unfinalized" - From a live WebSocket feed, may be subject to reorgs.
   * "finalized" - From the Reconciliation service, confirmed and canonical.
   */
  status: string;
}

/**
 * A pure function that parses a raw ethers.js event log into our standard `IndexerEventPayload`.
 *
 * @param chainId The ID of the chain this log is from.
 * @param eventName The name of the event being parsed.
 * @param log The raw `EventLog` object from ethers.js.
 * @returns A standardized `IndexerEventPayload` object.
 */
export const parseEventLog = (
  chainId: number,
  eventName: string,
  log: ethers.EventLog,
): IndexerEventPayload => {
  return {
    chainId,
    eventName,
    blockNumber: log.blockNumber,
    logIndex: log.index,
    transactionHash: log.transactionHash,
    args: log.args,
    status: "unfinalized", // Events from the live listener are always initially unfinalized
  };
};

/**
 * Creates and configures an ethers.js WebSocketProvider.
 *
 * @param chainId The ID of the chain for this provider, used for logging.
 * @param rpcUrl The WebSocket RPC endpoint URL.
 * @returns A configured `ethers.WebSocketProvider` instance.
 */
export const createWebSocketProvider = (
  chainId: number,
  rpcUrl: string,
): ethers.WebSocketProvider => {
  const provider = new ethers.WebSocketProvider(rpcUrl);

  // Basic error handling for the WebSocket connection itself
  provider.on("error", (error) => {
    console.error(`[Chain ${chainId}] WebSocket Error:`, error);
  });

  return provider;
};

/**
 * Subscribes to a single event on a given provider and wires it up to a callback.
 * This function encapsulates the logic for setting up a listener on an ethers Contract object.
 *
 * @param provider The active WebSocket provider instance.
 * @param chainId The ID of the chain, for context and logging.
 * @param config The configuration specifying which event to listen for.
 * @param onEvent The callback function to execute when a valid event is received.
 *                This is the "Dependency Injection" point where we connect to the message queue.
 *                In our case, this will be `(payload) => queue.push(payload)`.
 */
export const subscribeToEvent = (
  provider: ethers.WebSocketProvider,
  chainId: number,
  config: EventConfig,
  topic: string,
  onEvent: (topic: string, payload: IndexerEventPayload) => void,
): void => {
  try {
    console.log(
      `[Chain ${chainId}] Setting up listener for "${config.eventName}" at ${config.address}`,
    );

    const contract = new ethers.Contract(config.address, config.abi, provider);

    // Use the event name from the config to create the correct filter
    const filter = contract.filters[config.eventName]();

    // Listen for the event
    contract.on(filter, (...args: any[]) => {
      // In ethers.js v6, the last argument of the event listener is the EventLog object
      const rawLog = args[args.length - 1].log as ethers.EventLog;

      // Transform the raw log into our standard format
      const cleanPayload = parseEventLog(chainId, config.eventName, rawLog);

      // Trigger the side effect (pushing to the message queue)
      onEvent(topic, cleanPayload);
    });
  } catch (error) {
    console.error(
      `[Chain ${chainId}] Failed to setup subscription for ${config.eventName}:`,
      error,
    );
  }
};
