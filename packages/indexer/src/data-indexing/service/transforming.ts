import { entities } from "@repo/indexer-database";
import * as across from "@across-protocol/sdk";
import { IndexerEventPayload } from "./genericEventListening";
import {
  getCctpDestinationChainFromDomain,
  decodeMessage,
} from "../adapter/cctp-v2/service";
import {
  formatFromAddressToChainFormat,
  safeJsonStringify,
  getInternalHash,
} from "../../utils";
import { getFinalisedBlockBufferDistance } from "./constants";
import {
  DepositForBurnArgs,
  MessageReceivedArgs,
  MessageSentArgs,
  SponsoredDepositForBurnArgs,
  MintAndWithdrawArgs,
  SwapFlowFinalizedArgs,
  SwapFlowInitializedArgs,
  SponsoredAccountActivationArgs,
  SimpleTransferFlowCompletedArgs,
  FallbackHyperEVMFlowCompletedArgs,
  ArbitraryActionsExecutedArgs,
  OFTSentArgs,
  OFTReceivedArgs,
  FilledV3RelayArgs,
  V3FundsDepositedArgs,
  ExecutedRelayerRefundRootArgs,
  RequestedSpeedUpV3DepositArgs,
  RelayedRootBundleArgs,
} from "../model/eventTypes";
import { Logger } from "winston";
import { BigNumber } from "ethers";
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

/**
 * Transforms a raw `FilledV3Relay` event payload into a partial `FilledV3Relay` entity.
 *
 * @param preprocessed The preprocessed event arguments.
 * @param payload The event payload containing the raw log.
 * @param logger The logger instance.
 * @returns A partial `FilledV3Relay` entity ready for storage.
 */
export const transformFilledV3RelayEvent = (
  preprocessed: FilledV3RelayArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): Partial<entities.FilledV3Relay> => {
  const base = baseTransformer(payload, logger);
  const destinationChainId = Number(base.chainId); // Event emitted on destination chain
  const originChainId = Number(preprocessed.originChainId);

  const relayData = {
    originChainId,
    depositId: BigNumber.from(preprocessed.depositId),
    inputToken: across.utils.toAddressType(
      preprocessed.inputToken.toString(),
      originChainId,
    ),
    outputToken: across.utils.toAddressType(
      preprocessed.outputToken.toString(),
      destinationChainId,
    ),
    inputAmount: BigNumber.from(preprocessed.inputAmount),
    outputAmount: BigNumber.from(preprocessed.outputAmount),
    fillDeadline: preprocessed.fillDeadline,
    exclusivityDeadline: preprocessed.exclusivityDeadline,
    exclusiveRelayer: across.utils.toAddressType(
      preprocessed.exclusiveRelayer.toString(),
      destinationChainId,
    ),
    depositor: across.utils.toAddressType(
      preprocessed.depositor.toString(),
      originChainId,
    ),
    recipient: across.utils.toAddressType(
      preprocessed.recipient.toString(),
      destinationChainId,
    ),
    messageHash: preprocessed.messageHash,
  } as Omit<across.interfaces.RelayData, "message">;

  const internalHash = getInternalHash(
    relayData,
    preprocessed.messageHash,
    Number(destinationChainId),
  );

  // Transform addresses
  const relayer = transformAddress(
    preprocessed.relayer.toString(),
    Number(preprocessed.repaymentChainId),
  );
  const updatedRecipient = transformAddress(
    preprocessed.relayExecutionInfo.updatedRecipient.toString(),
    Number(destinationChainId),
  );

  return {
    ...base,
    internalHash,
    depositId: preprocessed.depositId.toString(),
    originChainId: preprocessed.originChainId.toString(),
    destinationChainId: destinationChainId.toString(),
    depositor: formatFromAddressToChainFormat(
      relayData.depositor,
      originChainId,
    ),
    recipient: formatFromAddressToChainFormat(
      relayData.recipient,
      destinationChainId,
    ),
    inputToken: formatFromAddressToChainFormat(
      relayData.inputToken,
      originChainId,
    ),
    inputAmount: relayData.inputAmount.toString(),
    outputToken: formatFromAddressToChainFormat(
      relayData.outputToken,
      destinationChainId,
    ),
    outputAmount: relayData.outputAmount.toString(),
    message: preprocessed.messageHash,
    exclusiveRelayer: formatFromAddressToChainFormat(
      relayData.exclusiveRelayer,
      destinationChainId,
    ),
    exclusivityDeadline:
      preprocessed.exclusivityDeadline === 0
        ? undefined
        : new Date(preprocessed.exclusivityDeadline * 1000),
    fillDeadline: new Date(preprocessed.fillDeadline * 1000),
    relayer,
    repaymentChainId: Number(preprocessed.repaymentChainId),
    updatedRecipient,
    updatedMessage: preprocessed.relayExecutionInfo.updatedMessageHash,
    updatedOutputAmount:
      preprocessed.relayExecutionInfo.updatedOutputAmount.toString(),
    fillType: preprocessed.relayExecutionInfo.fillType,
  };
};

/**
 * Transforms a raw `V3FundsDeposited` event payload into a partial `V3FundsDeposited` entity.
 *
 * @param preprocessed The preprocessed event arguments.
 * @param payload The event payload containing the raw log.
 * @param logger The logger instance.
 * @returns A partial `V3FundsDeposited` entity ready for storage.
 */
export const transformV3FundsDepositedEvent = (
  preprocessed: V3FundsDepositedArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): Partial<entities.V3FundsDeposited> => {
  const base = baseTransformer(payload, logger);
  const originChainId = Number(base.chainId);
  const destinationChainId = Number(preprocessed.destinationChainId);
  const messageHash = across.utils.getMessageHash(preprocessed.message);

  const relayData = {
    originChainId,
    depositId: BigNumber.from(preprocessed.depositId),
    inputToken: across.utils.toAddressType(
      preprocessed.inputToken.toString(),
      originChainId,
    ),
    outputToken: across.utils.toAddressType(
      preprocessed.outputToken.toString(),
      destinationChainId,
    ),
    inputAmount: BigNumber.from(preprocessed.inputAmount),
    outputAmount: BigNumber.from(preprocessed.outputAmount),
    fillDeadline: preprocessed.fillDeadline,
    exclusivityDeadline: preprocessed.exclusivityDeadline,
    exclusiveRelayer: across.utils.toAddressType(
      preprocessed.exclusiveRelayer.toString(),
      destinationChainId,
    ),
    depositor: across.utils.toAddressType(
      preprocessed.depositor.toString(),
      originChainId,
    ),
    recipient: across.utils.toAddressType(
      preprocessed.recipient.toString(),
      destinationChainId,
    ),
    message: preprocessed.message,
  } as across.interfaces.RelayData;

  const internalHash = getInternalHash(
    relayData,
    messageHash,
    destinationChainId,
  );

  const relayHash = across.utils.getRelayHashFromEvent({
    ...relayData,
    destinationChainId,
  });

  return {
    ...base,
    internalHash,
    relayHash,
    depositId: preprocessed.depositId.toString(),
    originChainId: originChainId.toString(),
    destinationChainId: destinationChainId.toString(),
    depositor: formatFromAddressToChainFormat(
      relayData.depositor,
      originChainId,
    ),
    recipient: formatFromAddressToChainFormat(
      relayData.recipient,
      destinationChainId,
    ),
    inputToken: formatFromAddressToChainFormat(
      relayData.inputToken,
      originChainId,
    ),
    inputAmount: relayData.inputAmount.toString(),
    outputToken: formatFromAddressToChainFormat(
      relayData.outputToken,
      destinationChainId,
    ),
    outputAmount: relayData.outputAmount.toString(),
    quoteTimestamp: new Date(preprocessed.quoteTimestamp * 1000),
    fillDeadline: new Date(preprocessed.fillDeadline * 1000),
    exclusivityDeadline:
      preprocessed.exclusivityDeadline === 0
        ? undefined
        : new Date(preprocessed.exclusivityDeadline * 1000),
    exclusiveRelayer: formatFromAddressToChainFormat(
      relayData.exclusiveRelayer,
      destinationChainId,
    ),
    message: preprocessed.message,
    fromLiteChain: false,
    toLiteChain: false,
  };
};

/**
 * Transforms a raw `ExecutedRelayerRefundRoot` event payload into a partial `ExecutedRelayerRefundRoot` entity.
 *
 * @param preprocessed The preprocessed event arguments.
 * @param payload The event payload containing the raw log.
 * @param logger The logger instance.
 * @returns A partial `ExecutedRelayerRefundRoot` entity ready for storage.
 */
export const transformExecutedRelayerRefundRootEvent = (
  preprocessed: ExecutedRelayerRefundRootArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): Partial<entities.ExecutedRelayerRefundRoot> => {
  const base = baseTransformer(payload, logger);
  const chainId = Number(base.chainId);

  return {
    ...base,
    chainId: preprocessed.chainId.toString(),
    rootBundleId: preprocessed.rootBundleId,
    leafId: preprocessed.leafId,
    l2TokenAddress: transformAddress(preprocessed.l2TokenAddress, chainId),
    amountToReturn: preprocessed.amountToReturn.toString(),
    refundAmounts: preprocessed.refundAmounts.map((amount) =>
      amount.toString(),
    ),
    refundAddresses: preprocessed.refundAddresses.map((address) =>
      transformAddress(address, chainId),
    ),
    deferredRefunds: preprocessed.deferredRefunds,
    caller: transformAddress(preprocessed.caller, chainId),
  };
};

export const transformRequestedSpeedUpV3DepositEvent = (
  preprocessed: RequestedSpeedUpV3DepositArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): Partial<entities.RequestedSpeedUpV3Deposit> => {
  const base = baseTransformer(payload, logger);
  const chainId = Number(base.chainId);

  return {
    ...base,
    originChainId: base.chainId.toString(),
    depositId: preprocessed.depositId.toString(),
    depositor: transformAddress(preprocessed.depositor, chainId),
    updatedRecipient: transformAddress(preprocessed.updatedRecipient, chainId),
    updatedMessage: preprocessed.updatedMessage,
    updatedOutputAmount: preprocessed.updatedOutputAmount.toString(),
    depositorSignature: preprocessed.depositorSignature,
  };
};

/**
 * Transforms a raw `RelayedRootBundle` event payload into a partial `RelayedRootBundle` entity.
 *
 * @param preprocessed The preprocessed event arguments.
 * @param payload The event payload containing the raw log.
 * @param logger The logger instance.
 * @returns A partial `RelayedRootBundle` entity ready for storage.
 */
export const transformRelayedRootBundleEvent = (
  preprocessed: RelayedRootBundleArgs,
  payload: IndexerEventPayload,
  logger: Logger,
): Partial<entities.RelayedRootBundle> => {
  const base = baseTransformer(payload, logger);

  return {
    ...base,
    rootBundleId: preprocessed.rootBundleId,
    relayerRefundRoot: preprocessed.relayerRefundRoot,
    slowRelayRoot: preprocessed.slowRelayRoot,
  };
};
