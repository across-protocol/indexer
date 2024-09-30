import * as s from "superstruct";

const stringToInt = s.coerce(s.number(), s.string(), (value) =>
  parseInt(value),
);

export const DepositsParams = s.object({
  depositor: s.optional(s.string()),
  recipient: s.optional(s.string()),
  inputToken: s.optional(s.string()),
  outputToken: s.optional(s.string()),
  integrator: s.optional(s.string()),
  status: s.optional(s.string()),
  // some kind of pagination options, skip could be the start point
  skip: s.optional(stringToInt),
  // pagination limit, how many to return after the start, note we convert string to number
  limit: s.optional(stringToInt),
});

export type DepositsParams = s.Infer<typeof DepositsParams>;

export const DepositParams = s.object({
  depositId: s.optional(stringToInt),
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