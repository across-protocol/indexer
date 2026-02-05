import { DataSource } from "typeorm";
import { entities } from "@repo/indexer-database";
import {
  assignDepositEventsToRelayHashInfo,
  assignSwapEventToRelayHashInfo,
  assignFillEventsToRelayHashInfo,
  assignCallsFailedEventToRelayHashInfo,
  assignSwapMetadataEventToRelayHashInfo,
  assignTargetChainActionEventToRelayHashInfo,
} from "../../services/spokePoolProcessor";
import { findSucceedingEventInReceipt } from "../../utils/eventMatching";
import {
  CALLS_FAILED_ABI,
  SWAP_METADATA_ABI,
  FILLED_RELAY_V3_ABI,
} from "../model/abis";
import {
  CALLS_FAILED_EVENT_NAME,
  SWAP_METADATA_EVENT_NAME,
  FILLED_RELAY_V3_EVENT_NAME,
} from "./constants";
import { storeCallsFailedEvent, storeSwapMetadataEvent } from "./storing";
import {
  CallsFailedArgs,
  SwapMetadataArgs,
  FilledV3RelayArgs,
} from "../model/eventTypes";
import { matchFillEventWithTargetChainActions } from "../../utils/targetChainActionsUtils";
import { IndexerEventPayload } from "./genericEventListening";
import { FUNDS_DEPOSITED_V3_ABI, SWAP_BEFORE_BRIDGE_ABI } from "../model/abis";
import {
  FUNDS_DEPOSITED_V3_EVENT_NAME,
  SWAP_BEFORE_BRIDGE_EVENT_NAME,
} from "./constants";
import {
  transformSwapBeforeBridgeEvent,
  transformCallsFailedEvent,
  transformSwapMetadataEvent,
} from "./transforming";
import { storeSwapBeforeBridgeEvent } from "./storing";
import { findPrecedingEventInReceipt } from "../../utils/eventMatching";
import { processEvent } from "./genericEventProcessing";
import {
  SwapBeforeBridgeArgs,
  V3FundsDepositedArgs,
} from "../model/eventTypes";
import { parseAbi } from "viem";
import { Logger } from "winston";
import {
  DataDogMetricsService,
  withMetrics,
} from "../../services/MetricsService";
import { COUNT } from "@datadog/datadog-api-client/dist/packages/datadog-api-client-v2/models/MetricIntakeType";
import { getGasFeeFromTransactionReceipt } from "../../utils/spokePoolUtils";

/**
 * Request object for postProcessDepositEvent function.
 */
type PostProcessDepositEventRequest = {
  /** The TypeORM database connection */
  db: DataSource;
  /** The stored V3FundsDeposited entity to post-process */
  storedItem: entities.V3FundsDeposited;
  /** The indexer event payload containing transaction and receipt data */
  payload: IndexerEventPayload;
  /** Metrics service instance */
  metrics?: DataDogMetricsService;
  /** Logger instance for logging */
  logger: Logger;
};

/**
 * Post-processes a stored V3FundsDeposited entity by assigning it to relay hash info.
 * It also extracts any preceding SwapBeforeBridge event from the receipt and links it.
 * @param request - The request object containing database connection, stored item, payload, metrics, and logger.
 */
export const postProcessDepositEvent = async (
  request: PostProcessDepositEventRequest,
) => {
  const { db, storedItem: storedDeposit, payload, metrics, logger } = request;
  const startTime = Date.now();
  await assignDepositEventsToRelayHashInfo([storedDeposit], db);

  const viemReceipt = await payload.transactionReceipt;
  if (!viemReceipt) {
    const message = `No transaction receipt found for deposit event ${storedDeposit.id}`;
    logger.error({
      at: "postProcessDepositEvent",
      message,
      payload,
    });
    throw new Error(message);
  }
  // Find the matching swap: logIndex < storedItem.logIndex AND no other deposit event in between
  const matchingSwap = findPrecedingEventInReceipt<
    SwapBeforeBridgeArgs,
    V3FundsDepositedArgs
  >({
    receipt: viemReceipt,
    mainEvent: storedDeposit,
    candidateAbi: parseAbi(SWAP_BEFORE_BRIDGE_ABI),
    candidateEventName: SWAP_BEFORE_BRIDGE_EVENT_NAME,
    barrierAbi: parseAbi(FUNDS_DEPOSITED_V3_ABI),
    barrierEventName: FUNDS_DEPOSITED_V3_EVENT_NAME,
  });

  if (matchingSwap) {
    // Transform and store the swap
    // Create a shallow copy of the payload with the correct log for the swap
    const swapPayload: IndexerEventPayload = {
      ...payload,
      eventName: SWAP_BEFORE_BRIDGE_EVENT_NAME,
      log: matchingSwap.log,
    };

    // Use processEvent to handle the swap event
    await processEvent<
      DataSource,
      IndexerEventPayload,
      SwapBeforeBridgeArgs,
      Partial<entities.SwapBeforeBridge>,
      entities.SwapBeforeBridge
    >({
      db,
      logger,
      eventProcessingPipeline: {
        source: async () => swapPayload,
        preprocess: async () => matchingSwap.event,
        transform: (args, payload) =>
          transformSwapBeforeBridgeEvent(args, payload, logger),
        store: (event, db) =>
          withMetrics(storeSwapBeforeBridgeEvent, {
            service: metrics,
            metricName: "eventStored",
            tags: [
              "websocketIndexer",
              "store",
              `chainId:${payload.chainId}`,
              `event:${SWAP_BEFORE_BRIDGE_EVENT_NAME}`,
            ],
            type: COUNT,
            logger,
          })(event, db, logger),
        postProcess: async (_db, _payload, storedSwap) => {
          await assignSwapEventToRelayHashInfo(
            [
              {
                deposit: storedDeposit,
                swapBeforeBridge: storedSwap,
              },
            ],
            db,
          );
        },
      },
    });
  }

  metrics?.addGaugeMetric(
    "postProcessDepositEvent.duration",
    Date.now() - startTime,
    [
      "websocketIndexer",
      "store",
      `chainId:${payload.chainId}`,
      `event:${FUNDS_DEPOSITED_V3_EVENT_NAME}`,
    ],
  );
};

/**
 * Request object for postProcessFillEvent function.
 */
type PostProcessFillEventRequest = {
  /** The TypeORM database connection */
  db: DataSource;
  /** The stored FilledV3Relay entity to post-process */
  storedItem: entities.FilledV3Relay;
  /** The indexer event payload containing transaction and receipt data */
  payload: IndexerEventPayload;
  /** Metrics service instance */
  metrics?: DataDogMetricsService;
  /** Logger instance for logging */
  logger: Logger;
  /** Optional gas fee for the fill */
  // fillGasFee?: bigint; // Removed as per request
};

/**
 * Post-processes a stored FilledV3Relay entity by assigning it to relay hash info.
 * It also extracts any succeeding CallsFailed and SwapMetadata events from the receipt and links them.
 * @param request - The request object containing database connection, stored item, payload, metrics, and logger.
 */
export const postProcessFillEvent = async (
  request: PostProcessFillEventRequest,
) => {
  const { db, storedItem: storedFill, payload, metrics, logger } = request;
  const startTime = Date.now();

  const viemReceipt = await payload.transactionReceipt;
  if (!viemReceipt) {
    const message = `No transaction receipt found for fill event ${storedFill.id}`;
    logger.error({
      at: "postProcessFillEvent",
      message,
      payload,
    });
    throw new Error(message);
  }

  const txReceipts = { [storedFill.transactionHash]: viemReceipt };
  const fillsGasFee = await getGasFeeFromTransactionReceipt(txReceipts);
  await assignFillEventsToRelayHashInfo([storedFill], db, fillsGasFee);

  // Handle CallsFailed

  // Handle CallsFailed
  const matchingCallsFailed = findSucceedingEventInReceipt<
    CallsFailedArgs,
    FilledV3RelayArgs
  >({
    receipt: viemReceipt,
    mainEvent: storedFill,
    candidateAbi: parseAbi(CALLS_FAILED_ABI),
    candidateEventName: CALLS_FAILED_EVENT_NAME,
    barrierAbi: parseAbi(FILLED_RELAY_V3_ABI),
    barrierEventName: FILLED_RELAY_V3_EVENT_NAME,
  });

  if (matchingCallsFailed) {
    const callsFailedPayload: IndexerEventPayload = {
      ...payload,
      eventName: CALLS_FAILED_EVENT_NAME,
      log: matchingCallsFailed.log,
    };
    // Use processEvent to handle the CallsFailed event
    await processEvent<
      DataSource,
      IndexerEventPayload,
      CallsFailedArgs,
      Partial<entities.CallsFailed>,
      entities.CallsFailed
    >({
      db,
      logger,
      eventProcessingPipeline: {
        source: async () => callsFailedPayload,
        preprocess: async () => matchingCallsFailed.event,
        transform: (args, payload) =>
          transformCallsFailedEvent(args, payload, logger),
        store: (event, db) =>
          withMetrics(storeCallsFailedEvent, {
            service: metrics,
            metricName: "eventStored",
            tags: [
              "websocketIndexer",
              "store",
              `chainId:${payload.chainId}`,
              `event:${CALLS_FAILED_EVENT_NAME}`,
            ],
            type: COUNT,
            logger,
          })(event, db, logger),
        postProcess: async (_db, _payload, storedCallsFailed) => {
          await assignCallsFailedEventToRelayHashInfo(
            [{ fill: storedFill, callsFailed: storedCallsFailed }],
            db,
          );
        },
      },
    });
  }

  // Handle SwapMetadata
  // finding succeeding event. If there are likely multiple, findSucceedingEvent returns the first.
  // Assuming 1:1 for now based on typical usage.
  const matchingSwapMetadata = findSucceedingEventInReceipt<
    SwapMetadataArgs,
    FilledV3RelayArgs
  >({
    receipt: viemReceipt,
    mainEvent: storedFill,
    candidateAbi: parseAbi(SWAP_METADATA_ABI),
    candidateEventName: SWAP_METADATA_EVENT_NAME,
    barrierAbi: parseAbi(FILLED_RELAY_V3_ABI),
    barrierEventName: FILLED_RELAY_V3_EVENT_NAME,
  });

  if (matchingSwapMetadata) {
    const swapMetadataPayload: IndexerEventPayload = {
      ...payload,
      eventName: SWAP_METADATA_EVENT_NAME,
      log: matchingSwapMetadata.log,
    };

    // Use processEvent to handle the SwapMetadata event
    await processEvent<
      DataSource,
      IndexerEventPayload,
      SwapMetadataArgs,
      Partial<entities.SwapMetadata>,
      entities.SwapMetadata
    >({
      db,
      logger,
      eventProcessingPipeline: {
        source: async () => swapMetadataPayload,
        preprocess: async () => matchingSwapMetadata.event,
        transform: (args, payload) =>
          transformSwapMetadataEvent(args, payload, logger),
        store: (event, db) =>
          withMetrics(storeSwapMetadataEvent, {
            service: metrics,
            metricName: "eventStored",
            tags: [
              "websocketIndexer",
              "store",
              `chainId:${payload.chainId}`,
              `event:${SWAP_METADATA_EVENT_NAME}`,
            ],
            type: COUNT,
            logger,
          })(event, db, logger),
        postProcess: async (_db, _payload, storedSwapMetadata) => {
          await assignSwapMetadataEventToRelayHashInfo(
            [{ fill: storedFill, swapMetadata: storedSwapMetadata }],
            db,
          );
        },
      },
    });
  }

  // Match fill event with target chain actions
  const fillTargetChainActionPair = matchFillEventWithTargetChainActions(
    storedFill,
    viemReceipt,
    logger,
  );
  if (fillTargetChainActionPair) {
    logger.debug({
      at: "websocketIndexer#postProcessFillEvent",
      message: "Found fill transactions with target chain action destinations",
      pair: fillTargetChainActionPair,
    });
    await assignTargetChainActionEventToRelayHashInfo(
      [fillTargetChainActionPair],
      db,
    );
  }

  metrics?.addGaugeMetric(
    "postProcessFillEvent.duration",
    Date.now() - startTime,
    [
      "websocketIndexer",
      "store",
      `chainId:${payload.chainId}`,
      `event:${FILLED_RELAY_V3_EVENT_NAME}`,
    ],
  );
};
