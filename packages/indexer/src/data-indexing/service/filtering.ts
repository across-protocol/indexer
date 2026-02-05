import { pad, decodeEventLog, TransactionReceipt, parseAbi } from "viem";
import { Logger } from "winston";
import {
  SWAP_API_CALLDATA_MARKER,
  WHITELISTED_FINALIZERS,
  DEPOSIT_FOR_BURN_EVENT_NAME,
  MESSAGE_RECEIVED_EVENT_NAME,
} from "./constants";
import { IndexerEventPayload } from "./genericEventListening";
import {
  CCTP_DEPOSIT_FOR_BURN_ABI,
  CCTP_MESSAGE_RECEIVED_ABI,
} from "../model/abis";
import { decodeEventsFromReceipt } from "../../utils/eventMatching";
import {
  DepositForBurnArgs,
  MessageReceivedArgs,
  OFTSentArgs,
  OFTReceivedArgs,
} from "../model/eventTypes";
import { safeJsonStringify } from "../../utils";
import { isHypercoreWithdraw } from "../adapter/cctp-v2/service";
import { isEndpointIdSupported } from "../adapter/oft/service";

/**
 * Checks if a DepositForBurn event should be indexed.
 * It checks if the destination caller is whitelisted OR if the transaction calldata contains the Swap API marker.
 *
 * @param args The event arguments.
 * @param payload The event payload.
 * @returns True if the event should be indexed.
 */
export const filterDepositForBurnEvents = (
  args: DepositForBurnArgs,
  payload: IndexerEventPayload,
): boolean => {
  // Setup: Prepare the whitelist
  const allowedFinalizers = WHITELISTED_FINALIZERS.map((addr: string) =>
    (pad(addr as `0x${string}`, { size: 32 }) as string).toLowerCase(),
  );

  // Extract Data
  const destinationCallerLower = args.destinationCaller?.toLowerCase();

  const txInput = payload?.transaction?.input?.toLowerCase();

  // Is the caller whitelisted?
  const isWhitelisted = !!(
    destinationCallerLower &&
    allowedFinalizers.includes(
      pad(destinationCallerLower as `0x${string}`, { size: 32 }).toLowerCase(),
    )
  );

  // Does the verified transaction contain the marker?
  const hasMarker = !!(txInput && txInput.includes(SWAP_API_CALLDATA_MARKER));
  // Return true only if BOTH are true
  return isWhitelisted && hasMarker;
};

/**
 * Verifies if an event is associated with a Swap API DepositForBurn.
 * It uses the transaction receipt from the payload, finds the DepositForBurn event, and checks it against the Swap API criteria.
 * Use this for events other than DepositForBurn itself.
 *
 * @param payload The event payload.
 * @param logger logger for logging.
 * @returns True if the event should be indexed.
 */
export const createCctpBurnFilter = async (
  payload: IndexerEventPayload,
  logger: Logger,
): Promise<boolean> => {
  // Check if receipt is present in payload
  const receipt = await payload.transactionReceipt;
  if (!receipt) {
    logger.debug({
      at: "createSwapApiFilter",
      message: "No transaction receipt found in payload",
      payload,
    });
    return false;
  }

  // Find DepositForBurn log
  const decodedEvents = decodeEventsFromReceipt<DepositForBurnArgs>({
    receipt: receipt,
    abi: parseAbi(CCTP_DEPOSIT_FOR_BURN_ABI),
    eventName: DEPOSIT_FOR_BURN_EVENT_NAME,
  });
  const decodedEvent = decodedEvents[0]?.event;
  if (decodedEvent) {
    const isMatch = await filterDepositForBurnEvents(decodedEvent, payload);
    return isMatch;
  }
  // If no DepositForBurn event is found, return false and warn the user about this behaviour
  // Strictly speaking this is not an error but a behaviour that is unexpected and should be investigated
  logger.warn({
    at: "createSwapApiFilter",
    message: "Expected DepositForBurn event in receipt but could not find it",
    payload: safeJsonStringify(payload),
  });
  return false;
};

/**
 * Filters MessageReceived events.
 * Checks if the caller is a whitelisted finalizer or if the message body represents a valid Hypercore withdrawal.
 *
 * @param args The event arguments.
 * @param payload The event payload.
 * @param logger The logger instance.
 * @returns True if the event should be indexed.
 */
export const filterMessageReceived = (
  args: MessageReceivedArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): boolean => {
  if (WHITELISTED_FINALIZERS.includes(args.caller)) {
    return true;
  }
  const result = isHypercoreWithdraw(args.messageBody, {
    logger,
    chainId: payload.chainId,
    transactionHash: payload.log.transactionHash ?? undefined,
  });
  return result.isValid;
};

/**
 * Verifies if an event is associated with a CCTP MintAndWithdraw.
 * It uses the transaction receipt from the payload, finds the MessageReceived event, and checks it.
 * Use this for MintAndWithdraw events.
 *
 * @param payload The event payload.
 * @param logger logger for logging.
 * @returns True if the event should be indexed.
 */
export const createCctpMintFilter = async (
  payload: IndexerEventPayload,
  logger: Logger,
): Promise<boolean> => {
  // Check if receipt is present in payload
  const receipt = await payload.transactionReceipt;
  if (!receipt) {
    logger.debug({
      at: "createCctpMintFilter",
      message: "No transaction receipt found in payload",
      payload,
    });
    return false;
  }

  // Find MessageReceived log
  const decodedEvents = decodeEventsFromReceipt<MessageReceivedArgs>({
    receipt: receipt,
    abi: parseAbi(CCTP_MESSAGE_RECEIVED_ABI),
    eventName: MESSAGE_RECEIVED_EVENT_NAME,
  });
  const decodedEvent = decodedEvents[0]?.event;

  if (decodedEvent) {
    const isMatch = filterMessageReceived(decodedEvent, payload, logger);
    return isMatch;
  }
  // If no MessageReceived event is found, return false and warn
  logger.warn({
    at: "createCctpMintFilter",
    message: "Expected MessageReceived event in receipt but could not find it",
    payload: safeJsonStringify(payload),
  });
  return false;
};

/* ==================================================================================
 * OFT FILTERING LOGIC
 * ================================================================================== */

/**
 * Checks if an OFTSent event should be indexed.
 * Validates:
 * 1. Transaction contains Swap API marker ("73c0de")
 * 2. Destination endpoint ID is supported
 *
 * @param args The event arguments.
 * @param payload The event payload.
 * @returns True if the event should be indexed.
 */
export const filterOFTSentEvents = (
  args: OFTSentArgs,
  payload: IndexerEventPayload,
): boolean => {
  const txInput = payload?.transaction?.input?.toLowerCase();
  const hasMarker = !!(txInput && txInput.includes(SWAP_API_CALLDATA_MARKER));
  const isValidEndpoint = isEndpointIdSupported(args.dstEid);

  return hasMarker && isValidEndpoint;
};

/**
 * Checks if an OFTReceived event should be indexed.
 * Validates that the source endpoint ID is supported.
 *
 * @param args The event arguments.
 * @param payload The event payload.
 * @returns True if the event should be indexed.
 */
export const filterOFTReceivedEvents = (
  args: OFTReceivedArgs,
  payload: IndexerEventPayload,
): boolean => {
  return isEndpointIdSupported(args.srcEid);
};
