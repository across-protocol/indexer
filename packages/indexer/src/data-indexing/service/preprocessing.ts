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
import { decodeEventsFromReceipt } from "../../utils/eventMatching";

/**
 * extracts and decodes a specific event from a transaction receipt's logs.
 * @param receipt The transaction receipt.
 * @param abi The Abi containing the event definition.
 * @returns Array of objects containing the decoded event, log index, transaction hash, and full log.
 */

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
    const depositEvents = decodeEventsFromReceipt<DepositForBurnArgs>({
      receipt: await payload.transactionReceipt,
      abi: parseAbi(CCTP_DEPOSIT_FOR_BURN_ABI),
      eventName: DEPOSIT_FOR_BURN_EVENT_NAME,
    });
    const depositArgs = depositEvents[0]?.event;

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
