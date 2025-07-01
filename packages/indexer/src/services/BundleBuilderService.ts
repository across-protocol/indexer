import {
  caching,
  clients,
  typechain,
  utils,
  providers,
} from "@across-protocol/sdk";
import { entities } from "@repo/indexer-database";
import { assert } from "@repo/error-handling";
import Redis from "ioredis";
import winston from "winston";
import { BundleRepository } from "../database/BundleRepository";
import { RepeatableTask } from "../generics";
import { BundleLeavesCache } from "../redis/bundleLeavesCache";
import { HubPoolBalanceCache } from "../redis/hubBalancesCache";
import {
  BN_ZERO,
  buildPoolRebalanceRoot,
  ConfigStoreClientFactory,
  convertProposalRangeResultToProposalRange,
  getBlockRangeBetweenBundles,
  getBlockRangeFromBundleToHead,
  HubPoolClientFactory,
  ProposalRange,
  ProposalRangeResult,
  resolveMostRecentProposedAndExecutedBundles,
  SpokePoolClientFactory,
} from "../utils";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";

const MAX_DISTANCE_TO_MAINNET_HEAD = 10_000;

type BundleLeafType = {
  chainId: number;
  l1Tokens: string[];
  netSendAmounts: string[];
  runningBalances: string[];
};

type BundleBuilderConfig = {
  logger: winston.Logger;
  bundleRepository: BundleRepository;
  redis: Redis;
  providerFactory: RetryProvidersFactory;
  hubClientFactory: HubPoolClientFactory;
  configStoreClientFactory: ConfigStoreClientFactory;
  spokePoolClientFactory: SpokePoolClientFactory;
  hubChainId: number;
};

export class BundleBuilderService extends RepeatableTask {
  private currentBundleCache: BundleLeavesCache;
  private proposedBundleCache: BundleLeavesCache;
  private hubBalanceCache: HubPoolBalanceCache;
  constructor(private config: BundleBuilderConfig) {
    super(config.logger, "bundleBuilder");
  }

  protected async taskLogic(): Promise<void> {
    // Get the most recent proposed and executed bundles
    const { lastExecutedBundle, lastProposedBundle } =
      await resolveMostRecentProposedAndExecutedBundles(
        this.config.bundleRepository,
        this.logger,
      );

    // We only want to aggregate/build proposed/current bundles if we are
    // sufficiently close to the head of the chain. This is to prevent out
    // of heap memory errors from needing to aggregate too much historical data
    // from all the chains.
    if (!(await this.isCloseEnoughToHead(lastExecutedBundle.proposal))) {
      this.logger.debug({
        at: "BundleBuilderService#taskLogic",
        message: "Last executed bundle is too far from head, skipping",
        lastExecutedBundleBlock: lastExecutedBundle.proposal.blockNumber,
      });
      return;
    }

    // Call the sub logic with the same last executed and proposed bundles
    // and log the result
    const [currentLoopResult, proposedLoopResult] = await Promise.allSettled([
      this.handleCurrentBundleLoop(lastExecutedBundle, lastProposedBundle),
      this.handleProposedBundleLoop(lastExecutedBundle, lastProposedBundle),
    ]);

    const [hubBalanceResult] = await Promise.allSettled([
      this.handleHubBalanceAggregation(lastExecutedBundle),
    ]);

    this.logger.debug({
      at: "BundleBuilderService#taskLogic",
      message: "Bundle builder loop completed",
      currentLoopResult: currentLoopResult.status,
      proposedLoopResult: proposedLoopResult.status,
      hubBalanceResult: hubBalanceResult.status,
    });
  }

  protected initialize(): Promise<void> {
    this.currentBundleCache = new BundleLeavesCache({
      redis: this.config.redis,
      prefix: "currentBundleCache",
    });
    this.proposedBundleCache = new BundleLeavesCache({
      redis: this.config.redis,
      prefix: "proposedBundleCache",
    });
    this.hubBalanceCache = new HubPoolBalanceCache({
      redis: this.config.redis,
      prefix: "hubBalanceCache",
    });
    return Promise.resolve();
  }

  /**
   * Checks if the last executed bundle is close enough to the head of the chain to build a bundle
   * without requiring too much historical data such that we receive out of heap memory errors.
   * @param lastExecutedBundle The most recent executed bundle within the database
   * @returns True if the last executed bundle is close enough to the head of the chain, false otherwise
   * @see {@link MAX_DISTANCE_TO_MAINNET_HEAD}
   */
  private async isCloseEnoughToHead(
    lastExecutedBundle: entities.ProposedRootBundle,
  ) {
    const provider = this.config.providerFactory.getProviderForChainId(
      this.config.hubChainId,
    ) as providers.RetryProvider;
    const currentMainnetBlock = await provider.getBlockNumber();
    const lastExecutedMainnetBlock =
      lastExecutedBundle.bundleEvaluationBlockNumbers[0]!;
    const distanceToHead = currentMainnetBlock - lastExecutedMainnetBlock;
    return distanceToHead < MAX_DISTANCE_TO_MAINNET_HEAD;
  }

  /**
   * Handles the hub balance aggregation logic.
   * @dev Ensure that this function is run after the proposed and current bundle
   *      loops have been completed.
   */
  private async handleHubBalanceAggregation(
    executedBundle: entities.Bundle,
  ): Promise<void> {
    // Resolve a hub client and config store client
    const hubClient = this.config.hubClientFactory.get(this.config.hubChainId);
    const configStoreClient = hubClient.configStoreClient;
    void (await configStoreClient.update());
    void (await hubClient.update());

    // Resolve the L1 tokens to aggregate
    const l1Tokens = hubClient.getL1Tokens();

    // Iterate over all l1 tokens and resolve the liquid reserves
    const hubBalances = await Promise.all(
      l1Tokens.map(async ({ address }) => {
        const l1Token = address.toEvmAddress();
        const hubPoolContract = hubClient.hubPool as typechain.HubPool;

        // Resolve the liquid reserve for the given L1Token stored in the
        // pooledTokens structure at the end of the last executed bundle
        // range for mainnet
        const { liquidReserves } =
          await hubPoolContract.callStatic.pooledTokens(l1Token, {
            blockTag: executedBundle.proposal.bundleEvaluationBlockNumbers[0]!,
          });
        // Resolve the current and proposed bundle data for the given L1Token from
        // redis
        const [currentBundleData, proposedBundleData] = await Promise.all([
          this.currentBundleCache.getByL1Token(l1Token),
          this.proposedBundleCache.getByL1Token(l1Token),
        ]);
        // Filter out any undefined values
        const currentBundleDataFiltered = currentBundleData.filter(
          utils.isDefined,
        );
        const proposedBundleDataFiltered = proposedBundleData.filter(
          utils.isDefined,
        );
        // Confirm that our current bundle data is not empty
        if (!currentBundleData || currentBundleData.length === 0) {
          this.logger.error({
            at: "Indexer#BundleBuilderService#handleHubBalanceAggregation",
            message:
              "No current bundle data found. Ensure that the current bundle loop has been run.",
            notificationPath: "across-indexer-error",
            l1Token,
          });
          return;
        }
        const currentNetSendAmounts = currentBundleDataFiltered.reduce(
          (acc, leaf) => acc.add(leaf.netSendAmount),
          BN_ZERO,
        );
        const proposedNetSendAmounts = proposedBundleDataFiltered.reduce(
          (acc, leaf) => acc.add(leaf.netSendAmount),
          BN_ZERO,
        );
        const pendingLiquidReserves = liquidReserves.add(
          proposedNetSendAmounts,
        );
        const currentLiquidReserves = pendingLiquidReserves.add(
          currentNetSendAmounts,
        );
        const hasPendingBundle = proposedBundleDataFiltered.length > 0;
        return {
          l1Token,
          currentNetSendAmounts: currentNetSendAmounts.toString(),
          pendingNetSendAmounts: hasPendingBundle
            ? proposedNetSendAmounts.toString()
            : null,
          currentLiquidReserves: currentLiquidReserves.toString(),
          pendingLiquidReserves: hasPendingBundle
            ? pendingLiquidReserves.toString()
            : null,
        };
      }),
    );
    // Remove all l1 tokens from the redis cache
    await this.hubBalanceCache.clear();
    // Persist the hub balances to the redis cache
    await this.hubBalanceCache.setAll(hubBalances.filter(utils.isDefined));
  }

  /**
   * Generates, processes, and persists the pool leaves for a bundle that
   * spans from the latest proposed (or executed if no proposal is live) to
   * the head of the chain.
   * @param lastExecutedBundle The most recent executed bundle.
   * @param lastProposedBundle The most recent proposed bundle.
   */
  private async handleCurrentBundleLoop(
    lastExecutedBundle: entities.Bundle,
    lastProposedBundle: entities.Bundle | null,
  ): Promise<void> {
    // Resolve a latest config store client and update it
    const configStoreClient = this.config.configStoreClientFactory.get(
      this.config.hubChainId,
    );
    void (await configStoreClient.update());
    // Resolve the latest proposal
    const latestProposal = (lastProposedBundle ?? lastExecutedBundle).proposal;
    // Grab the block range from the latest bundle to the head of the chain
    const ranges = await getBlockRangeFromBundleToHead(
      latestProposal,
      this.config.providerFactory,
      // Check what chains are disabled for the latest proposal since it will be
      // the start of our new temporary bundle from latest to head
      configStoreClient.getDisabledChainsForBlock(latestProposal.blockNumber),
    );
    // Resolve the pool leaf for the bundle range
    const resultsToPersist = await this.resolvePoolLeafForBundleRange(
      ranges,
      // We need this function since our end ranges are the head of the chain
      // and not any specific proposal
      convertProposalRangeResultToProposalRange(ranges),
    );

    // first clear the cache to prepare for update
    await this.currentBundleCache.clear();
    // Persist this to Redis
    await Promise.all(
      resultsToPersist.flatMap((leaf) => {
        const lastExecutedRunningBalance =
          lastExecutedBundle.proposal.bundleEvaluationBlockNumbers[
            lastExecutedBundle.proposal.chainIds.findIndex(
              (chainId) => leaf.chainId === chainId,
            )
          ];
        assert(
          lastExecutedRunningBalance,
          "Last executed running balance not found",
        );
        assert(
          leaf.l1Tokens.length == leaf.netSendAmounts.length,
          "Net send amount count does not match token counts",
        );
        assert(
          leaf.l1Tokens.length == leaf.runningBalances.length,
          "Running balances count does not match token counts",
        );
        return leaf.l1Tokens.map((l1Token, tokenIndex) => {
          return this.currentBundleCache.set({
            chainId: leaf.chainId,
            l1Token,
            netSendAmount: leaf.netSendAmounts[tokenIndex]!,
            runningBalance: leaf.runningBalances[tokenIndex]!,
            lastExecutedRunningBalance: String(lastExecutedRunningBalance),
          });
        });
      }),
    );
  }

  /**
   * Generates, processes, and persists the pool leaves for a bundle that
   * spans from the latest executed bundle to the latest proposed bundle
   * @param lastExecutedBundle The most recent executed bundle.
   * @param lastProposedBundle The most recent proposed bundle.
   * @throws if the proposed bundle is null
   */
  private async handleProposedBundleLoop(
    lastExecutedBundle: entities.Bundle,
    lastProposedBundle: entities.Bundle | null,
  ): Promise<void> {
    // If no proposed bundle is found, skip the rest of the logic
    if (!utils.isDefined(lastProposedBundle)) {
      this.logger.debug({
        at: "Indexer#BundleBuilderService#handleProposedBundleLoop",
        message: "No proposed bundles found, skipping.",
      });
      // Clear the cache so that we don't have any stale data
      await this.proposedBundleCache.clear();
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

    // first clear the cache to prepare for update
    await this.proposedBundleCache.clear();
    // Persist this to Redis
    await Promise.all(
      resultsToPersist.flatMap((leaf) => {
        const lastExecutedRunningBalance =
          lastExecutedBundle.proposal.bundleEvaluationBlockNumbers[
            lastExecutedBundle.proposal.chainIds.findIndex(
              (chainId) => leaf.chainId === chainId,
            )
          ];
        assert(
          lastExecutedRunningBalance,
          "Last executed running balance not found",
        );
        assert(
          leaf.l1Tokens.length == leaf.netSendAmounts.length,
          "Net send amount count does not match token counts",
        );
        assert(
          leaf.l1Tokens.length == leaf.runningBalances.length,
          "Running balances count does not match token counts",
        );
        return leaf.l1Tokens.map((l1Token, tokenIndex) => {
          return this.proposedBundleCache.set({
            chainId: leaf.chainId,
            l1Token,
            netSendAmount: leaf.netSendAmounts[tokenIndex]!,
            runningBalance: leaf.runningBalances[tokenIndex]!,
            lastExecutedRunningBalance: String(lastExecutedRunningBalance),
          });
        });
      }),
    );
  }

  async resolvePoolLeafForBundleRange(
    ranges: ProposalRangeResult[],
    bundleHead: ProposalRange,
  ): Promise<BundleLeafType[]> {
    // Convert into array of [start, end] for each chain
    const bundleRangeForBundleClient = ranges.map(
      ({ startBlock, endBlock }) => [startBlock, endBlock],
    );
    const chainsToBuildBundleFor = ranges.map(({ chainId }) => chainId);
    // Grab historical ranges from the last 8 bundles
    // FIXME: This is a hardcoded value, we should make this configurable
    const historicalProposal =
      await this.config.bundleRepository.retrieveMostRecentBundle(
        entities.BundleStatus.Executed,
        undefined,
        8,
      );
    // Check if we have enough historical data to build the bundle with
    // an ample lookback range
    if (!historicalProposal) {
      this.logger.error({
        at: "Indexer#BundleBuilderService#callRange",
        message: "No historical proposal found",
        notificationPath: "across-indexer-error",
      });
      throw new Error("No historical proposal found");
    }
    const historicalProposedBundle = historicalProposal.proposal;
    // Instantiate the Hub & ConfigStore Client from genesis
    const hubPoolClient = this.config.hubClientFactory.get(
      this.config.hubChainId,
    );
    const configStoreClient = hubPoolClient.configStoreClient;
    // Resolve lookback range for the spoke clients
    const lookbackRange = getBlockRangeBetweenBundles(
      historicalProposedBundle,
      bundleHead,
    );
    // Instantiate spoke clients
    const spokeClients = Object.fromEntries(
      await Promise.all(
        lookbackRange.map(async ({ chainId, startBlock, endBlock }) => [
          chainId,
          await this.config.spokePoolClientFactory.get(
            chainId,
            startBlock,
            endBlock,
            {
              hubPoolClient,
            },
          ),
        ]),
      ),
    ) as Record<number, clients.SpokePoolClient>;
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
    const bundleData = await bundleDataClient.loadData(
      bundleRangeForBundleClient,
      spokeClients,
      false,
    );
    // Build pool rebalance root and resolve the leaves
    const { leaves } = buildPoolRebalanceRoot(
      bundleRangeForBundleClient,
      bundleData,
      hubPoolClient,
      configStoreClient,
    );
    // Map the leaves to the desired format
    return leaves.map((leaf) => {
      const l1Tokens = leaf.l1Tokens;
      return {
        chainId: leaf.chainId,
        l1Tokens: l1Tokens.map((token) => token.toEvmAddress()),
        netSendAmounts: leaf.netSendAmounts.map((balance, idx) =>
          utils.formatUnits(
            balance,
            utils.getTokenInfo(l1Tokens[idx]!, hubPoolClient.chainId).decimals,
          ),
        ),
        runningBalances: leaf.runningBalances.map((balance, idx) =>
          utils.formatUnits(
            balance,
            utils.getTokenInfo(l1Tokens[idx]!, hubPoolClient.chainId).decimals,
          ),
        ),
      };
    });
  }
}
