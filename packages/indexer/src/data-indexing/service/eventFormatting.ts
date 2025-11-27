import {
  ArbitraryActionsExecutedLog,
  FallbackHyperEVMFlowCompletedLog,
  SimpleTransferFlowCompletedLog,
  SponsoredAccountActivationLog,
} from "../model";
import { entities } from "@repo/indexer-database";
import {
  OFTSentEvent,
  OFTReceivedEvent,
  SponsoredOFTSendLog,
} from "../adapter/oft/model";
import { formatFromAddressToChainFormat } from "../../utils";
import * as across from "@across-protocol/sdk";

type FormatEventArgs = {
  finalised: boolean;
  blockTimestamp: Date;
  chainId: number;
  tokenAddress?: string;
};

/**
 * Formats a SponsoredAccountActivationLog event into a partial SponsoredAccountActivation entity.
 * @param event The SponsoredAccountActivationLog event to format.
 * @param args An object containing additional arguments for formatting.
 * @returns A partial SponsoredAccountActivation entity.
 */
export const formatSponsoredAccountActivationEvent = (
  event: SponsoredAccountActivationLog,
  args: FormatEventArgs,
): Partial<entities.SponsoredAccountActivation> => {
  const { finalised, blockTimestamp, chainId } = args;
  return {
    blockNumber: event.blockNumber,
    logIndex: event.logIndex,
    transactionHash: event.transactionHash,
    transactionIndex: event.transactionIndex,
    blockTimestamp: blockTimestamp,
    chainId: chainId.toString(),
    quoteNonce: event.args.quoteNonce,
    finalRecipient: event.args.finalRecipient,
    fundingToken: event.args.fundingToken,
    evmAmountSponsored: event.args.evmAmountSponsored.toString(),
    finalised,
  };
};

/**
 * Formats a SimpleTransferFlowCompletedLog event into a partial SimpleTransferFlowCompleted entity.
 * @param event The SimpleTransferFlowCompletedLog event to format.
 * @param args An object containing additional arguments for formatting.
 * @returns A partial SimpleTransferFlowCompleted entity.
 */
export const formatSimpleTransferFlowCompletedEvent = (
  event: SimpleTransferFlowCompletedLog,
  args: FormatEventArgs,
): Partial<entities.SimpleTransferFlowCompleted> => {
  const { finalised, blockTimestamp, chainId } = args;
  return {
    blockNumber: event.blockNumber,
    logIndex: event.logIndex,
    transactionHash: event.transactionHash,
    transactionIndex: event.transactionIndex,
    blockTimestamp: blockTimestamp,
    chainId: chainId.toString(),
    quoteNonce: event.args.quoteNonce,
    finalRecipient: event.args.finalRecipient,
    finalToken: event.args.finalToken.toString(),
    evmAmountIn: event.args.evmAmountIn.toString(),
    bridgingFeesIncurred: event.args.bridgingFeesIncurred.toString(),
    evmAmountSponsored: event.args.evmAmountSponsored.toString(),
    finalised,
  };
};

/**
 * Formats an ArbitraryActionsExecutedLog event into a partial ArbitraryActionsExecuted entity.
 * @param event The ArbitraryActionsExecutedLog event to format.
 * @param args An object containing additional arguments for formatting.
 * @returns A partial ArbitraryActionsExecuted entity.
 */
export const formatArbitraryActionsExecutedEvent = (
  event: ArbitraryActionsExecutedLog,
  args: FormatEventArgs,
): Partial<entities.ArbitraryActionsExecuted> => {
  const { finalised, blockTimestamp, chainId } = args;
  return {
    blockNumber: event.blockNumber,
    logIndex: event.logIndex,
    transactionHash: event.transactionHash,
    transactionIndex: event.transactionIndex,
    blockTimestamp: blockTimestamp,
    chainId: chainId.toString(),
    quoteNonce: event.args.quoteNonce,
    initialToken: event.args.initialToken,
    initialAmount: event.args.initialAmount.toString(),
    finalToken: event.args.finalToken,
    finalAmount: event.args.finalAmount.toString(),
    finalised,
  };
};

/**
 * Formats a FallbackHyperEVMFlowCompletedLog event into a partial FallbackHyperEVMFlowCompleted entity.
 * @param event The FallbackHyperEVMFlowCompletedLog event to format.
 * @param args An object containing additional arguments for formatting.
 * @returns A partial FallbackHyperEVMFlowCompleted entity.
 */
export const formatFallbackHyperEVMFlowCompletedEvent = (
  event: FallbackHyperEVMFlowCompletedLog,
  args: FormatEventArgs,
): Partial<entities.FallbackHyperEVMFlowCompleted> => {
  const { finalised, blockTimestamp, chainId } = args;
  return {
    blockNumber: event.blockNumber,
    logIndex: event.logIndex,
    transactionHash: event.transactionHash,
    transactionIndex: event.transactionIndex,
    blockTimestamp: blockTimestamp,
    chainId: chainId.toString(),
    quoteNonce: event.args.quoteNonce,
    finalRecipient: event.args.finalRecipient,
    finalToken: event.args.finalToken.toString(),
    evmAmountIn: event.args.evmAmountIn.toString(),
    bridgingFeesIncurred: event.args.bridgingFeesIncurred.toString(),
    evmAmountSponsored: event.args.evmAmountSponsored.toString(),
    finalised,
  };
};

/**
 * Formats an OFTSentEvent into a partial OFTSent entity.
 * @param event The OFTSentEvent to format.
 * @param args An object containing additional arguments for formatting.
 * @returns A partial OFTSent entity.
 */
export function formatOftSentEvent(
  event: OFTSentEvent,
  args: FormatEventArgs,
): Partial<entities.OFTSent> {
  const { finalised, blockTimestamp, chainId, tokenAddress } = args;
  return {
    blockHash: event.blockHash,
    blockNumber: event.blockNumber,
    logIndex: event.logIndex,
    transactionHash: event.transactionHash,
    transactionIndex: event.transactionIndex,
    blockTimestamp,
    chainId: chainId.toString(),
    guid: event.args.guid,
    dstEid: event.args.dstEid,
    fromAddress: event.args.fromAddress,
    amountSentLD: event.args.amountSentLD.toString(),
    amountReceivedLD: event.args.amountReceivedLD.toString(),
    token: tokenAddress,
    finalised,
  };
}

/**
 * Formats an OFTReceivedEvent into a partial OFTReceived entity.
 * @param event The OFTReceivedEvent to format.
 * @param args An object containing additional arguments for formatting.
 * @returns A partial OFTReceived entity.
 */
export function formatOftReceivedEvent(
  event: OFTReceivedEvent,
  args: FormatEventArgs,
): Partial<entities.OFTReceived> {
  const { finalised, blockTimestamp, chainId, tokenAddress } = args;
  return {
    blockHash: event.blockHash,
    blockNumber: event.blockNumber,
    logIndex: event.logIndex,
    transactionHash: event.transactionHash,
    transactionIndex: event.transactionIndex,
    blockTimestamp,
    chainId: chainId.toString(),
    guid: event.args.guid,
    srcEid: event.args.srcEid,
    toAddress: event.args.toAddress,
    amountReceivedLD: event.args.amountReceivedLD.toString(),
    token: tokenAddress,
    finalised,
  };
}

/**
 * Formats a SponsoredOFTSendLog event into a partial SponsoredOFTSend entity.
 * @param event The SponsoredOFTSendLog event to format.
 * @param args An object containing additional arguments for formatting.
 * @returns A partial SponsoredOFTSend entity.
 */
export function formatSponsoredOftSendEvent(
  event: SponsoredOFTSendLog,
  args: FormatEventArgs,
): Partial<entities.SponsoredOFTSend> {
  const { finalised, blockTimestamp, chainId } = args;
  const finalRecipientAddressType = across.utils.toAddressType(
    event.args.finalRecipient,
    chainId,
  );
  const finalRecipient = formatFromAddressToChainFormat(
    finalRecipientAddressType,
    chainId,
  );

  return {
    blockNumber: event.blockNumber,
    logIndex: event.logIndex,
    transactionHash: event.transactionHash,
    transactionIndex: event.transactionIndex,
    blockTimestamp,
    chainId: chainId.toString(),
    quoteNonce: event.args.quoteNonce,
    originSender: event.args.originSender,
    finalRecipient: finalRecipient,
    destinationHandler: event.args.destinationHandler,
    quoteDeadline: new Date(event.args.quoteDeadline.toNumber() * 1000),
    maxBpsToSponsor: event.args.maxBpsToSponsor.toString(),
    maxUserSlippageBps: event.args.maxUserSlippageBps.toString(),
    finalToken: event.args.finalToken,
    sig: event.args.sig,
    finalised,
  };
}
