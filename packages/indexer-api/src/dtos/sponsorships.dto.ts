import * as s from "superstruct";

const stringToNumber = s.coerce(s.number(), s.string(), Number);

// Create a Refinement to validate the number
const UnixTimestampMs = s.refine(stringToNumber, "UnixTimestamp", (value) => {
  // Check 1: Must be an integer (no decimals)
  if (!Number.isInteger(value)) {
    return "Timestamp must be an integer";
  }

  // Check 2: Must be positive
  if (value < 0) {
    return "Timestamp must be positive";
  }

  // 13 digits range:
  // Min: 1,000,000,000,000 (Sep 09 2001)
  // Max: 9,999,999,999,999 (Nov 20 2286)
  if (value < 1_000_000_000_000 || value > 9_999_999_999_999) {
    return "Timestamp must be in milliseconds (13 digits)";
  }

  // Check 3: Must be a valid date in JS
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return "Invalid Date";
  }

  return true;
});

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
  fromTimestamp:
    s.optional(
      UnixTimestampMs,
    ) /** Optional end of the time range (Unix timestamp). */,
  toTimestamp: s.optional(UnixTimestampMs),
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
