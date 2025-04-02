import * as s from "superstruct";
import { entities } from "@repo/indexer-database";

const stringToInt = s.coerce(s.number(), s.string(), (value) => {
  // Ensure the value is a valid integer string
  if (!/^-?\d+$/.test(value)) {
    return value;
  }
  return parseInt(value, 10);
});

export const DepositsParams = s.object({
  depositor: s.optional(s.string()),
  recipient: s.optional(s.string()),
  originChainId: s.optional(stringToInt),
  destinationChainId: s.optional(stringToInt),
  inputToken: s.optional(s.string()),
  outputToken: s.optional(s.string()),
  integratorId: s.optional(s.string()),
  status: s.optional(s.enums(Object.values(entities.RelayStatus))),
  // some kind of pagination options, skip could be the start point
  skip: s.optional(stringToInt),
  // pagination limit, how many to return after the start, note we convert string to number
  limit: s.refine(
    s.defaulted(stringToInt, 50),
    "maxLimit",
    (value) => value <= 1000 || "Limit must not exceed 1000",
  ),
});

export type DepositsParams = s.Infer<typeof DepositsParams>;

export const DepositParams = s.object({
  depositId: s.optional(s.string()),
  originChainId: s.optional(stringToInt),
  depositTxHash: s.optional(s.string()),
  relayDataHash: s.optional(s.string()),
  index: s.refine(
    s.defaulted(stringToInt, 0),
    "positiveIndex",
    (value) => value >= 0,
  ),
});

export type DepositParams = s.Infer<typeof DepositParams>;

export const FilterDepositsParams = s.object({
  originChainId: s.optional(stringToInt),
  destinationChainId: s.optional(stringToInt),
  startTimestamp: s.optional(stringToInt),
  endTimestamp: s.optional(stringToInt),
  skip: s.defaulted(stringToInt, 0),
  limit: s.refine(
    s.defaulted(stringToInt, 50),
    "maxLimit",
    (value) => value <= 1000 || "Limit must not exceed 1000",
  ),
  minSecondsToFill: s.optional(stringToInt),
});

export type FilterDepositsParams = s.Infer<typeof FilterDepositsParams>;

export type DepositReturnType = {
  // Fields from V3FundsDeposited
  id: number;
  relayHash: string;
  depositId: string;
  originChainId: number;
  destinationChainId: number;
  fromLiteChain: boolean;
  toLiteChain: boolean;
  depositor: string;
  recipient: string;
  inputToken: string;
  inputAmount: string;
  outputToken: string;
  outputAmount: string;
  message: string;
  messageHash?: string;
  internalHash: string;
  exclusiveRelayer: string;
  exclusivityDeadline?: Date;
  fillDeadline: Date;
  quoteTimestamp: Date;
  integratorId?: string;

  depositTransactionHash: string;
  depositTransactionIndex: number;
  depositLogIndex: number;
  depositBlockNumber: number;
  depositBlockTimestamp?: Date;

  // Fields from RelayHashInfo
  status: entities.RelayStatus;
  depositRefundTxHash?: string;
  swapTokenPriceUsd?: string;
  swapFeeUsd?: string;
  bridgeFeeUsd?: string;
  inputPriceUsd?: string;
  outputPriceUsd?: string;
  fillGasFee?: string;
  fillGasFeeUsd?: string;
  fillGasTokenPriceUsd?: string;

  // from fill
  relayer?: string;
  fillBlockTimestamp?: Date;
  fillTransactionHash?: string;

  // from swap
  swapTransactionHash?: string;
  swapToken?: string;
  acrossInputToken?: string;
  acrossOutputToken?: string;
  swapTokenAmount?: string;
  acrossInputAmount?: string;
  acrossOutputAmount?: string;
  exchange?: string;
};
