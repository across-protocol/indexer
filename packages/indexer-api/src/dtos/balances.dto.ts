import * as s from "superstruct";

// query hub pools by chainId? default to 1 if not specified. will leave option in case of testnets?
export const HubPoolBalanceQueryParams = s.object({
  l1Token: s.optional(s.string()),
});

// query spokepools by chainId, must specify
export const SpokePoolBalanceParams = s.object({
  chainId: s.number(),
  l1Token: s.optional(s.string()),
  // unsure why we have timestamp, implies we are storign history of balances? this is in the spec.
  timestamp: s.optional(s.number()),
});

export type SpokePoolBalanceResultElement = {
  lastExecutedRunningBalance: string;
  pendingRunningBalance: string | null;
  pendingNetSendAmount: string | null;
  currentRunningBalance: string;
  currentNetSendAmount: string;
};

export type SpokePoolBalanceResults = {
  [chainId: string]: SpokePoolBalanceResultElement;
};
