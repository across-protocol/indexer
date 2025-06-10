import * as s from "superstruct";
import { utils } from "@across-protocol/sdk";
import { entities } from "@repo/indexer-database";

const stringToInt = s.coerce(s.number(), s.string(), (value) => {
  // Ensure the value is a valid integer string
  if (!/^-?\d+$/.test(value)) {
    return value;
  }
  return parseInt(value, 10);
});

const parseAddressField = s.coerce(s.string(), s.string(), (value) => {
  // Try to parse as evm address
  if (utils.isValidEvmAddress(value.toLowerCase())) {
    return utils.toAddress(value.toLowerCase());
  } else {
    // Try to parse as svm address
    try {
      return utils.SvmAddress.from(value).toBase58();
    } catch (error) {
      // Otherwise use original value
      return value;
    }
  }
});

export const DepositsParams = s.object({
  depositor: s.optional(parseAddressField),
  recipient: s.optional(parseAddressField),
  originChainId: s.optional(stringToInt),
  destinationChainId: s.optional(stringToInt),
  inputToken: s.optional(parseAddressField),
  outputToken: s.optional(parseAddressField),
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
  originChainId: string;
  destinationChainId: string;
  depositor: string;
  recipient: string;
  inputToken: string;
  inputAmount: string;
  outputToken: string;
  outputAmount: string;
  message: string;
  messageHash?: string;
  exclusiveRelayer: string;
  exclusivityDeadline?: Date;
  fillDeadline: Date;
  quoteTimestamp: Date;

  depositTxHash: string; // Renamed from depositTransactionHash
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
  fillTx?: string; // Renamed from fillTransactionHash

  // from swap
  swapTransactionHash?: string;
  swapToken?: string;
  swapTokenAmount?: string;

  speedups?: {
    transactionHash: string;
    updatedRecipient: string;
    updatedOutputAmount: string;
    updatedMessage: string;
    blockNumber: number;
  }[];
};

// Add new type for parsed deposits
export type ParsedDepositReturnType = Omit<
  DepositReturnType,
  "originChainId" | "destinationChainId"
> & {
  originChainId: number;
  destinationChainId: number;
};

// Define a type for the pagination information
export type PaginationInfo = {
  currentIndex: number;
  maxIndex: number;
};

// Define a type for the deposit status response
export type DepositStatusResponse = {
  status: string | entities.RelayStatus;
  originChainId: number;
  depositId: string;
  depositTxHash: string | null;
  fillTx: string | undefined;
  destinationChainId: number;
  depositRefundTxHash: string | undefined;
  pagination: PaginationInfo;
};
