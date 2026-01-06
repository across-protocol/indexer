import { entities } from "@repo/indexer-database";
import * as across from "@across-protocol/sdk";
import { IndexerEventPayload } from "./genericEventListening";
import {
  getCctpDestinationChainFromDomain,
  decodeMessage, // New import
} from "../adapter/cctp-v2/service";
import { formatFromAddressToChainFormat, safeJsonStringify } from "../../utils";
import { getFinalisedBlockBufferDistance } from "./constants";
import {
  DepositForBurnArgs,
  MessageReceivedArgs,
  MessageSentArgs,
  MintAndWithdrawArgs,
  SwapFlowFinalizedArgs,
  SwapFlowInitializedArgs,
  OFTSentArgs,
  OFTReceivedArgs,
} from "../model/eventTypes";
import { Logger } from "winston";
import { arrayify } from "ethers/lib/utils"; // New import
import {
  TransactionReceipt,
  parseEventLogs,
  ParseEventLogsReturnType,
  Abi,
} from "viem";

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
function baseTransformer(payload: IndexerEventPayload, logger: Logger) {
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
    const formattedPayload = safeJsonStringify(payload);
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
 * @param preprocessed The preprocessed event arguments.
 * @param payload The event payload containing the raw log.
 * @param logger An optional logger instance. Defaults to console if not provided.
 * @returns A partial `DepositForBurn` entity ready for storage.
 */
export const transformDepositForBurnEvent = (
  preprocessed: DepositForBurnArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): Partial<entities.DepositForBurn> => {
  const base = baseTransformer(payload, logger);
  const destinationChainId = getCctpDestinationChainFromDomain(
    preprocessed.destinationDomain,
  );
  const mintRecipient = transformAddress(
    preprocessed.mintRecipient,
    destinationChainId,
  );
  const tokenMessenger = transformAddress(
    preprocessed.destinationTokenMessenger,
    destinationChainId,
  );
  const destinationCaller = transformAddress(
    preprocessed.destinationCaller,
    destinationChainId,
  );

  return {
    ...base,
    amount: preprocessed.amount.toString(),
    burnToken: preprocessed.burnToken,
    depositor: preprocessed.depositor,
    destinationCaller,
    maxFee: preprocessed.maxFee.toString(),
    destinationDomain: preprocessed.destinationDomain,
    destinationTokenMessenger: tokenMessenger,
    mintRecipient,
    minFinalityThreshold: preprocessed.minFinalityThreshold,
    hookData: preprocessed.hookData,
  };
};

export const transformMessageSentEvent = (
  preprocessed: MessageSentArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): Partial<entities.MessageSent> => {
  const base = baseTransformer(payload, logger);
  const decodedMessage = decodeMessage(arrayify(preprocessed.message));
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
    message: preprocessed.message,
    version: decodedMessage.version,
    sourceDomain: decodedMessage.sourceDomain,
    destinationDomain: decodedMessage.destinationDomain,
    nonce: decodedMessage.nonce,
    sender,
    recipient,
    destinationCaller,
    minFinalityThreshold: decodedMessage.minFinalityThreshold,
    finalityThresholdExecuted: decodedMessage.finalityThresholdExecuted,
    messageBody: decodedMessage.messageBody,
  };
};

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

/**
 * Transforms a raw `MessageReceived` event payload into a partial `MessageReceived` entity.
 * The 'finalised' property is set by the `baseTransformer` based on the event's block number
 * and the configured finality buffer.
 * @param preprocessed The preprocessed event arguments.
 * @param payload The event payload containing the raw log.
 * @param logger An optional logger instance. Defaults to console if not provided.
 * @returns A partial `MessageReceived` entity ready for storage.
 */
export const transformMessageReceivedEvent = (
  preprocessed: MessageReceivedArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): Partial<entities.MessageReceived> => {
  const base = baseTransformer(payload, logger);
  return {
    ...base,
    caller: preprocessed.caller,
    sourceDomain: preprocessed.sourceDomain,
    nonce: preprocessed.nonce,
    sender: transformAddress(
      preprocessed.sender,
      getCctpDestinationChainFromDomain(preprocessed.sourceDomain),
    ),
    finalityThresholdExecuted: preprocessed.finalityThresholdExecuted,
    messageBody: preprocessed.messageBody,
  };
};

export const transformMintAndWithdrawEvent = (
  preprocessed: MintAndWithdrawArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): Partial<entities.MintAndWithdraw> => {
  const base = baseTransformer(payload, logger);
  const chainId = parseInt(base.chainId);
  const mintRecipient = transformAddress(preprocessed.mintRecipient, chainId);
  const mintToken = transformAddress(preprocessed.mintToken, chainId);

  return {
    ...base,
    mintRecipient,
    amount: preprocessed.amount.toString(),
    mintToken,
    feeCollected: preprocessed.feeCollected.toString(),
  };
};

export const transformSwapFlowInitializedEvent = (
  preprocessed: SwapFlowInitializedArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): Partial<entities.SwapFlowInitialized> => {
  const base = baseTransformer(payload, logger);

  return {
    ...base,
    chainId: base.chainId.toString(),
    quoteNonce: preprocessed.quoteNonce,
    finalRecipient: preprocessed.finalRecipient,
    finalToken: preprocessed.finalToken,
    evmAmountIn: preprocessed.evmAmountIn.toString(),
    bridgingFeesIncurred: preprocessed.bridgingFeesIncurred.toString(),
    coreAmountIn: preprocessed.coreAmountIn.toString(),
    minAmountToSend: preprocessed.minAmountToSend.toString(),
    maxAmountToSend: preprocessed.maxAmountToSend.toString(),
    contractAddress: payload.log.address,
  };
};

export const transformSwapFlowFinalizedEvent = (
  preprocessed: SwapFlowFinalizedArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): Partial<entities.SwapFlowFinalized> => {
  const base = baseTransformer(payload, logger);

  return {
    ...base,
    chainId: base.chainId.toString(),
    quoteNonce: preprocessed.quoteNonce,
    finalRecipient: preprocessed.finalRecipient,
    finalToken: preprocessed.finalToken,
    totalSent: preprocessed.totalSent.toString(),
    evmAmountSponsored: preprocessed.evmAmountSponsored.toString(),
    contractAddress: payload.log.address,
  };
};

/* ==================================================================================
 * OFT TRANSFORMING LOGIC
 * ================================================================================== */
/**
 * Transforms a raw `OFTSent` event payload into a partial `OFTSent` entity.
 * The 'finalised' property is set by the `baseTransformer` based on block number
 * and the configured finality buffer.
 *
 * @param preprocessed The preprocessed event arguments.
 * @param payload The event payload containing the raw log.
 * @param logger The logger instance.
 * @param tokenAddress The token address for this OFT (from chain configuration).
 * @returns A partial `OFTSent` entity ready for storage.
 */
export const transformOFTSentEvent = (
  preprocessed: OFTSentArgs,
  payload: IndexerEventPayload,
  logger: Logger,
  tokenAddress: string,
): Partial<entities.OFTSent> => {
  const base = baseTransformer(payload, logger);

  return {
    ...base,
    chainId: base.chainId.toString(),
    guid: preprocessed.guid,
    dstEid: preprocessed.dstEid,
    fromAddress: preprocessed.fromAddress,
    amountSentLD: preprocessed.amountSentLD.toString(),
    amountReceivedLD: preprocessed.amountReceivedLD.toString(),
    token: tokenAddress,
  };
};

/**
 * Transforms a raw `OFTReceived` event payload into a partial `OFTReceived` entity.
 *
 * @param preprocessed The preprocessed event arguments.
 * @param payload The event payload containing the raw log.
 * @param logger The logger instance.
 * @param tokenAddress The token address for this OFT (from chain configuration).
 * @returns A partial `OFTReceived` entity ready for storage.
 */
export const transformOFTReceivedEvent = (
  preprocessed: OFTReceivedArgs,
  payload: IndexerEventPayload,
  logger: Logger,
  tokenAddress: string,
): Partial<entities.OFTReceived> => {
  const base = baseTransformer(payload, logger);

  return {
    ...base,
    chainId: base.chainId.toString(),
    guid: preprocessed.guid,
    srcEid: preprocessed.srcEid,
    toAddress: preprocessed.toAddress.toLowerCase(),
    amountReceivedLD: preprocessed.amountReceivedLD.toString(),
    token: tokenAddress,
  };
};
