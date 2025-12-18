import { entities } from "@repo/indexer-database";
import * as across from "@across-protocol/sdk";
import { IndexerEventPayload } from "./genericEventListening";
import {
  getCctpDestinationChainFromDomain,
  decodeMessage, // New import
} from "../adapter/cctp-v2/service";
import { formatFromAddressToChainFormat } from "../../utils";
import { Transformer } from "../model/genericTypes";
import { getFinalisedBlockBufferDistance } from "./constants";
import {
  DepositForBurnArgs,
  MessageReceivedArgs,
  MessageSentArgs,
} from "../model/eventTypes";
import { Logger } from "winston";
import { arrayify } from "ethers/lib/utils"; // New import

/**
 * A generic transformer for addresses.
 * @param address The address to transform.
 * @param chainId The chain ID of the address.
 * @returns The transformed address.
 */
function transformAddress(address: string, chainId: number): string {
  const addressType = across.utils.toAddressType(address, chainId);
  return formatFromAddressToChainFormat(addressType, chainId);
}

/**
 * Creates a base entity from a raw event payload.
 * This handles common fields that all our entities share.
 * @param payload The extended event payload.
 * @param logger An optional logger instance. Defaults to console if not provided.
 * @returns A partial entity with base fields populated.
 */
function baseTransformer(
  payload: IndexerEventPayload,
  logger: Logger = console as unknown as Logger,
) {
  const { log: logItem, chainId, blockTimestamp, currentBlockHeight } = payload;
  const {
    transactionHash,
    logIndex,
    transactionIndex,
    blockNumber,
    blockHash,
  } = logItem;

  // Guard against missing essential fields
  if (
    !transactionHash ||
    logIndex === null ||
    transactionIndex === null ||
    blockHash === null
  ) {
    const formattedPayload = JSON.stringify(payload, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    logger.error({
      at: "transformers#baseTransformer",
      message: `Log incomplete. TxHash: ${transactionHash}, Index: ${logIndex}, TxIndex: ${transactionIndex}, BlockHash: ${blockHash} Payload: ${formattedPayload}`,
      notificationPath: "across-indexer-error",
    });
    throw new Error(
      `Log incomplete. TxHash: ${transactionHash}, Index: ${logIndex}, TxIndex: ${transactionIndex}, Payload: ${formattedPayload}`,
    );
  }

  return {
    chainId: chainId.toString(),
    blockNumber: Number(blockNumber),
    blockHash,
    blockTimestamp: new Date(Number(blockTimestamp) * 1000),
    transactionHash,
    transactionIndex,
    logIndex,
    finalised: currentBlockHeight <= getFinalisedBlockBufferDistance(chainId), // TODO: This finality logic (currentBlockHeight <= getFinalisedBlockBufferDistance(chainId)) is likely incorrect for events originating from the WebSocket listener. Design doc states that events from WS should initially be 'unfinalized' and only gain 'finalized' status after reconciliation.
  };
}

/**
 * Transforms a raw `DepositForBurn` event payload into a partial `DepositForBurn` entity.
 * The 'finalised' property is set by the `baseTransformer` based on the event's block number
 * and the configured finality buffer.
 * @param payload The event payload containing the raw log.
 * @param logger An optional logger instance. Defaults to console if not provided.
 * @returns A partial `DepositForBurn` entity ready for storage.
 */
export const transformDepositForBurnEvent: Transformer<
  IndexerEventPayload,
  Partial<entities.DepositForBurn>
> = (payload, logger: Logger = console as unknown as Logger) => {
  const rawArgs = getRawArgs(payload, logger);
  const args = rawArgs as unknown as DepositForBurnArgs;
  const base = baseTransformer(payload, logger);
  const destinationChainId = getCctpDestinationChainFromDomain(
    args.destinationDomain,
  );
  const mintRecipient = transformAddress(
    args.mintRecipient,
    destinationChainId,
  );
  const tokenMessenger = transformAddress(
    args.destinationTokenMessenger,
    destinationChainId,
  );
  const destinationCaller = transformAddress(
    args.destinationCaller,
    destinationChainId,
  );

  return {
    ...base,
    amount: args.amount.toString(),
    burnToken: args.burnToken,
    depositor: args.depositor.toLowerCase(),
    destinationCaller: destinationCaller.toLowerCase(),
    maxFee: args.maxFee.toString(),
    destinationDomain: args.destinationDomain,
    destinationTokenMessenger: tokenMessenger.toLowerCase(),
    mintRecipient: mintRecipient.toLowerCase(),
    minFinalityThreshold: args.minFinalityThreshold,
    hookData: args.hookData,
  };
};

export const transformMessageSentEvent: Transformer<
  IndexerEventPayload,
  Partial<entities.MessageSent>
> = (payload, logger: Logger = console as unknown as Logger) => {
  const rawArgs = getRawArgs(payload, logger);

  const args = rawArgs as unknown as MessageSentArgs;
  const base = baseTransformer(payload, logger);
  const decodedMessage = decodeMessage(arrayify(args.message));
  const destinationChainId = getCctpDestinationChainFromDomain(
    decodedMessage.destinationDomain,
  );
  const chainId = parseInt(base.chainId);
  const sender = transformAddress(decodedMessage.sender, chainId);
  const recipient = transformAddress(
    decodedMessage.recipient,
    destinationChainId,
  );
  const destinationCaller = transformAddress(
    decodedMessage.destinationCaller,
    destinationChainId,
  );

  return {
    ...base,
    message: args.message,
    version: decodedMessage.version,
    sourceDomain: decodedMessage.sourceDomain,
    destinationDomain: decodedMessage.destinationDomain,
    nonce: decodedMessage.nonce,
    sender: sender.toLowerCase(),
    recipient: recipient.toLowerCase(),
    destinationCaller: destinationCaller.toLowerCase(),
    minFinalityThreshold: decodedMessage.minFinalityThreshold,
    finalityThresholdExecuted: decodedMessage.finalityThresholdExecuted,
    messageBody: decodedMessage.messageBody,
  };
};

export const transformMessageReceivedEvent: Transformer<
  IndexerEventPayload,
  Partial<entities.MessageReceived>
> = (payload, logger: Logger = console as unknown as Logger) => {
  const rawArgs = getRawArgs(payload, logger);

  const args = rawArgs as unknown as MessageReceivedArgs;
  const base = baseTransformer(payload, logger);

  return {
    ...base,
    caller: args.caller.toLowerCase(),
    sourceDomain: args.sourceDomain,
    nonce: args.nonce,
    sender: transformAddress(
      args.sender,
      getCctpDestinationChainFromDomain(args.sourceDomain),
    ).toLowerCase(),
    finalityThresholdExecuted: args.finalityThresholdExecuted,
    messageBody: args.messageBody,
  };
};

const getRawArgs = <TEvent>(payload: IndexerEventPayload, logger: Logger) => {
  const rawArgs = (payload.log as any).args;

  if (!rawArgs) {
    const formattedPayload = JSON.stringify(payload, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    logger.error({
      at: "transformers#messageSentTransformer",
      message: `Event missing 'args'. Payload: ${formattedPayload}`,
      notificationPath: "across-indexer-error",
    });
    throw new Error(
      `MessageSent event missing 'args'. Payload: ${formattedPayload}`,
    );
  }

  return rawArgs as TEvent;
};
