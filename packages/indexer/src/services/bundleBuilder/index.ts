import { BaseIndexer } from "../../generics";
import winston from "winston";
import { DataSource, entities } from "@repo/indexer-database";
import {
  convertProposalRangeResultToProposalRange,
  getBlockRangeBetweenBundles,
  getBlockRangeFromBundleToHead,
  HubPoolClientFactory,
  ProposalRange,
  ProposalRangeResult,
  resolveMostRecentProposedAndExecutedBundles,
  SpokePoolClientFactory,
} from "../../utils";
import { BundleRepository } from "../../database/BundleRepository";
import { utils } from "@across-protocol/sdk";
import Redis from "ioredis";
import { RetryProvidersFactory } from "../../web3/RetryProvidersFactory";
import { CHAIN_IDs, TOKEN_SYMBOLS_MAP } from "@across-protocol/constants";
import { clients } from "@across-protocol/sdk";
import { caching } from "@across-protocol/sdk";

type BundleBuilderConfig = {
  logger: winston.Logger;
  postgres: DataSource;
  redis: Redis;
  providerFactory: RetryProvidersFactory;
  hubClientFactory: HubPoolClientFactory;
  spokePoolClientFactory: SpokePoolClientFactory;
};

export class Processor extends BaseIndexer {
  private bundleRepository: BundleRepository;

  constructor(private config: BundleBuilderConfig) {
    super(config.logger, "bundleBuilder");
  }

  protected async indexerLogic(): Promise<void> {
    await Promise.allSettled([
      this.handleCurrentBundleLoop(),
      this.handleProposedBundleLoop(),
    ]);
  }

  protected initialize(): Promise<void> {
    if (!this.config.postgres) {
      this.logger.error({
        at: "BundleBuilder#Processor#initialize",
        message: "Postgres connection not provided",
      });
      throw new Error("Postgres connection not provided");
    }
    this.bundleRepository = new BundleRepository(
      this.config.postgres,
      this.config.logger,
      true,
    );
    return Promise.resolve();
  }

  private async handleCurrentBundleLoop(): Promise<void> {
    // Get the most recent proposed and executed bundles
    const { lastProposedBundle, lastExecutedBundle } =
      await resolveMostRecentProposedAndExecutedBundles(
        this.bundleRepository,
        this.logger,
      );
    // Grab the block range from either the last proposed or last executed bundle
    // to the head of the chain
    const ranges = await getBlockRangeFromBundleToHead(
      (lastProposedBundle ?? lastExecutedBundle).proposal,
      this.config.providerFactory,
    );
    // Resolve the pool leaf for the bundle range
    const resultsToPersist = await this.resolvePoolLeafForBundleRange(
      ranges,
      // We need this function since our end ranges are the head of the chain
      // and not any specific proposal
      convertProposalRangeResultToProposalRange(ranges),
    );
    // Persist this to Redis
  }

  private async handleProposedBundleLoop(): Promise<void> {
    // Get the most recent proposed and executed bundles
    const { lastProposedBundle, lastExecutedBundle } =
      await resolveMostRecentProposedAndExecutedBundles(
        this.bundleRepository,
        this.logger,
      );
    // If no proposed bundle is found, skip the rest of the logic
    if (!utils.isDefined(lastProposedBundle)) {
      this.logger.debug({
        at: "BundleBuilder#Processor#handleProposedBundleLoop",
        message: "No proposed bundles found, skipping.",
      });
      return;
    }
    // Grab the ranges between the last executed and proposed bundles
    const ranges = getBlockRangeBetweenBundles(
      lastExecutedBundle.proposal,
      lastProposedBundle.proposal,
    );
    // Resolve the pool leaf for the bundle range
    const resultsToPersist = await this.resolvePoolLeafForBundleRange(
      ranges,
      lastProposedBundle.proposal,
    );
    // Filter out any pool leave results that have been executed and are stored
    // in the database

    // Persist this to Redis
  }

  async resolvePoolLeafForBundleRange(
    ranges: ProposalRangeResult[],
    bundleHead: ProposalRange,
  ): Promise<
    {
      chainId: number;
      l1Tokens: string[];
      netSendAmounts: string[];
      runningBalances: string[];
    }[]
  > {
    // Convert into array of [start, end] for each chain
    const bundleRangeForBundleClient = ranges.map(
      ({ startBlock, endBlock }) => [startBlock, endBlock],
    );
    const chainsToBuildBundleFor = ranges.map(({ chainId }) => chainId);
    // Grab historical ranges from the last 8 bundles
    // FIXME: This is a hardcoded value, we should make this configurable
    const historicalProposal =
      await this.bundleRepository.retrieveMostRecentBundle(
        entities.BundleStatus.Executed,
        undefined,
        8,
      );
    // Check if we have enough historical data to build the bundle with
    // an ample lookback range
    if (!historicalProposal) {
      this.logger.error({
        at: "BundleBuilder#Processor#callRange",
        message: "No historical proposal found",
      });
      throw new Error("No historical proposal found");
    }
    const historicalProposedBundle = historicalProposal.proposal;
    // Instantiate the Hub & ConfigStore Client from genesis
    const hubPoolClient = this.config.hubClientFactory.get(CHAIN_IDs.MAINNET);
    const configStoreClient = hubPoolClient.configStoreClient;
    // Resolve lookback range for the spoke clients
    const lookbackRange = getBlockRangeBetweenBundles(
      historicalProposedBundle,
      bundleHead,
    );
    // Instantiate spoke clients
    const spokeClients = lookbackRange.reduce(
      (acc, { chainId, startBlock, endBlock }) => ({
        ...acc,
        [chainId]: this.config.spokePoolClientFactory.get(
          chainId,
          startBlock,
          endBlock,
          {
            hubPoolClient,
          },
        ),
      }),
      {} as Record<number, clients.SpokePoolClient>,
    );
    // Update all clients
    await configStoreClient.update();
    await hubPoolClient.update();
    await Promise.all(
      Object.values(spokeClients).map((client) => client.update()),
    );
    // Instantiate the bundle client
    const bundleDataClient = new clients.BundleDataClient.BundleDataClient(
      this.logger,
      {
        hubPoolClient,
        configStoreClient,
        arweaveClient: null as unknown as caching.ArweaveClient, // FIXME: This is a hack to avoid instantiating the Arweave client
      },
      spokeClients,
      chainsToBuildBundleFor,
    );
    // Load the bundle data
    const {
      bundleDepositsV3,
      expiredDepositsToRefundV3,
      bundleFillsV3,
      unexecutableSlowFills,
      bundleSlowFillsV3,
    } = await bundleDataClient.loadData(
      bundleRangeForBundleClient,
      spokeClients,
      false,
    );
    // Build pool rebalance root and resolve the leaves
    const { leaves } = clients.BundleDataClient._buildPoolRebalanceRoot(
      bundleRangeForBundleClient[0]![1]!, // Mainnet is always the first chain. Second element is the end block
      bundleRangeForBundleClient[0]![1]!, // Mainnet is always the first chain. Second element is the end block
      bundleDepositsV3,
      bundleFillsV3,
      bundleSlowFillsV3,
      unexecutableSlowFills,
      expiredDepositsToRefundV3,
      {
        hubPoolClient,
        configStoreClient,
      },
    );
    // Map the leaves to the desired format
    return leaves.map((leaf) => ({
      chainId: leaf.chainId,
      l1Tokens: leaf.l1Tokens,
      netSendAmounts: leaf.netSendAmounts.map((balance, idx) =>
        utils.formatUnits(
          balance,
          utils.getTokenInfo(leaf.l1Tokens[idx]!, hubPoolClient.chainId)
            .decimals,
        ),
      ),
      runningBalances: leaf.runningBalances.map((balance, idx) =>
        utils.formatUnits(
          balance,
          utils.getTokenInfo(leaf.l1Tokens[idx]!, hubPoolClient.chainId)
            .decimals,
        ),
      ),
    }));
  }
}
