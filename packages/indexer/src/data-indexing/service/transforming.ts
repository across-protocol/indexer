import * as across from "@across-protocol/sdk";
import { arrayify } from "ethers/lib/utils";
import { Logger } from "winston";

import { entities } from "@repo/indexer-database";

import { formatFromAddressToChainFormat, safeJsonStringify } from "../../utils";
import {
  decodeMessage,
  getCctpDestinationChainFromDomain,
} from "../adapter/cctp-v2/service";
import {
  ArbitraryActionsExecutedArgs,
  DepositForBurnArgs,
  FallbackHyperEVMFlowCompletedArgs,
  MessageReceivedArgs,
  MessageSentArgs,
  MintAndWithdrawArgs,
  OFTReceivedArgs,
  OFTSentArgs,
  SimpleTransferFlowCompletedArgs,
  SponsoredAccountActivationArgs,
  SponsoredDepositForBurnArgs,
  SwapFlowFinalizedArgs,
  SwapFlowInitializedArgs,
} from "../model/eventTypes";

import { getFinalisedBlockBufferDistance } from "./constants";
import { IndexerEventPayload } from "./genericEventListening";

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
    originSender: preprocessed.originSender,
    finalRecipient,
    quoteDeadline: new Date(Number(preprocessed.quoteDeadline) * 1000),
    maxBpsToSponsor: preprocessed.maxBpsToSponsor.toString(),
    maxUserSlippageBps: preprocessed.maxUserSlippageBps.toString(),
    finalToken,
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
    sender,
    recipient,
    destinationCaller,
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

/**
 * Transforms a raw `MintAndWithdraw` event payload into a partial `MintAndWithdraw` entity.
 * The 'finalised' property is set by the `baseTransformer` based on the event's block number
 * and the configured finality buffer.
 * @param preprocessed The preprocessed event arguments.
 * @param payload The event payload containing the raw log.
 * @param logger An optional logger instance. Defaults to console if not provided.
 * @returns A partial `MintAndWithdraw` entity ready for storage.
 */
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

/**
 * Transforms a raw `SwapFlowInitialized` event payload into a partial `SwapFlowInitialized` entity.
 * The 'finalised' property is set by the `baseTransformer` based on the event's block number
 * and the configured finality buffer.
 * @param preprocessed The preprocessed event arguments.
 * @param payload The event payload containing the raw log.
 * @param logger An optional logger instance. Defaults to console if not provided.
 * @returns A partial `SwapFlowInitialized` entity ready for storage.
 */
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

/**
 * Transforms a raw `SwapFlowFinalized` event payload into a partial `SwapFlowFinalized` entity.
 * The 'finalised' property is set by the `baseTransformer` based on the event's block number
 * and the configured finality buffer.
 * @param preprocessed The preprocessed event arguments.
 * @param payload The event payload containing the raw log.
 * @param logger An optional logger instance. Defaults to console if not provided.
 * @returns A partial `SwapFlowFinalized` entity ready for storage.
 */
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

/**
 * Transforms a raw `SponsoredAccountActivation` event payload into a partial `SponsoredAccountActivation` entity.
 * The 'finalised' property is set by the `baseTransformer` based on the event's block number
 * and the configured finality buffer.
 * @param preprocessed The preprocessed event arguments.
 * @param payload The event payload containing the raw log.
 * @param logger An optional logger instance. Defaults to console if not provided.
 * @returns A partial `SponsoredAccountActivation` entity ready for storage.
 */
export const transformSponsoredAccountActivationEvent = (
  preprocessed: SponsoredAccountActivationArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): Partial<entities.SponsoredAccountActivation> => {
  const base = baseTransformer(payload, logger);

  return {
    ...base,
    chainId: base.chainId.toString(),
    quoteNonce: preprocessed.quoteNonce,
    finalRecipient: preprocessed.finalRecipient,
    fundingToken: preprocessed.fundingToken,
    evmAmountSponsored: preprocessed.evmAmountSponsored.toString(),
    contractAddress: payload.log.address,
  };
};

/**
 * Transforms a raw `SimpleTransferFlowCompleted` event payload into a partial `SimpleTransferFlowCompleted` entity.
 * The 'finalised' property is set by the `baseTransformer` based on the event's block number
 * and the configured finality buffer.
 * @param preprocessed The preprocessed event arguments.
 * @param payload The event payload containing the raw log.
 * @param logger An optional logger instance. Defaults to console if not provided.
 * @returns A partial `SimpleTransferFlowCompleted` entity ready for storage.
 */
export const transformSimpleTransferFlowCompletedEvent = (
  preprocessed: SimpleTransferFlowCompletedArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): Partial<entities.SimpleTransferFlowCompleted> => {
  const base = baseTransformer(payload, logger);

  return {
    ...base,
    chainId: base.chainId.toString(),
    quoteNonce: preprocessed.quoteNonce,
    finalRecipient: preprocessed.finalRecipient,
    finalToken: preprocessed.finalToken,
    evmAmountIn: preprocessed.evmAmountIn.toString(),
    bridgingFeesIncurred: preprocessed.bridgingFeesIncurred.toString(),
    evmAmountSponsored: preprocessed.evmAmountSponsored.toString(),
    contractAddress: payload.log.address,
  };
};

/**
 * Transforms a raw `FallbackHyperEVMFlowCompleted` event payload into a partial `FallbackHyperEVMFlowCompleted` entity.
 * The 'finalised' property is set by the `baseTransformer` based on the event's block number
 * and the configured finality buffer.
 * @param preprocessed The preprocessed event arguments.
 * @param payload The event payload containing the raw log.
 * @param logger An optional logger instance. Defaults to console if not provided.
 * @returns A partial `FallbackHyperEVMFlowCompleted` entity ready for storage.
 */
export const transformFallbackHyperEVMFlowCompletedEvent = (
  preprocessed: FallbackHyperEVMFlowCompletedArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): Partial<entities.FallbackHyperEVMFlowCompleted> => {
  const base = baseTransformer(payload, logger);

  return {
    ...base,
    chainId: base.chainId.toString(),
    quoteNonce: preprocessed.quoteNonce,
    finalRecipient: preprocessed.finalRecipient,
    finalToken: preprocessed.finalToken,
    evmAmountIn: preprocessed.evmAmountIn.toString(),
    bridgingFeesIncurred: preprocessed.bridgingFeesIncurred.toString(),
    evmAmountSponsored: preprocessed.evmAmountSponsored.toString(),
    contractAddress: payload.log.address,
  };
};

/**
 * Transforms a raw `ArbitraryActionsExecuted` event payload into a partial `ArbitraryActionsExecuted` entity.
 * The 'finalised' property is set by the `baseTransformer` based on the event's block number
 * and the configured finality buffer.
 * @param preprocessed The preprocessed event arguments.
 * @param payload The event payload containing the raw log.
 * @param logger An optional logger instance. Defaults to console if not provided.
 * @returns A partial `ArbitraryActionsExecuted` entity ready for storage.
 */
export const transformArbitraryActionsExecutedEvent = (
  preprocessed: ArbitraryActionsExecutedArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): Partial<entities.ArbitraryActionsExecuted> => {
  const base = baseTransformer(payload, logger);

  return {
    ...base,
    chainId: base.chainId.toString(),
    quoteNonce: preprocessed.quoteNonce,
    initialToken: preprocessed.initialToken,
    initialAmount: preprocessed.initialAmount.toString(),
    finalToken: preprocessed.finalToken,
    finalAmount: preprocessed.finalAmount.toString(),
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
    toAddress: preprocessed.toAddress,
    amountReceivedLD: preprocessed.amountReceivedLD.toString(),
    token: tokenAddress,
  };
};
