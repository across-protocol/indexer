import {
  ArbitraryActionsExecutedLog,
  FallbackHyperEVMFlowCompletedLog,
  SimpleTransferFlowCompletedLog,
  SponsoredAccountActivationLog,
  SwapFlowFinalizedLog,
  SwapFlowInitializedLog,
} from "../model";
import { entities } from "@repo/indexer-database";

/**
 * @constant formatSponsoredAccountActivationEvent
 * Formats a `SponsoredAccountActivationLog` event into a partial `SponsoredAccountActivation` entity.
 * @param event The `SponsoredAccountActivationLog` event to format.
 * @param finalised A boolean indicating if the event is finalized.
 * @param blockTimestamp The timestamp of the block where the event was emitted.
 * @param chainId The ID of the chain where the event was emitted.
 * @returns A partial `SponsoredAccountActivation` entity.
 */
export const formatSponsoredAccountActivationEvent = (
  event: SponsoredAccountActivationLog,
  finalised: boolean,
  blockTimestamp: Date,
  chainId: number,
): Partial<entities.SponsoredAccountActivation> => ({
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
  contractAddress: event.address,
});

/**
 * @constant formatSimpleTransferFlowCompletedEvent
 * Formats a `SimpleTransferFlowCompletedLog` event into a partial `SimpleTransferFlowCompleted` entity.
 * @param event The `SimpleTransferFlowCompletedLog` event to format.
 * @param finalised A boolean indicating if the event is finalized.
 * @param blockTimestamp The timestamp of the block where the event was emitted.
 * @param chainId The ID of the chain where the event was emitted.
 * @returns A partial `SimpleTransferFlowCompleted` entity.
 */
export const formatSimpleTransferFlowCompletedEvent = (
  event: SimpleTransferFlowCompletedLog,
  finalised: boolean,
  blockTimestamp: Date,
  chainId: number,
): Partial<entities.SimpleTransferFlowCompleted> => ({
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
  contractAddress: event.address,
});

/**
 * @constant formatArbitraryActionsExecutedEvent
 * Formats an `ArbitraryActionsExecutedLog` event into a partial `ArbitraryActionsExecuted` entity.
 * @param event The `ArbitraryActionsExecutedLog` event to format.
 * @param finalised A boolean indicating if the event is finalized.
 * @param blockTimestamp The timestamp of the block where the event was emitted.
 * @param chainId The ID of the chain where the event was emitted.
 * @returns A partial `ArbitraryActionsExecuted` entity.
 */
export const formatArbitraryActionsExecutedEvent = (
  event: ArbitraryActionsExecutedLog,
  finalised: boolean,
  blockTimestamp: Date,
  chainId: number,
): Partial<entities.ArbitraryActionsExecuted> => ({
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
  contractAddress: event.address,
});

/**
 * @constant formatFallbackHyperEVMFlowCompletedEvent
 * Formats a `FallbackHyperEVMFlowCompletedLog` event into a partial `FallbackHyperEVMFlowCompleted` entity.
 * @param event The `FallbackHyperEVMFlowCompletedLog` event to format.
 * @param finalised A boolean indicating if the event is finalized.
 * @param blockTimestamp The timestamp of the block where the event was emitted.
 * @param chainId The ID of the chain where the event was emitted.
 * @returns A partial `FallbackHyperEVMFlowCompleted` entity.
 */
export const formatFallbackHyperEVMFlowCompletedEvent = (
  event: FallbackHyperEVMFlowCompletedLog,
  finalised: boolean,
  blockTimestamp: Date,
  chainId: number,
): Partial<entities.FallbackHyperEVMFlowCompleted> => ({
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
  contractAddress: event.address,
});

/**
 * @constant formatSwapFlowInitializedEvent
 * Formats a `SwapFlowInitializedLog` event into a partial `SwapFlowInitialized` entity.
 * @param event The `SwapFlowInitializedLog` event to format.
 * @param finalised A boolean indicating if the event is finalized.
 * @param blockTimestamp The timestamp of the block where the event was emitted.
 * @param chainId The ID of the chain where the event was emitted.
 * @returns A partial `SwapFlowInitialized` entity.
 */
export const formatSwapFlowInitializedEvent = (
  event: SwapFlowInitializedLog,
  finalised: boolean,
  blockTimestamp: Date,
  chainId: number,
): Partial<entities.SwapFlowInitialized> => ({
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
  coreAmountIn: event.args.coreAmountIn.toString(),
  minAmountToSend: event.args.minAmountToSend.toString(),
  maxAmountToSend: event.args.maxAmountToSend.toString(),
  finalised,
  contractAddress: event.address,
});

/**
 * @constant formatSwapFlowFinalizedEvent
 * Formats a `SwapFlowFinalizedLog` event into a partial `SwapFlowFinalized` entity.
 * @param event The `SwapFlowFinalizedLog` event to format.
 * @param finalised A boolean indicating if the event is finalized.
 * @param blockTimestamp The timestamp of the block where the event was emitted.
 * @param chainId The ID of the chain where the event was emitted.
 * @returns A partial `SwapFlowFinalized` entity.
 */
export const formatSwapFlowFinalizedEvent = (
  event: SwapFlowFinalizedLog,
  finalised: boolean,
  blockTimestamp: Date,
  chainId: number,
): Partial<entities.SwapFlowFinalized> => ({
  blockNumber: event.blockNumber,
  logIndex: event.logIndex,
  transactionHash: event.transactionHash,
  transactionIndex: event.transactionIndex,
  blockTimestamp: blockTimestamp,
  chainId: chainId.toString(),
  quoteNonce: event.args.quoteNonce,
  finalRecipient: event.args.finalRecipient,
  finalToken: event.args.finalToken,
  totalSent: event.args.totalSent.toString(),
  evmAmountSponsored: event.args.evmAmountSponsored.toString(),
  finalised,
  contractAddress: event.address,
});
