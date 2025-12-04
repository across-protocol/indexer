import * as s from "superstruct";

const stringToNumber = s.coerce(s.number(), s.string(), Number);

export const TokenAmount = s.object({
  tokenAddress: s.string(),
  evmAmountSponsored: s.string(),
});
export type TokenAmount = s.Infer<typeof TokenAmount>;

export const ChainAmounts = s.object({
  chainId: s.number(),
  finalTokens: s.array(TokenAmount),
});
export type ChainAmounts = s.Infer<typeof ChainAmounts>;

export const UserSponsorship = s.object({
  finalRecipient: s.string(),
  sponsorships: s.array(ChainAmounts),
});
export const AccountActivation = s.object({
  finalRecipient: s.string(),
});
export type UserSponsorship = s.Infer<typeof UserSponsorship>;

export const GetSponsorshipsDto = s.object({
  fromTimestamp: s.optional(stringToNumber),
  toTimestamp: s.optional(stringToNumber),
});
export type GetSponsorshipsDto = s.Infer<typeof GetSponsorshipsDto>;

export const SponsorshipDto = s.object({
  // Aggregated by Chain -> Token
  totalSponsorships: s.array(ChainAmounts),

  // Aggregated by User -> Chain -> Token
  userSponsorships: s.array(UserSponsorship),

  // Accounts created in the given timeframe
  accountActivations: s.array(AccountActivation),
});
export type SponsorshipDto = s.Infer<typeof SponsorshipDto>;
