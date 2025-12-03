import { DataSource, In } from "typeorm";
import {
  GetSponsorshipsDto,
  SponsorshipDto,
  SponsorshipStats,
  SponsorshipUserStats,
  AccountActivationStats,
  ChainSponsorshipStats,
} from "../dtos/sponsorships.dto";
import winston from "winston";
import { entities } from "@repo/indexer-database";

/**
 * Service for handling sponsorship data.
 */
export class SponsorshipsService {
  private readonly logger: winston.Logger;

  constructor(private readonly db: DataSource) {
    this.logger = winston.createLogger({
      level: "info",
      format: winston.format.json(),
      transports: [new winston.transports.Console()],
    });
  }

  /**
   * Retrieves and aggregates sponsorship data based on the provided parameters.
   * @param params - The parameters for filtering the sponsorship data.
   * @returns The aggregated sponsorship data.
   */
  public async getSponsorships(
    params: GetSponsorshipsDto,
  ): Promise<SponsorshipDto> {
    const { address, fromTimestamp, toTimestamp } = params;
    const twentyFourHoursInMs = 24 * 60 * 60 * 1000;
    const currentTime = Date.now();

    let startTimestamp: number;
    let endTimestamp: number;

    // 1. Both timestamps provided: Validate duration
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

    const sponsorshipsPromise = this.getSponsoredVolume(startDate, endDate);
    const userSponsorshipsPromise = address
      ? this.getUserSponsoredVolume(address, startDate, endDate)
      : [];
    const accountActivationsPromise = this.getAccountActivationStats(
      startDate,
      endDate,
    );

    const [sponsorships, userSponsorships, accountActivations] =
      await Promise.all([
        sponsorshipsPromise,
        userSponsorshipsPromise,
        accountActivationsPromise,
      ]);

    const perChain: ChainSponsorshipStats = {};

    // Aggregate data per chain.
    sponsorships.forEach((s) => {
      if (!perChain[s.chainId]) {
        perChain[s.chainId] = { sponsorships: [], accountActivations: [] };
      }
      const chainStats = perChain[s.chainId];
      if (chainStats) {
        chainStats.sponsorships.push({
          sponsoredAmount: s.totalSponsored,
          tokenAddress: s.tokenAddress,
        });
      }
    });

    userSponsorships.forEach((us) => {
      if (!perChain[us.chainId]) {
        perChain[us.chainId] = { sponsorships: [], accountActivations: [] };
      }
      const chainStats = perChain[us.chainId];
      if (chainStats) {
        if (!chainStats.userSponsorships) {
          chainStats.userSponsorships = [];
        }
        chainStats.userSponsorships.push({
          userAddress: us.userAddress,
          userSponsoredAmount: us.totalSponsored,
          tokenAddress: us.tokenAddress,
        });
      }
    });

    accountActivations.forEach((aa) => {
      if (!perChain[aa.chainId]) {
        perChain[aa.chainId] = { sponsorships: [], accountActivations: [] };
      }
      const chainStats = perChain[aa.chainId];
      if (chainStats) {
        chainStats.accountActivations.push({
          userAddress: aa.userAddress,
          sponsoredAmount: aa.totalSponsored.toString(),
          tokenAddress: aa.tokenAddress,
        });
      }
    });

    // Aggregate data globally.
    const globalSponsorships: SponsorshipStats[] =
      this.aggregateGlobalSponsorships(sponsorships);
    const globalUserSponsorships: SponsorshipUserStats[] =
      this.aggregateGlobalUserSponsorships(userSponsorships);
    const globalAccountActivations: AccountActivationStats[] =
      this.aggregateGlobalAccountActivations(accountActivations);

    return {
      sponsorships: globalSponsorships,
      userSponsorships: address ? globalUserSponsorships : undefined,
      accountActivations: globalAccountActivations,
      perChain: perChain,
    };
  }

  /**
   * Aggregates global sponsorship stats.
   * @param sponsorships - The sponsorship data to aggregate.
   * @returns The aggregated global sponsorship stats.
   */
  private aggregateGlobalSponsorships(sponsorships: any[]): SponsorshipStats[] {
    const aggregated = new Map<string, bigint>();
    sponsorships.forEach((s) => {
      const amount = BigInt(s.totalSponsored);
      aggregated.set(
        s.tokenAddress,
        (aggregated.get(s.tokenAddress) || BigInt(0)) + amount,
      );
    });

    return Array.from(aggregated.entries()).map(
      ([tokenAddress, sponsoredAmount]) => ({
        tokenAddress,
        sponsoredAmount: sponsoredAmount.toString(),
      }),
    );
  }

  /**
   * Aggregates global user sponsorship stats.
   * @param userSponsorships - The user sponsorship data to aggregate.
   * @returns The aggregated global user sponsorship stats.
   */
  private aggregateGlobalUserSponsorships(
    userSponsorships: any[],
  ): SponsorshipUserStats[] {
    const aggregated = new Map<
      string,
      { amount: bigint; userAddress: string; tokenAddress: string }
    >();
    userSponsorships.forEach((us) => {
      const key = `${us.userAddress}-${us.tokenAddress}`;
      const amount = BigInt(us.totalSponsored);
      const current = aggregated.get(key) || {
        amount: BigInt(0),
        userAddress: us.userAddress,
        tokenAddress: us.tokenAddress,
      };
      current.amount += amount;
      aggregated.set(key, current);
    });

    return Array.from(aggregated.values()).map((value) => ({
      userAddress: value.userAddress,
      userSponsoredAmount: value.amount.toString(),
      tokenAddress: value.tokenAddress,
    }));
  }

  /**
   * Aggregates global account activation stats.
   * @param accountActivations - The account activation data to aggregate.
   * @returns The aggregated global account activation stats.
   */
  private aggregateGlobalAccountActivations(
    accountActivations: any[],
  ): AccountActivationStats[] {
    const aggregated = new Map<
      string,
      { amount: bigint; userAddress: string; tokenAddress: string }
    >();
    accountActivations.forEach((aa) => {
      const key = `${aa.userAddress}-${aa.tokenAddress}`;
      const amount = BigInt(aa.totalSponsored);
      const current = aggregated.get(key) || {
        amount: BigInt(0),
        userAddress: aa.userAddress,
        tokenAddress: aa.tokenAddress,
      };
      current.amount += amount;
      aggregated.set(key, current);
    });

    return Array.from(aggregated.values()).map((value) => ({
      userAddress: value.userAddress,
      sponsoredAmount: value.amount.toString(),
      tokenAddress: value.tokenAddress,
    }));
  }

  /**
   * Retrieves the sponsored volume within a given time frame.
   * @param startDate - The start of the time frame.
   * @param endDate - The end of the time frame.
   * @returns The sponsored volume data.
   */
  private async getSponsoredVolume(
    startDate: Date,
    endDate: Date,
  ): Promise<
    { chainId: string; tokenAddress: string; totalSponsored: string }[]
  > {
    const types = [
      entities.SwapFlowFinalized,
      entities.SimpleTransferFlowCompleted,
      entities.FallbackHyperEVMFlowCompleted,
    ];

    // Fetch data in parallel
    const promises = types.map((entity) => {
      return this.db
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
        .groupBy(`"event"."chainId"`)
        .addGroupBy(`"event"."finalToken"`)
        .getRawMany();
    });

    const results = (await Promise.all(promises)).flat();

    // Aggregate using a Composite Key ("chainId:tokenAddress")
    // This removes the need for nested Maps entirely.
    const aggregationMap = new Map<string, bigint>();

    for (const result of results) {
      if (!result.totalSponsored) continue;

      const key = `${result.chainId}:${result.tokenAddress}`;
      const currentTotal = aggregationMap.get(key) || BigInt(0);

      aggregationMap.set(key, currentTotal + BigInt(result.totalSponsored));
    }

    // Transform back to array
    return Array.from(aggregationMap.entries()).map(([key, totalSponsored]) => {
      // We cast the split result to satisfy TypeScript
      const [chainId, tokenAddress] = key.split(":") as [string, string];

      return {
        chainId,
        tokenAddress,
        totalSponsored: totalSponsored.toString(),
      };
    });
  }

  /**
   * Retrieves the sponsored volume for a specific user within a given time frame.
   * @param userAddress - The user's address.
   * @param startDate - The start of the time frame.
   * @param endDate - The end of the time frame.
   * @returns The user's sponsored volume data.
   */
  private async getUserSponsoredVolume(
    userAddress: string,
    startDate: Date,
    endDate: Date,
  ): Promise<
    {
      chainId: string;
      userAddress: string;
      tokenAddress: string;
      totalSponsored: string;
    }[]
  > {
    const formattedAddress = userAddress.toLowerCase();
    const types = [
      entities.SwapFlowFinalized,
      entities.SimpleTransferFlowCompleted,
      entities.FallbackHyperEVMFlowCompleted,
    ];

    // Fetch data
    const promises = types.map((entity) => {
      return this.db
        .getRepository(entity)
        .createQueryBuilder("event")
        .select(`"event"."chainId"`, "chainId")
        .addSelect(`"event"."finalRecipient"`, "userAddress")
        .addSelect(`"event"."finalToken"`, "tokenAddress")
        .addSelect(
          `SUM("event"."evmAmountSponsored"::numeric)`,
          "totalSponsored",
        )
        .where(`"event"."blockTimestamp" BETWEEN :startDate AND :endDate`, {
          startDate,
          endDate,
        })
        .andWhere(`"event"."finalRecipient" = :formattedAddress`, {
          formattedAddress,
        })
        .groupBy(`"event"."chainId"`)
        .addGroupBy(`"event"."finalRecipient"`)
        .addGroupBy(`"event"."finalToken"`)
        .getRawMany();
    });

    const results = (await Promise.all(promises)).flat();

    // Aggregate using a Composite Key
    // We use a string key "chainId:user:token" to store data in a flat Map.
    const aggregationMap = new Map<string, bigint>();

    for (const row of results) {
      if (!row.totalSponsored) continue;

      // Create a unique key for this combination
      const key = `${row.chainId}:${row.userAddress}:${row.tokenAddress}`;

      const currentTotal = aggregationMap.get(key) || BigInt(0);
      aggregationMap.set(key, currentTotal + BigInt(row.totalSponsored));
    }

    // Transform back to array
    return Array.from(aggregationMap.entries()).map(([key, amount]) => {
      const [chainId, userAddress, tokenAddress] = key.split(":") as [
        string,
        string,
        string,
      ];
      return {
        chainId,
        userAddress,
        tokenAddress,
        totalSponsored: amount.toString(),
      };
    });
  }

  /**
   * Retrieves the account activation stats within a given time frame.
   * @param startDate - The start of the time frame.
   * @param endDate - The end of the time frame.
   * @returns The account activation stats.
   */
  private async getAccountActivationStats(
    startDate: Date,
    endDate: Date,
  ): Promise<
    {
      chainId: string;
      userAddress: string;
      tokenAddress: string;
      totalSponsored: string;
    }[]
  > {
    return this.db
      .getRepository(entities.SponsoredAccountActivation)
      .createQueryBuilder("event")
      .select(`"event"."chainId"`, "chainId")
      .addSelect(`"event"."finalRecipient"`, "userAddress")
      .addSelect(`"event"."fundingToken"`, "tokenAddress")
      .addSelect(`SUM("event"."evmAmountSponsored"::numeric)`, "totalSponsored")
      .where(`"event"."blockTimestamp" BETWEEN :startDate AND :endDate`, {
        startDate,
        endDate,
      })
      .groupBy(`"event"."chainId"`)
      .addGroupBy(`"event"."finalRecipient"`)
      .addGroupBy(`"event"."fundingToken"`)
      .getRawMany();
  }
}
