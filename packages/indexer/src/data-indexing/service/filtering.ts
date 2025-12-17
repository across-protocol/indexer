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
import { DepositForBurnArgs } from "../model/eventTypes";
import { safeJsonStringify } from "../../utils";

/**
 * Checks if a DepositForBurn event should be indexed.
 * It checks if the destination caller is whitelisted OR if the transaction calldata contains the Swap API marker.
 *
 * @param entity The entity to check.
 * @param payload The event payload.
 * @returns True if the event should be indexed.
 */
export const filterSwapApiData = (
  entity: Partial<entities.DepositForBurn>,
  payload: IndexerEventPayload,
): boolean => {
  // Setup: Prepare the whitelist
  const allowedFinalizers = WHITELISTED_FINALIZERS.map((addr: string) =>
    (pad(addr as `0x${string}`, { size: 32 }) as string).toLowerCase(),
  );

  // Extract Data
  const destinationCallerLower = entity.destinationCaller?.toLowerCase();

  // Safety Check: Ensure the payload transaction matches the entity's transaction
  const entityTxHash = entity.transactionHash?.toLowerCase();
  const payloadTxHash = payload?.transaction?.hash?.toLowerCase();

  if (!entityTxHash || !payloadTxHash || entityTxHash !== payloadTxHash) {
    return false; // Mismatch or missing data means we cannot verify the marker
  }

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
export const createSwapApiFilter = async (
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
    const isMatch = await filterSwapApiData(
      {
        destinationCaller: decodedEvent.destinationCaller,
        transactionHash: receipt.transactionHash,
      },
      payload,
    );
    if (isMatch) return true;
  }
  logger.debug({
    at: "createSwapApiFilter",
    message: "Expected DepositForBurn event in receipt but could not find it",
    payload: safeJsonStringify(payload),
  });
  return false;
};
