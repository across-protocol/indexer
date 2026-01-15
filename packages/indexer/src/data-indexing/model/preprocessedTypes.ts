import {
  FillWithBlock,
  DepositWithBlock,
} from "@across-protocol/sdk/dist/cjs/interfaces/SpokePool";
import { EventArgs } from "./eventTypes";

/**
 * Preprocessed args for FilledV3Relay event, matching the SDK's FillWithBlock.
 */
export type PreprocessedFilledV3RelayArgs = FillWithBlock;

/**
 * Preprocessed args for V3FundsDeposited event, matching the SDK's DepositWithBlock.
 */
export type PreprocessedV3FundsDepositedArgs = DepositWithBlock;

export type PreprocessedTypes = EventArgs
  | PreprocessedFilledV3RelayArgs
  | PreprocessedV3FundsDepositedArgs;
