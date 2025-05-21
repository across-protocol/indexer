import winston from "winston";
import * as across from "@across-protocol/sdk";
import { DataSource, entities, utils } from "@repo/indexer-database";

import { FetchEventsResult } from "../data-indexing/service/HubPoolIndexerDataHandler";

export class HubPoolRepository extends utils.BlockchainEventRepository {
  constructor(postgres: DataSource, logger: winston.Logger) {
    super(postgres, logger);
  }

  public async formatAndSaveProposedRootBundleEvents(
    proposedRootBundleEvents: FetchEventsResult["proposedRootBundleEvents"],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = proposedRootBundleEvents.map((event) => {
      return {
        challengePeriodEndTimestamp: new Date(
          event.challengePeriodEndTimestamp * 1000,
        ),
        poolRebalanceLeafCount: event.poolRebalanceLeafCount,
        bundleEvaluationBlockNumbers: event.bundleEvaluationBlockNumbers.map(
          (blockNumber) => parseInt(blockNumber.toString()),
        ),
        poolRebalanceRoot: event.poolRebalanceRoot,
        relayerRefundRoot: event.relayerRefundRoot,
        slowRelayRoot: event.slowRelayRoot,
        proposer: event.proposer,
        transactionHash: event.txnRef,
        transactionIndex: event.txnIndex,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        chainIds: event.chainIds,
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    const savedEvents =
      await this.saveAndHandleFinalisationBatch<entities.ProposedRootBundle>(
        entities.ProposedRootBundle,
        formattedEvents,
        ["transactionHash"],
        [],
      );

    return savedEvents;
  }

  public async formatAndSaveRootBundleDisputedEvents(
    rootBundleDisputedEvents: across.interfaces.DisputedRootBundle[],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = rootBundleDisputedEvents.map((event) => {
      return {
        disputer: event.disputer,
        requestTime: new Date(event.requestTime * 1000),
        transactionHash: event.txnRef,
        transactionIndex: event.txnIndex,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    const savedEvents =
      await this.saveAndHandleFinalisationBatch<entities.RootBundleDisputed>(
        entities.RootBundleDisputed,
        formattedEvents,
        ["transactionHash"],
        [],
      );

    return savedEvents;
  }

  public async formatAndSaveRootBundleCanceledEvents(
    rootBundleCanceledEvents: across.interfaces.CancelledRootBundle[],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = rootBundleCanceledEvents.map((event) => {
      return {
        caller: event.disputer,
        requestTime: new Date(event.requestTime * 1000),
        transactionHash: event.txnRef,
        transactionIndex: event.txnIndex,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    const savedEvents =
      await this.saveAndHandleFinalisationBatch<entities.RootBundleCanceled>(
        entities.RootBundleCanceled,
        formattedEvents,
        ["transactionHash"],
        [],
      );

    return savedEvents;
  }

  public async formatAndSaveRootBundleExecutedEvents(
    rootBundleExecutedEvents: FetchEventsResult["rootBundleExecutedEvents"],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = rootBundleExecutedEvents.map((event) => {
      return {
        leafId: event.leafId,
        groupIndex: event.groupIndex,
        chainId: event.chainId.toString(),
        l1Tokens: event.l1Tokens,
        bundleLpFees: event.bundleLpFees.map((fees) => fees.toString()),
        netSendAmounts: event.netSendAmounts.map((amount) => amount.toString()),
        runningBalances: event.runningBalances.map((balance) =>
          balance.toString(),
        ),
        caller: event.caller,
        transactionHash: event.txnRef,
        transactionIndex: event.txnIndex,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    const savedEvents =
      await this.saveAndHandleFinalisationBatch<entities.RootBundleExecuted>(
        entities.RootBundleExecuted,
        formattedEvents,
        ["chainId", "leafId", "groupIndex", "transactionHash"],
        [],
      );

    return savedEvents;
  }

  public async formatAndSaveSetPoolRebalanceRouteEvents(
    setPoolRebalanceRouteEvents: (across.interfaces.DestinationTokenWithBlock & {
      l2ChainId: number;
    })[],
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = setPoolRebalanceRouteEvents.map((event) => {
      return {
        destinationChainId: event.l2ChainId.toString(),
        l1Token: event.l1Token,
        destinationToken: event.l2Token,
        blockNumber: event.blockNumber,
        transactionHash: event.txnRef,
        transactionIndex: event.txnIndex,
        logIndex: event.logIndex,
        finalised: event.blockNumber <= lastFinalisedBlock,
      };
    });
    const savedEvents =
      await this.saveAndHandleFinalisationBatch<entities.SetPoolRebalanceRoute>(
        entities.SetPoolRebalanceRoute,
        formattedEvents,
        ["transactionHash", "transactionIndex", "logIndex"],
        [],
      );

    return savedEvents;
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
