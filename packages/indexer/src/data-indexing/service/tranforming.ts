import { entities } from "@repo/indexer-database";
import * as across from "@across-protocol/sdk";
import { IndexerEventPayload } from "./genericEventListening";
import {
  getCctpDestinationChainFromDomain,
  decodeMessage,
} from "../adapter/cctp-v2/service";
import { formatFromAddressToChainFormat, safeJsonStringify } from "../../utils";
import { getFinalisedBlockBufferDistance } from "./constants";
import {
  DepositForBurnArgs,
  MessageReceivedArgs,
  MessageSentArgs,
  SponsoredDepositForBurnArgs,
  MintAndWithdrawArgs,
  SwapFlowFinalizedArgs,
  SwapFlowInitializedArgs,
} from "../model/eventTypes";
import { Logger } from "winston";
import { arrayify } from "ethers/lib/utils";

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
    burnToken: preprocessed.burnToken.toLowerCase(),
    depositor: preprocessed.depositor.toLowerCase(),
    destinationCaller: destinationCaller.toLowerCase(),
    maxFee: preprocessed.maxFee.toString(),
    destinationDomain: preprocessed.destinationDomain,
    destinationTokenMessenger: tokenMessenger.toLowerCase(),
    mintRecipient: mintRecipient.toLowerCase(),
    minFinalityThreshold: preprocessed.minFinalityThreshold,
    hookData: preprocessed.hookData,
  };
};

export const transformSponsoredDepositForBurnEvent = (
  preprocessed: SponsoredDepositForBurnArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): Partial<entities.SponsoredDepositForBurn> => {
  const base = baseTransformer(payload, logger);

  const destinationChainId = preprocessed.destinationChainId;
  if (!destinationChainId) {
    const message = `Failed to decode DepositForBurn event from transaction receipt to decode destination chain id for SponsoredDepositForBurnEvent.`;
    logger.error({
      message,
      payload,
    });
    throw new Error(message);
  }
  const finalRecipient = transformAddress(
    preprocessed.finalRecipient,
    destinationChainId,
  );
  const finalToken = transformAddress(
    preprocessed.finalToken,
    destinationChainId,
  );

  return {
    ...base,
    quoteNonce: preprocessed.quoteNonce,
    originSender: preprocessed.originSender.toLowerCase(),
    finalRecipient: finalRecipient.toLowerCase(),
    quoteDeadline: new Date(Number(preprocessed.quoteDeadline) * 1000),
    maxBpsToSponsor: preprocessed.maxBpsToSponsor.toString(),
    maxUserSlippageBps: preprocessed.maxUserSlippageBps.toString(),
    finalToken: finalToken.toLowerCase(),
    signature: preprocessed.signature,
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
    sender: sender.toLowerCase(),
    recipient: recipient.toLowerCase(),
    destinationCaller: destinationCaller.toLowerCase(),
    minFinalityThreshold: decodedMessage.minFinalityThreshold,
    finalityThresholdExecuted: decodedMessage.finalityThresholdExecuted,
    messageBody: decodedMessage.messageBody,
  };
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
    caller: preprocessed.caller.toLowerCase(),
    sourceDomain: preprocessed.sourceDomain,
    nonce: preprocessed.nonce,
    sender: transformAddress(
      preprocessed.sender,
      getCctpDestinationChainFromDomain(preprocessed.sourceDomain),
    ).toLowerCase(),
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
    mintRecipient: mintRecipient.toLowerCase(),
    amount: preprocessed.amount.toString(),
    mintToken: mintToken.toLowerCase(),
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
    finalRecipient: preprocessed.finalRecipient.toLowerCase(),
    finalToken: preprocessed.finalToken.toLowerCase(),
    evmAmountIn: preprocessed.evmAmountIn.toString(),
    bridgingFeesIncurred: preprocessed.bridgingFeesIncurred.toString(),
    coreAmountIn: preprocessed.coreAmountIn.toString(),
    minAmountToSend: preprocessed.minAmountToSend.toString(),
    maxAmountToSend: preprocessed.maxAmountToSend.toString(),
    contractAddress: payload.log.address.toLowerCase(),
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
    finalRecipient: preprocessed.finalRecipient.toLowerCase(),
    finalToken: preprocessed.finalToken.toLowerCase(),
    totalSent: preprocessed.totalSent.toString(),
    evmAmountSponsored: preprocessed.evmAmountSponsored.toString(),
    contractAddress: payload.log.address.toLowerCase(),
  };
};
