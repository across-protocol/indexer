import * as s from "superstruct";
import { utils } from "@across-protocol/sdk";

const stringToNumber = s.coerce(s.number(), s.string(), Number);

const EthAddress: s.Struct<string> = s.define(
  "Valid Ethereum Address",
  (value) => {
    return typeof value === "string" && utils.isValidEvmAddress(value);
  },
);

// Coerce the input string into custom type
const parseAddressField = s.coerce(EthAddress, s.string(), (value) => {
  // If we can normalize it, do so.
  // If it does not fit the EthAddress type, return it as-is so the 'EthAddress' check fails naturally.
  if (utils.isValidEvmAddress(value)) {
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
