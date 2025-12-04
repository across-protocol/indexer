import * as s from "superstruct";

const stringToNumber = s.coerce(s.number(), s.string(), Number);

/**
 * Represents an amount of a specific token.
 */
export const TokenAmount = s.object({
  /** The address of the token contract. */
  tokenAddress: s.string(),
  /** The total amount sponsored for the token, in its smallest unit (e.g., wei). */
  evmAmountSponsored: s.string(),
});
export type TokenAmount = s.Infer<typeof TokenAmount>;

/**
 * Represents the sponsored amounts for different tokens on a specific chain.
 */
export const ChainAmounts = s.object({
  /** The ID of the chain. */
  chainId: s.number(),
  /** A list of token amounts sponsored on this chain. */
  finalTokens: s.array(TokenAmount),
});
export type ChainAmounts = s.Infer<typeof ChainAmounts>;

/**
 * Represents the sponsorships for a specific user, aggregated by chain.
 */
export const UserSponsorship = s.object({
  /** The address of the final recipient of the sponsorship. */
  finalRecipient: s.string(),
  /** A list of chain-specific sponsorship amounts for the user. */
  sponsorships: s.array(ChainAmounts),
});

/**
 * Represents the activation of a user account.
 */
export const AccountActivation = s.object({
  /** The address of the user whose account was activated. */
  finalRecipient: s.string(),
});
export type UserSponsorship = s.Infer<typeof UserSponsorship>;

/**
 * DTO for querying sponsorships within a given time range.
 */
export const GetSponsorshipsDto = s.object({
  /** Optional start of the time range (Unix timestamp). */
  fromTimestamp: s.optional(stringToNumber),
  /** Optional end of the time range (Unix timestamp). */
  toTimestamp: s.optional(stringToNumber),
});
export type GetSponsorshipsDto = s.Infer<typeof GetSponsorshipsDto>;

/**
 * DTO for the comprehensive sponsorship report.
 */
export const SponsorshipDto = s.object({
  /** Aggregated sponsorship amounts by chain and then by token. */
  totalSponsorships: s.array(ChainAmounts),

  /** Sponsorships aggregated by user, then by chain, and then by token. */
  userSponsorships: s.array(UserSponsorship),

  /** A list of accounts activated within the given timeframe. */
  accountActivations: s.array(AccountActivation),
});
export type SponsorshipDto = s.Infer<typeof SponsorshipDto>;
