import { IndexerEventPayload } from "./genericEventListening";
import { Abi, parseAbi, parseEventLogs, TransactionReceipt } from "viem";
import { CCTP_DEPOSIT_FOR_BURN_ABI } from "../model/abis";
import { DEPOSIT_FOR_BURN_EVENT_NAME } from "./constants";
import {
  DepositForBurnArgs,
  SponsoredDepositForBurnArgs,
} from "../model/eventTypes";
import { getCctpDestinationChainFromDomain } from "../adapter/cctp-v2/service";
import { Logger } from "winston";
import {
  fetchSpokePoolEvents,
  SpokePoolEvents,
} from "../../utils/spokePoolUtils";
import {
  ConfigStoreClientFactory,
  HubPoolClientFactory,
  SpokePoolClientFactory,
} from "../../utils/contractFactoryUtils";
import { DataDogMetricsService } from "../../services/MetricsService";
import {
  DepositWithBlock,
  FillWithBlock,
} from "@across-protocol/sdk/dist/cjs/interfaces/SpokePool";
import {
  PreprocessedFilledV3RelayArgs,
  PreprocessedV3FundsDepositedArgs,
} from "../model/preprocessedTypes";

/**
 * extracts and decoding a specific event from a transaction receipt's logs.
 * @param receipt The transaction receipt.
 * @param abi The Abi containing the event definition.
 * @returns The decoded event arguments, or undefined if not found.
 */
export const decodeEventFromReceipt = <T>(
  receipt: TransactionReceipt,
  abi: Abi,
  eventName: string,
): T | undefined => {
  const logs = parseEventLogs({
    abi,
    logs: receipt.logs,
  });
  const log = logs.find((log) => log.eventName === eventName);
  return (log?.args as T) ?? undefined;
};

export const extractRawArgs = <TEvent>(
  payload: IndexerEventPayload,
): TEvent => {
  const rawArgs = (payload.log as any).args;

  if (!rawArgs) {
    throw new Error(
      `Event missing 'args'. Payload: ${JSON.stringify(payload)}`,
    );
  }

  return rawArgs as TEvent;
};

/**
 * Preprocesses a sponsored deposit for burn event by extracting raw arguments and decoding the destination chain ID from the transaction receipt.
 *
 * @param payload The event payload containing the raw log.
 * @param logger The logger instance.
 * @returns The preprocessed sponsored deposit for burn arguments.
 */
export const preprocessSponsoredDepositForBurn = async (
  payload: IndexerEventPayload,
  logger: Logger,
): Promise<SponsoredDepositForBurnArgs> => {
  const args = extractRawArgs<SponsoredDepositForBurnArgs>(payload);

  if (payload.transactionReceipt) {
    const depositArgs = decodeEventFromReceipt<DepositForBurnArgs>(
      await payload.transactionReceipt,
      parseAbi(CCTP_DEPOSIT_FOR_BURN_ABI),
      DEPOSIT_FOR_BURN_EVENT_NAME,
    );
    if (depositArgs) {
      args.destinationChainId = getCctpDestinationChainFromDomain(
        depositArgs.destinationDomain,
      );
    } else {
      const message = `Failed to decode DepositForBurn event from transaction receipt to decode destination chain id for SponsoredDepositForBurnEvent.`;
      logger.error({
        message,
        payload,
      });
      throw new Error(message);
    }
  }
  return args;
};

/**
 * Request object for preprocessing FilledV3Relay events.
 */
export interface PreprocessFilledV3RelayEventRequest {
  payload: IndexerEventPayload;
  factories: {
    spokePoolClientFactory: SpokePoolClientFactory;
    hubPoolClientFactory: HubPoolClientFactory;
    configStoreClientFactory: ConfigStoreClientFactory;
  };
  logger: Logger;
  cache?: Map<string, SpokePoolEvents>;
  metrics?: DataDogMetricsService;
}

/**
 * Preprocesses a FilledV3Relay event by fetching enriched event data from the SDK.
 *
 * @param request The request object containing payload, factories, logger, etc.
 * @returns The preprocessed event args including lite chain info.
 */
export async function preprocessFilledV3RelayEvent(
  request: PreprocessFilledV3RelayEventRequest,
): Promise<PreprocessedFilledV3RelayArgs> {
  const { payload, factories, logger, cache, metrics } = request;
  const { chainId } = payload;
  const { blockNumber, transactionHash, logIndex } = payload.log;

  const events = await fetchSpokePoolEvents({
    chainId,
    toBlockNumber: Number(blockNumber),
    fromBlockNumber: Number(blockNumber),
    factories,
    cache,
    metricsService: metrics,
  });

  // Make sure we are fetching the correct fill event
  const fill = events.filledV3RelayEvents.find(
    (f: FillWithBlock) =>
      f.blockNumber === Number(blockNumber) &&
      f.logIndex === Number(logIndex) &&
      f.txnIndex === Number(payload.log.transactionIndex),
  );

  if (!fill) {
    const message = `Fill event not found for blockNumber ${blockNumber} and logIndex ${logIndex} and transactionIndex ${payload.log.transactionIndex}`;
    logger.error({
      at: "preprocessing#preprocessFilledV3RelayEvent",
      message,
      chainId,
      blockNumber,
      logIndex,
      transactionHash,
      spokePoolEventsCount: events.filledV3RelayEvents.length,
    });
    throw new Error(message);
  }

  return fill as PreprocessedFilledV3RelayArgs;
}

/**
 * Request object for preprocessing V3FundsDeposited events.
 */
export interface PreprocessV3FundsDepositedEventRequest {
  payload: IndexerEventPayload;
  factories: {
    spokePoolClientFactory: SpokePoolClientFactory;
    hubPoolClientFactory: HubPoolClientFactory;
    configStoreClientFactory: ConfigStoreClientFactory;
  };
  logger: Logger;
  cache?: Map<string, SpokePoolEvents>;
  metrics?: DataDogMetricsService;
}

/**
 * Preprocesses a V3FundsDeposited event by fetching enriched event data from the SDK.
 *
 * @param request The request object.
 * @returns The preprocessed deposit event args.
 */
export async function preprocessV3FundsDepositedEvent(
  request: PreprocessV3FundsDepositedEventRequest,
): Promise<PreprocessedV3FundsDepositedArgs> {
  const { payload, factories, logger, cache, metrics } = request;
  const { chainId } = payload;
  const { blockNumber, transactionHash, logIndex } = payload.log;

  const events = await fetchSpokePoolEvents({
    chainId,
    toBlockNumber: Number(blockNumber),
    fromBlockNumber: Number(blockNumber),
    factories,
    cache,
    metricsService: metrics,
  });

  // Make sure we are fetching the correct deposit event
  const deposit = events.v3FundsDepositedEvents.find(
    (d: DepositWithBlock) =>
      transactionHash &&
      d.blockNumber === Number(blockNumber) &&
      d.logIndex === Number(logIndex) &&
      d.txnIndex === Number(payload.log.transactionIndex),
  );

  if (!deposit) {
    const message = `Deposit event not found for blockNumber ${blockNumber} and logIndex ${logIndex} and transactionIndex ${payload.log.transactionIndex}`;
    logger.error({
      at: "preprocessing#preprocessV3FundsDepositedEvent",
      message,
      chainId,
      blockNumber,
      logIndex,
      transactionHash,
      spokePoolEventsCount: events.v3FundsDepositedEvents.length,
    });
    throw new Error(message);
  }

  return deposit as PreprocessedV3FundsDepositedArgs;
}
