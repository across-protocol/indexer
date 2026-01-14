import {
  FillWithBlock,
  DepositWithBlock,
} from "@across-protocol/sdk/dist/cjs/interfaces/SpokePool";
import { EventArgs } from "./eventTypes";

/**
 * Preprocessed args for FilledV3Relay event, matching the SDK's FillWithBlock.
 */
export type PreprocessedFilledV3RelayArgs = FillWithBlock & {
  fromLiteChain: boolean;
  toLiteChain: boolean;
};

/**
 * Preprocessed args for V3FundsDeposited event, matching the SDK's DepositWithBlock.
 */
export type PreprocessedV3FundsDepositedArgs = DepositWithBlock & {
  transactionHash: string;
  logIndex: number;
};

export type PreprocessedTypes =
  | PreprocessedFilledV3RelayArgs
  | PreprocessedV3FundsDepositedArgs
  | EventArgs;
