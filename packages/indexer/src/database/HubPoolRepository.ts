import winston from "winston";
import * as across from "@across-protocol/sdk";
import { DataSource, entities, utils } from "@repo/indexer-database";

export class HubPoolRepository extends utils.BaseRepository {
  constructor(postgres: DataSource, logger: winston.Logger) {
    super(postgres, logger, true);
  }

  public async formatAndSaveProposedRootBundleEvents(
    proposedRootBundleEvents: across.interfaces.ProposedRootBundle[],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = proposedRootBundleEvents.map((event) => {
      return {
        ...event,
        challengePeriodEndTimestamp: new Date(
          event.challengePeriodEndTimestamp * 1000,
        ),
        bundleEvaluationBlockNumbers: event.bundleEvaluationBlockNumbers.map(
          (blockNumber) => parseInt(blockNumber.toString()),
        ),
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    await this.postgres
      .createQueryBuilder(entities.ProposedRootBundle, "b")
      .insert()
      .values(formattedEvents)
      .orUpdate(["finalised"], ["transactionHash"])
      .execute();
  }

  public async formatAndSaveRootBundleDisputedEvents(
    rootBundleDisputedEvents: across.interfaces.DisputedRootBundle[],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = rootBundleDisputedEvents.map((event) => {
      return {
        ...event,
        requestTime: new Date(event.requestTime * 1000),
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    await this.postgres
      .createQueryBuilder(entities.RootBundleDisputed, "b")
      .insert()
      .values(formattedEvents)
      .orUpdate(["finalised"], ["transactionHash"])
      .execute();
  }

  public async formatAndSaveRootBundleCanceledEvents(
    rootBundleCanceledEvents: across.interfaces.CancelledRootBundle[],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = rootBundleCanceledEvents.map((event) => {
      return {
        ...event,
        caller: event.disputer,
        requestTime: new Date(event.requestTime * 1000),
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    await this.postgres
      .createQueryBuilder(entities.RootBundleCanceled, "b")
      .insert()
      .values(formattedEvents)
      .orUpdate(["finalised"], ["transactionHash"])
      .execute();
  }

  public async formatAndSaveRootBundleExecutedEvents(
    rootBundleExecutedEvents: across.interfaces.ExecutedRootBundle[],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = rootBundleExecutedEvents.map((event) => {
      return {
        ...event,
        bundleLpFees: event.bundleLpFees.map((fees) => fees.toString()),
        netSendAmounts: event.netSendAmounts.map((amount) => amount.toString()),
        runningBalances: event.runningBalances.map((balance) =>
          balance.toString(),
        ),
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    // Split the events into chunks of 1000 to avoid exceeding the max query length
    const chunks = across.utils.chunk(formattedEvents, 1000);
    await Promise.all(
      chunks.map((chunk) =>
        this.postgres
          .createQueryBuilder(entities.RootBundleExecuted, "b")
          .insert()
          .values(chunk)
          .orUpdate(
            ["finalised"],
            ["chainId", "leafId", "groupIndex", "transactionHash"],
          )
          .execute(),
      ),
    );
  }

  public async formatAndSaveSetPoolRebalanceRouteEvents(
    setPoolRebalanceRouteEvents: (across.interfaces.DestinationTokenWithBlock & {
      l2ChainId: number;
    })[],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = setPoolRebalanceRouteEvents.map((event) => {
      return {
        ...event,
        destinationChainId: event.l2ChainId,
        destinationToken: event.l2Token,
        l1Token: event.l1Token,
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    await this.postgres
      .createQueryBuilder(entities.SetPoolRebalanceRoute, "b")
      .insert()
      .values(formattedEvents)
      .orUpdate(
        ["finalised"],
        ["transactionHash", "transactionIndex", "logIndex"],
      )
      .execute();
  }

  /**
   * Finds the L1 token associated with an L2 token, closest in time (block number).
   * @param l2Token - The L2 token address.
   * @param chainId - The destination chain ID.
   * @param l1BlockNumber - Optional L1 block number to find the closest match less than or equal to this value.
   * @returns The L1 token address or undefined if not found.
   */
  public async findL1TokenFromL2Token(
    l2Token: string,
    chainId: number,
    l1BlockNumber?: number,
  ): Promise<string | undefined> {
    // Build the base query
    const queryBuilder = this.postgres
      .getRepository(entities.SetPoolRebalanceRoute)
      .createQueryBuilder("poolRebalanceRoot")
      .where("poolRebalanceRoot.destinationToken = :l2Token", { l2Token })
      .andWhere("poolRebalanceRoot.destinationChainId = :chainId", { chainId });

    // If l1BlockNumber is provided, find the closest one that is <= the provided block number
    if (l1BlockNumber !== undefined) {
      queryBuilder.andWhere("poolRebalanceRoot.blockNumber <= :l1BlockNumber", {
        l1BlockNumber,
      });
    }

    // Order by blockNumber descending to get the closest match
    queryBuilder.orderBy("poolRebalanceRoot.blockNumber", "DESC");

    // Execute the query to find the closest matching entry
    const result = await queryBuilder.getOne();

    // Return the L1 token if a result is found, otherwise undefined
    return result?.l1Token;
  }

  /**
   * Finds the L2 token associated with an L1 token, closest in time (block number).
   * @param l1Token - The L1 token address.
   * @param chainId - The destination chain ID.
   * @param l1BlockNumber - Optional L1 block number to find the closest match less than or equal to this value.
   * @returns The L2 token address or undefined if not found.
   */
  public async findL2TokenFromL1Token(
    l1Token: string,
    chainId: number,
    l1BlockNumber?: number,
  ): Promise<string | undefined> {
    // Build the base query
    const queryBuilder = this.postgres
      .getRepository(entities.SetPoolRebalanceRoute)
      .createQueryBuilder("poolRebalanceRoot")
      .where("poolRebalanceRoot.l1Token = :l1Token", { l1Token })
      .andWhere("poolRebalanceRoot.destinationChainId = :chainId", { chainId });

    // If l1BlockNumber is provided, find the closest one that is <= the provided block number
    if (l1BlockNumber !== undefined) {
      queryBuilder.andWhere("poolRebalanceRoot.blockNumber <= :l1BlockNumber", {
        l1BlockNumber,
      });
    }

    // Order by blockNumber descending to get the closest match
    queryBuilder.orderBy("poolRebalanceRoot.blockNumber", "DESC");

    // Execute the query to find the closest matching entry
    const result = await queryBuilder.getOne();

    // Return the L2 token if a result is found, otherwise undefined
    return result?.destinationToken;
  }
}
