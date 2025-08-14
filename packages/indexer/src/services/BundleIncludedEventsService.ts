import * as across from "@across-protocol/sdk";
import { getDeployedBlockNumber } from "@across-protocol/contracts";
import Redis from "ioredis";
import winston from "winston";

import { DataSource, entities } from "@repo/indexer-database";

import { RepeatableTask } from "../generics";
import { BundleRepository } from "../database/BundleRepository";
import * as utils from "../utils";
import { getBlockTime } from "../web3/constants";
import {
  RetryProvidersFactory,
  SvmProvider,
} from "../web3/RetryProvidersFactory";
import {
  buildPoolRebalanceRoot,
  getBlockRangeBetweenBundles,
  getBundleBlockRanges,
} from "../utils/bundleBuilderUtils";
import { Config } from "../parseEnv";
import { RefundedDepositsStatusService } from "./RefundedDepositsStatusService";

export type BundleConfig = {
  hubChainId: number;
  logger: winston.Logger;
  redis: Redis;
  postgres: DataSource;
  hubPoolClientFactory: utils.HubPoolClientFactory;
  spokePoolClientFactory: utils.SpokePoolClientFactory;
  bundleRepository: BundleRepository;
  retryProvidersFactory: RetryProvidersFactory;
  config: Config;
  refundedDepositsStatusService: RefundedDepositsStatusService;
};

export class BundleIncludedEventsService extends RepeatableTask {
  private hubPoolClient: across.clients.HubPoolClient;
  private configStoreClient: across.clients.AcrossConfigStoreClient;

  constructor(private readonly config: BundleConfig) {
    super(config.logger, "BundleIncludedEventsService");
  }

  protected async taskLogic(): Promise<void> {
    try {
      this.config.logger.debug({
        at: "BundleIncludedEventsService#taskLogic",
        message: "Starting BundleIncludedEventsService",
      });
      await this.assignSpokePoolEventsToExecutedBundles();
      for (const chainId of [
        ...this.config.config.evmSpokePoolChainsEnabled,
        ...this.config.config.svmSpokePoolChainsEnabled,
      ]) {
        await this.config.refundedDepositsStatusService.updateRelayStatusForRefundedDeposits(
          chainId,
        );
      }

      this.config.logger.debug({
        at: "BundleIncludedEventsService#taskLogic",
        message: "Finished BundleIncludedEventsService",
      });
    } catch (error) {
      this.logger.error({
        at: "BundleIncludedEventsService#taskLogic",
        message: "Error in BundleIncludedEventsService",
        notificationPath: "across-indexer-error",
        errorJson: JSON.stringify(error),
        error,
      });
    }
  }

  protected async initialize(): Promise<void> {
    const { hubPoolClientFactory } = this.config;
    this.hubPoolClient = hubPoolClientFactory.get(this.config.hubChainId);
    this.configStoreClient = this.hubPoolClient.configStoreClient;
  }

  private async assignSpokePoolEventsToExecutedBundles(): Promise<void> {
    const { logger, bundleRepository } = this.config;
    const executedBundles =
      await bundleRepository.getExecutedBundlesWithoutEventsAssociated({
        fromBlock: this.config.config.bundleEventsServiceStartBlockNumber,
      });
    logger.debug({
      at: "Indexer#BundleIncludedEventsService#assignSpokePoolEventsToExecutedBundles",
      message: `Found ${executedBundles.length} executed bundles without events associated`,
    });
    if (executedBundles.length === 0) {
      return;
    }

    logger.debug({
      at: "Indexer#BundleIncludedEventsService#assignSpokePoolEventsToExecutedBundles",
      message: "Updating HubPool and ConfigStore clients",
    });
    const startTime = Date.now();
    await this.configStoreClient.update();
    await this.hubPoolClient.update();
    const endTime = Date.now();
    const duration = endTime - startTime;
    logger.debug({
      at: "Indexer#BundleIncludedEventsService#assignSpokePoolEventsToExecutedBundles",
      message: `Updated HubPool and ConfigStore clients in ${duration / 1000} seconds`,
    });

    for (const bundle of executedBundles) {
      await this.getEventsIncludedInBundle(bundle);
    }
  }

  private async getEventsIncludedInBundle(
    bundle: entities.Bundle,
  ): Promise<void> {
    const { logger, bundleRepository, spokePoolClientFactory } = this.config;
    const historicalBundle = await bundleRepository.retrieveMostRecentBundle(
      entities.BundleStatus.Executed,
      bundle.proposal.blockNumber,
      16,
    );
    // Skip the bundle if we don't have enough historical data
    if (!historicalBundle) {
      logger.warn({
        at: "Indexer#BundleIncludedEventsService#getEventsIncludedInBundle",
        message: `No historical bundle found. Skipping bundle reconstruction of bundle ${bundle.id}`,
      });
      return;
    }
    const lookbackRange = getBlockRangeBetweenBundles(
      historicalBundle.proposal,
      bundle.proposal,
    );
    const latestBlocks =
      await this.getLatestBlockForBundleChains(lookbackRange);
    const spokeClients = await this.getSpokeClientsForLookbackBlockRange(
      lookbackRange,
      spokePoolClientFactory,
      latestBlocks,
    );
    logger.debug({
      at: "Indexer#BundleIncludedEventsService#getEventsIncludedInBundle",
      message: `Updating spoke clients for lookback range for bundle ${bundle.id}`,
      lookbackRange,
    });
    const startTime = Date.now();
    await Promise.all(
      Object.values(spokeClients).map((client) => client.update()),
    );
    const endTime = Date.now();
    const duration = endTime - startTime;
    logger.debug({
      at: "Indexer#BundleIncludedEventsService#getEventsIncludedInBundle",
      message: `Updated spoke clients in ${duration / 1000} seconds for bundle ${bundle.id}`,
    });
    const clients = {
      hubPoolClient: this.hubPoolClient,
      configStoreClient: this.configStoreClient,
      arweaveClient: null as unknown as across.caching.ArweaveClient, // FIXME: This is a hack to avoid instantiating the Arweave client
    };
    // Instantiate bundle data client and reconstruct bundle
    const bundleDataClient =
      new across.clients.BundleDataClient.BundleDataClient(
        logger,
        clients,
        spokeClients,
        bundle.proposal.chainIds,
      );
    // Get bundle ranges as an array of [startBlock, endBlock] for each chain
    const bundleBlockRanges = getBundleBlockRanges(bundle);
    const bundleData = await bundleDataClient.loadData(
      bundleBlockRanges,
      spokeClients,
    );

    // Build pool rebalance root and check it matches with the root of the stored bundle
    const poolRebalanceRoot = buildPoolRebalanceRoot(
      bundleBlockRanges,
      bundleData,
      this.hubPoolClient,
      this.configStoreClient,
    );
    if (bundle.poolRebalanceRoot !== poolRebalanceRoot.tree.getHexRoot()) {
      logger.warn({
        at: "Indexer#BundleIncludedEventsService#getEventsIncludedInBundle",
        message: `Mismatching roots. Skipping bundle ${bundle.id}.`,
      });
      return;
    } else {
      const storedEvents = await bundleRepository.storeBundleEvents(
        bundleData,
        bundle.id,
      );
      await bundleRepository.updateBundleEventsAssociatedFlag(bundle.id);
      logger.debug({
        at: "Indexer#BundleIncludedEventsService#getEventsIncludedInBundle",
        message: `Stored bundle events for bundle ${bundle.id}`,
        storedEvents,
      });
    }
  }

  private async getSpokeClientsForLookbackBlockRange(
    lookbackRange: utils.ProposalRangeResult[],
    spokePoolClientFactory: utils.SpokePoolClientFactory,
    latestBlocks: Record<number, number>,
  ) {
    const clients = await Promise.all(
      lookbackRange.map(async ({ chainId, startBlock, endBlock }) => {
        const chainIsSvm = across.utils.chainIsSvm(chainId);
        // We need to instantiate spoke clients using a higher end block than
        // the bundle range as deposits which fills are included in this bundle could
        // have occured outside the bundle range of the origin chain
        // NOTE: A buffer time of 15 minutes has been proven to work for older bundles
        const blockTime = getBlockTime(chainId);
        const endBlockTimeBuffer = 60 * 15;
        const blockBuffer = Math.round(endBlockTimeBuffer / blockTime);
        const endBlockWithBuffer = endBlock + blockBuffer;
        const latestBlock = latestBlocks[chainId]!;
        const cappedEndBlock = Math.min(endBlockWithBuffer, latestBlock);
        const contractName = chainIsSvm ? "SvmSpoke" : "SpokePool";
        const deployedBlockNumber = getDeployedBlockNumber(
          contractName,
          chainId,
        );
        this.logger.debug({
          at: "Indexer#BundleIncludedEventsService#getSpokeClientsForLookbackBlockRange",
          message: `Instantiate SpokePool client for chain ${chainId}`,
          deployedBlockNumber,
          startBlock,
          cappedEndBlock,
        });
        // A chain can be included in the bundle even if the SpokePool is not deployed yet
        // In this case, the SpokePool client will not be instantiated and updated
        if (deployedBlockNumber > endBlock) {
          this.logger.debug({
            at: "Indexer#BundleIncludedEventsService#getSpokeClientsForLookbackBlockRange",
            message: `SpokePool client not instantiated as it is not deployed yet for chain ${chainId}`,
            deployedBlockNumber,
            startBlock,
            cappedEndBlock,
          });
          return [chainId, null];
        }

        const enableCaching = chainIsSvm ? true : false;

        const spokePoolClient = await spokePoolClientFactory.get(
          chainId,
          startBlock,
          cappedEndBlock,
          {
            hubPoolClient: this.hubPoolClient,
          },
          enableCaching,
        );

        return [chainId, spokePoolClient];
      }),
    );

    return Object.fromEntries(
      clients.filter(([_, client]) => client !== null),
    ) as Record<number, across.clients.SpokePoolClient>;
  }

  private async getLatestBlockForBundleChains(
    lookbackRange: utils.ProposalRangeResult[],
  ): Promise<Record<number, number>> {
    const entries = await Promise.all(
      lookbackRange.map(async ({ chainId }) => {
        let latestBlock: number;
        if (across.utils.chainIsEvm(chainId)) {
          const provider =
            this.config.retryProvidersFactory.getProviderForChainId(
              chainId,
            ) as across.providers.RetryProvider;
          latestBlock = await provider.getBlockNumber();
        } else {
          const provider =
            this.config.retryProvidersFactory.getProviderForChainId(
              chainId,
            ) as SvmProvider;
          latestBlock = Number(
            await provider.getSlot({ commitment: "confirmed" }).send(),
          );
        }
        return [chainId, latestBlock];
      }),
    );

    return Object.fromEntries(entries);
  }
}
