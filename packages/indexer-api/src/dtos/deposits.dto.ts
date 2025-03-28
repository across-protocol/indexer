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
  limit: s.defaulted(stringToInt, 50),
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
