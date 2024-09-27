import * as s from "superstruct";

// query hub pools by chainId? default to 1 if not specified. will leave option in case of testnets?
export const HubPoolBalanceParams = s.object({
  chainId: s.defaulted(s.number(), 1),
  l1Token: s.string(),
});

// query spokepools by chainId, must specify
export const SpokePoolBalanceParams = s.object({
  chainId: s.number(),
  // unsure why we have timestamp, implies we are storign history of balances? this is in the spec.
  timestamp: s.number(),
  // unsure why specified as l2Token in spec, don't we have spoke pool on L1?
  l2Token: s.optional(s.number()),
});
