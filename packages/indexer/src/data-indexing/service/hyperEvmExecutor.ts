import {
  FallbackHyperEVMFlowCompletedLog,
  SimpleTransferFlowCompletedLog,
} from "../model";
import { entities } from "@repo/indexer-database";

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
});
