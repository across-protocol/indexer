import * as s from "superstruct";

const stringToInt = s.coerce(s.number(), s.string(), (value) => {
  // Ensure the value is a valid integer string
  if (!/^-?\d+$/.test(value)) {
    return value;
  }
  return parseInt(value, 10);
});

export const UnmatchedFillsParams = s.object({
  originChainId: s.optional(stringToInt),
  destinationChainId: s.optional(stringToInt),
  startTimestamp: s.optional(stringToInt),
  endTimestamp: s.optional(stringToInt),
  relayer: s.optional(s.string()),
  skip: s.defaulted(stringToInt, 0),
  limit: s.refine(
    s.defaulted(stringToInt, 50),
    "maxLimit",
    (value) => value <= 1000 || "Limit must not exceed 1000",
  ),
});

export type UnmatchedFillsParams = s.Infer<typeof UnmatchedFillsParams>;
