import { pad, decodeEventLog, TransactionReceipt, parseAbi } from "viem";
import { Logger } from "winston";
import {
  SWAP_API_CALLDATA_MARKER,
  WHITELISTED_FINALIZERS,
  DEPOSIT_FOR_BURN_EVENT_NAME,
} from "./constants";
import { Filter } from "../model/genericTypes";
import { entities } from "@repo/indexer-database";
import { IndexerEventPayload } from "./genericEventListening";
import { CCTP_DEPOSIT_FOR_BURN_ABI } from "../model/abis";
import { decodeEventFromReceipt } from "./tranforming";
import { DepositForBurnArgs, MessageReceivedArgs } from "../model/eventTypes";
import { safeJsonStringify } from "../../utils";
import { isHypercoreWithdraw } from "../adapter/cctp-v2/service";

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
  const receipt = payload.transactionReceipt;
  if (!receipt) {
    logger.debug({
      at: "createSwapApiFilter",
      message: "No transaction receipt found in payload",
      payload,
    });
    return false;
  }

  // Find DepositForBurn log
  const decodedEvent = decodeEventFromReceipt<DepositForBurnArgs>(
    receipt,
    parseAbi(CCTP_DEPOSIT_FOR_BURN_ABI),
    DEPOSIT_FOR_BURN_EVENT_NAME,
  );

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
