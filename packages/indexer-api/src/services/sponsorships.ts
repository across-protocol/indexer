import { DataSource } from "typeorm";
import {
  GetSponsorshipsDto,
  SponsorshipDto,
  ChainAmounts,
  UserSponsorship,
} from "../dtos/sponsorships.dto";
import winston from "winston";
import { entities } from "@repo/indexer-database";

/**
 * Represents a raw row from the sponsorship volume query.
 * @internal
 */
type RawSponsorshipRow = {
  chainId: number;
  tokenAddress: string;
  totalSponsored: string;
};

/**
 * Represents a raw row from the user-specific sponsorship volume query.
 * @internal
 */
type RawUserSponsorshipRow = RawSponsorshipRow & {
  finalRecipient: string;
};

/**
 * Service for handling business logic related to sponsorships.
 */
export class SponsorshipsService {
  private readonly logger: winston.Logger;

  /**
   * @param {DataSource} db The data source for database access.
   */
  constructor(private readonly db: DataSource) {
    this.logger = winston.createLogger({
      level: "info",
      format: winston.format.json(),
      transports: [new winston.transports.Console()],
    });
  }

  /**
   * Retrieves and aggregates sponsorship data based on the provided parameters.
   * It fetches total sponsored volume, user-specific volume, and account activations
   * within a flexible 24-hour window.
   *
   * @param {GetSponsorshipsDto} params - The parameters for filtering the sponsorship data, including optional timestamps.
   * @returns {Promise<SponsorshipDto>} A promise that resolves to the aggregated sponsorship data.
   */
  public async getSponsorships(
    params: GetSponsorshipsDto,
  ): Promise<SponsorshipDto> {
    const { fromTimestamp, toTimestamp } = params;
    const twentyFourHoursInMs = 24 * 60 * 60 * 1000;
    const currentTime = Date.now();

    let startTimestamp: number;
    let endTimestamp: number;

    // Both timestamps provided: Validate duration
    if (fromTimestamp && toTimestamp) {
      endTimestamp = toTimestamp;

      const isOverLimit = toTimestamp - fromTimestamp > twentyFourHoursInMs;

      if (isOverLimit) {
        startTimestamp = toTimestamp - twentyFourHoursInMs;
        this.logger.warn({
          at: "SponsorshipsService#getSponsorships",
          message:
            "Requested timeframe exceeds 24 hours. Adjusting to 24 hours ending at toTimestamp.",
          requestedFrom: new Date(fromTimestamp).toISOString(),
          requestedTo: new Date(toTimestamp).toISOString(),
        });
      } else {
        startTimestamp = fromTimestamp;
      }
    }
    // Only 'from' provided: Look forward 24 hours
    else if (fromTimestamp) {
      startTimestamp = fromTimestamp;
      endTimestamp = fromTimestamp + twentyFourHoursInMs;
    }
    // Only 'to' (or nothing) provided: Look backward 24 hours
    else {
      endTimestamp = toTimestamp || currentTime;
      startTimestamp = endTimestamp - twentyFourHoursInMs;
    }

    const startDate = new Date(startTimestamp);
    const endDate = new Date(endTimestamp);

    // Parallel Data Fetching
    const [sponsorships, userSponsorships, accountActivations] =
      await Promise.all([
        this.getSponsoredVolume(startDate, endDate),
        this.getAllUserSponsoredVolume(startDate, endDate),
        this.getAccountActivations(startDate, endDate),
      ]);

    // Aggregation & Formatting
    return {
      totalSponsorships: this.aggregateTotalSponsorships(sponsorships),
      userSponsorships: this.aggregateSponsorshipsByUser(userSponsorships),
      accountActivations,
    };
  }

  /**
   * Aggregates raw sponsorship data into a structured format by chain.
   * It sums up total sponsored amounts for each token on each chain.
   *
   * @param {RawSponsorshipRow[]} data The raw sponsorship data rows from the database.
   * @returns {ChainAmounts[]} An array of `ChainAmounts`, where each element represents a chain and its sponsored tokens.
   */
  private aggregateTotalSponsorships(
    data: RawSponsorshipRow[],
  ): ChainAmounts[] {
    const byChain = new Map<number, Map<string, bigint>>();

    for (const item of data) {
      const chainId = Number(item.chainId);
      if (!byChain.has(chainId)) {
        byChain.set(chainId, new Map<string, bigint>());
      }
      const chainMap = byChain.get(chainId)!;

      const currentAmount = chainMap.get(item.tokenAddress) || BigInt(0);
      // Ensure we handle the string-to-bigint conversion safely here
      chainMap.set(
        item.tokenAddress,
        currentAmount + BigInt(item.totalSponsored),
      );
    }

    return Array.from(byChain.entries()).map(([chainId, tokens]) => ({
      chainId,
      finalTokens: Array.from(tokens.entries()).map(
        ([tokenAddress, totalSponsoredAmount]) => ({
          tokenAddress: tokenAddress,
          evmAmountSponsored: totalSponsoredAmount.toString(),
        }),
      ),
    }));
  }

  /**
   * Aggregates raw user sponsorship data by user, and then by chain.
   *
   * @param {RawUserSponsorshipRow[]} data The raw user-specific sponsorship data rows.
   * @returns {UserSponsorship[]} An array of `UserSponsorship`, structured by user and their activities across chains.
   */
  private aggregateSponsorshipsByUser(
    data: RawUserSponsorshipRow[],
  ): UserSponsorship[] {
    // userAddress -> chainId -> tokenAddress -> amount
    const byUser = new Map<string, Map<number, Map<string, bigint>>>();

    for (const item of data) {
      const finalRecipient = item.finalRecipient;
      if (!byUser.has(finalRecipient)) {
        byUser.set(finalRecipient, new Map<number, Map<string, bigint>>());
      }
      const userMap = byUser.get(finalRecipient)!;

      const chainId = Number(item.chainId);
      if (!userMap.has(chainId)) {
        userMap.set(chainId, new Map<string, bigint>());
      }
      const chainMap = userMap.get(chainId)!;

      const currentAmount = chainMap.get(item.tokenAddress) || BigInt(0);
      chainMap.set(
        item.tokenAddress,
        currentAmount + BigInt(item.totalSponsored),
      );
    }

    return Array.from(byUser.entries()).map(([userAddress, chainMap]) => ({
      finalRecipient: userAddress,
      sponsorships: Array.from(chainMap.entries()).map(([chainId, tokens]) => ({
        chainId,
        finalTokens: Array.from(tokens.entries()).map(
          ([tokenAddress, amount]) => ({
            tokenAddress,
            evmAmountSponsored: amount.toString(),
          }),
        ),
      })),
    }));
  }

  /**
   * Fetches the total sponsored volume across multiple event types within a given date range.
   *
   * @param {Date} startDate The start of the date range.
   * @param {Date} endDate The end of the date range.
   * @returns {Promise<RawSponsorshipRow[]>} A promise that resolves to an array of raw sponsorship rows.
   */
  private async getSponsoredVolume(
    startDate: Date,
    endDate: Date,
  ): Promise<RawSponsorshipRow[]> {
    const types = [
      entities.SwapFlowFinalized,
      entities.SimpleTransferFlowCompleted,
      entities.FallbackHyperEVMFlowCompleted,
    ];

    const promises = types.map((entity) =>
      this.db
        .getRepository(entity)
        .createQueryBuilder("event")
        .select(`"event"."chainId"`, "chainId")
        .addSelect(`"event"."finalToken"`, "tokenAddress")
        .addSelect(
          `SUM("event"."evmAmountSponsored"::numeric)`,
          "totalSponsored",
        )
        .where(`"event"."blockTimestamp" BETWEEN :startDate AND :endDate`, {
          startDate,
          endDate,
        })
        .groupBy(`"event"."chainId", "event"."finalToken"`)
        .getRawMany(),
    );

    // Flatten results because we queried 3 different tables.
    // The aggregator will sum them up if the same token appears in multiple tables.
    return (await Promise.all(promises)).flat();
  }

  /**
   * Fetches the sponsored volume for each user across multiple event types within a given date range.
   *
   * @param {Date} startDate The start of the date range.
   * @param {Date} endDate The end of the date range.
   * @returns {Promise<RawUserSponsorshipRow[]>} A promise that resolves to an array of raw, user-specific sponsorship rows.
   */
  private async getAllUserSponsoredVolume(
    startDate: Date,
    endDate: Date,
  ): Promise<RawUserSponsorshipRow[]> {
    const types = [
      entities.SwapFlowFinalized,
      entities.SimpleTransferFlowCompleted,
      entities.FallbackHyperEVMFlowCompleted,
    ];

    const promises = types.map((entity) =>
      this.db
        .getRepository(entity)
        .createQueryBuilder("event")
        .select(`"event"."chainId"`, "chainId")
        .addSelect(`"event"."finalRecipient"`, "finalRecipient")
        .addSelect(`"event"."finalToken"`, "tokenAddress")
        .addSelect(
          `SUM("event"."evmAmountSponsored"::numeric)`,
          "totalSponsored",
        )
        .where(`"event"."blockTimestamp" BETWEEN :startDate AND :endDate`, {
          startDate,
          endDate,
        })
        .groupBy(
          `"event"."chainId", "event"."finalRecipient", "event"."finalToken"`,
        )
        .getRawMany(),
    );

    return (await Promise.all(promises)).flat();
  }

  /**
   * Fetches the unique accounts that were activated within a given date range.
   *
   * @param {Date} startDate The start of the date range.
   * @param {Date} endDate The end of the date range.
   * @returns {Promise<{ finalRecipient: string }[]>} A promise that resolves to an array of objects, each containing a `finalRecipient` address.
   */
  private async getAccountActivations(
    startDate: Date,
    endDate: Date,
  ): Promise<{ finalRecipient: string }[]> {
    const rows = await this.db
      .getRepository(entities.SponsoredAccountActivation)
      .createQueryBuilder("event")
      // We only care about unique users, regardless of chain or token
      .select(`DISTINCT "event"."finalRecipient"`, "finalRecipient")
      .where(`"event"."blockTimestamp" BETWEEN :startDate AND :endDate`, {
        startDate,
        endDate,
      })
      .getRawMany();

    return rows.map((row) => ({ finalRecipient: row.finalRecipient }));
  }
}
