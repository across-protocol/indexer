import * as s from "superstruct";
import { utils } from "@across-protocol/sdk";

const stringToNumber = s.coerce(s.number(), s.string(), (value) => {
  if (!/^\d+$/.test(value)) {
    return value;
  }
  return parseInt(value, 10);
});

const parseAddressField = s.coerce(s.string(), s.string(), (value) => {
  if (utils.isValidEvmAddress(value.toLowerCase())) {
    return utils.toEvmAddress(value.toLowerCase());
  }
  return value;
});

export const GetSponsorshipsDto = s.object({
  address: s.optional(parseAddressField),
  fromTimestamp: s.optional(stringToNumber),
  toTimestamp: s.optional(stringToNumber),
});
export type GetSponsorshipsDto = s.Infer<typeof GetSponsorshipsDto>;

const SponsorshipUserStats = s.object({
  userAddress: s.string(),
  userSponsoredAmount: s.string(),
  tokenAddress: s.string(),
});
export type SponsorshipUserStats = s.Infer<typeof SponsorshipUserStats>;

const SponsorshipStats = s.object({
  sponsoredAmount: s.string(),
  tokenAddress: s.string(),
});
export type SponsorshipStats = s.Infer<typeof SponsorshipStats>;

const AccountActivationStats = s.object({
  userAddress: s.string(),
  sponsoredAmount: s.string(),
  tokenAddress: s.string(),
});
export type AccountActivationStats = s.Infer<typeof AccountActivationStats>;

const ChainSponsorshipStats = s.record(
  s.string(),
  s.object({
    sponsorships: s.array(SponsorshipStats),
    userSponsorships: s.optional(s.array(SponsorshipUserStats)),
    accountActivations: s.array(AccountActivationStats),
  }),
);
export type ChainSponsorshipStats = s.Infer<typeof ChainSponsorshipStats>;

export const SponsorshipDto = s.object({
  sponsorships: s.array(SponsorshipStats),
  userSponsorships: s.optional(s.array(SponsorshipUserStats)),
  accountActivations: s.array(AccountActivationStats),
  perChain: ChainSponsorshipStats,
});
export type SponsorshipDto = s.Infer<typeof SponsorshipDto>;
