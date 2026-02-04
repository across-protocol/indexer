import { DataSource } from "typeorm";
import { entities } from "@repo/indexer-database";
import {
  assignDepositEventsToRelayHashInfo,
  assignSwapEventToRelayHashInfo,
} from "../../services/spokePoolProcessor";
import { IndexerEventPayload } from "./genericEventListening";
import { FUNDS_DEPOSITED_V3_ABI, SWAP_BEFORE_BRIDGE_ABI } from "../model/abis";
import {
  FUNDS_DEPOSITED_V3_EVENT_NAME,
  SWAP_BEFORE_BRIDGE_EVENT_NAME,
} from "./constants";
import { transformSwapBeforeBridgeEvent } from "./transforming";
import { storeSwapBeforeBridgeEvent } from "./storing";
import { decodeEventsFromReceipt } from "./preprocessing";
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
  // Decode all SwapBeforeBridge events
  const swapEvents = decodeEventsFromReceipt<SwapBeforeBridgeArgs>(
    viemReceipt,
    parseAbi(SWAP_BEFORE_BRIDGE_ABI),
    SWAP_BEFORE_BRIDGE_EVENT_NAME,
  );

  // Decode all V3FundsDeposited events to help with matching
  const depositEvents = decodeEventsFromReceipt<V3FundsDepositedArgs>(
    viemReceipt,
    parseAbi(FUNDS_DEPOSITED_V3_ABI),
    FUNDS_DEPOSITED_V3_EVENT_NAME,
  );

  // Find the matching swap: logIndex < storedItem.logIndex AND no other deposit event in between
  const matchingSwap = swapEvents
    .filter((s) => s.logIndex < storedDeposit.logIndex)
    .filter((s) => {
      // No other deposit event should be between this swap and our target deposit
      return !depositEvents.some(
        (d) => d.logIndex > s.logIndex && d.logIndex < storedDeposit.logIndex,
      );
    })
    .sort((a, b) => b.logIndex - a.logIndex)[0];

  if (matchingSwap) {
    // Transform and store the swap
    // Create a shallow copy of the payload with the correct log for the swap
    const swapPayload: IndexerEventPayload = {
      ...payload,
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
