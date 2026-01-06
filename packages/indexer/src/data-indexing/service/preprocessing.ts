import { IndexerEventPayload } from "./genericEventListening";
import {
  Abi,
  parseAbi,
  parseEventLogs,
  TransactionReceipt,
  decodeEventLog,
} from "viem";
import {
  SPONSORED_DEPOSIT_FOR_BURN_ABI,
  CCTP_DEPOSIT_FOR_BURN_ABI,
} from "../model/abis";
import { DEPOSIT_FOR_BURN_EVENT_NAME } from "./constants";
import {
  DepositForBurnArgs,
  SponsoredDepositForBurnArgs,
} from "../model/eventTypes";
import { getCctpDestinationChainFromDomain } from "../adapter/cctp-v2/service";
import { Logger } from "winston";

/**
 * extracts and decodes a specific event from a transaction receipt's logs.
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

export const preprocessSponsoredDepositForBurn = (
  payload: IndexerEventPayload,
  logger: Logger,
): SponsoredDepositForBurnArgs => {
  const args = extractRawArgs<SponsoredDepositForBurnArgs>(payload);

  if (payload.transactionReceipt) {
    const depositArgs = decodeEventFromReceipt<DepositForBurnArgs>(
      payload.transactionReceipt,
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
