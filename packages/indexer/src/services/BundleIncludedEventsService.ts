import * as across from "@across-protocol/sdk";
import { CHAIN_IDs, getDeployedBlockNumber } from "@across-protocol/contracts";
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
  DEFAULT_ARWEAVE_GATEWAY,
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

const EXCLUDED_CHAIN_IDS_FROM_BUNDLE_RECONSTRUCTION: number[] = [
  CHAIN_IDs.REDSTONE,
  CHAIN_IDs.MEGAETH,
];

export class BundleIncludedEventsService extends RepeatableTask {
  private hubPoolClient: across.clients.HubPoolClient;
  private configStoreClient: across.clients.AcrossConfigStoreClient;
  private arweaveClient: across.caching.ArweaveClient;

  constructor(private readonly config: BundleConfig) {
    super(config.logger, "BundleIncludedEventsService");
  }

  protected async taskLogic(): Promise<void> {
    try {
      const { logger } = this.config;
      logger.debug({
        at: "BundleIncludedEventsService#taskLogic",
        message: "Starting BundleIncludedEventsService",
      });

      // Update HubPool and ConfigStore clients
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

      await this.assignSpokePoolEventsToExecutedBundles();
      const enabledChainIds =
        this.configStoreClient.getChainIdIndicesForBlock();
      for (const chainId of enabledChainIds) {
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
    const { hubPoolClientFactory, logger } = this.config;
    this.hubPoolClient = hubPoolClientFactory.get(this.config.hubChainId);
    this.configStoreClient = this.hubPoolClient.configStoreClient;

    // Initialize ArweaveClient for read-only operations
    // Using dummy JWK to prevent accidental writes
    const dummyJWK = {
      kty: "RSA",
      e: "AQAB",
      n: "0",
      d: "0",
      p: "0",
      q: "0",
      dp: "0",
      dq: "0",
      qi: "0",
    };

    this.arweaveClient = new across.caching.ArweaveClient(
      dummyJWK,
      logger,
      DEFAULT_ARWEAVE_GATEWAY.url,
      DEFAULT_ARWEAVE_GATEWAY.protocol,
      DEFAULT_ARWEAVE_GATEWAY.port,
    );
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

    for (const bundle of executedBundles) {
      try {
        await this.getEventsIncludedInBundle(bundle);
      } catch (error) {
        this.logger.error({
          at: "BundleIncludedEventsService#assignSpokePoolEventsToExecutedBundles",
          message: "Error in BundleIncludedEventsService",
          notificationPath: "across-indexer-error",
          errorJson: JSON.stringify(error),
          error,
        });
      }
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

    // Try to update spoke clients, but allow fallback to Arweave if this fails
    let spokeClientsUpdated = false;
    try {
      const startTime = Date.now();
      await Promise.all(
        Object.values(spokeClients).map(async (client) => {
          try {
            await client.update();
          } catch (error) {
            logger.debug({
              at: "Indexer#BundleIncludedEventsService#getEventsIncludedInBundle",
              message: `Failed to update spoke client for chain ${client.chainId} and bundle ${bundle.id}`,
              error,
              errorJson: JSON.stringify(error),
            });
            throw error;
          }
        }),
      );
      const endTime = Date.now();
      const duration = endTime - startTime;
      logger.debug({
        at: "Indexer#BundleIncludedEventsService#getEventsIncludedInBundle",
        message: `Updated spoke clients in ${duration / 1000} seconds for bundle ${bundle.id}`,
      });
      spokeClientsUpdated = true;
    } catch (error) {
      logger.warn({
        at: "Indexer#BundleIncludedEventsService#getEventsIncludedInBundle",
        message: `Failed to update spoke clients for bundle ${bundle.id}. Will attempt Arweave fallback.`,
        error: error instanceof Error ? error.message : String(error),
      });
      spokeClientsUpdated = false;
    }
    const clients = {
      hubPoolClient: this.hubPoolClient,
      configStoreClient: this.configStoreClient,
      arweaveClient: this.arweaveClient,
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

    // Try reconstructing bundle with blockchain data first, then Arweave fallback
    // Skip blockchain reconstruction if spoke clients failed to update
    const reconstructionResult = await this.attemptBundleReconstruction(
      bundle,
      bundleBlockRanges,
      bundleDataClient,
      spokeClients,
      spokeClientsUpdated,
    );

    if (!reconstructionResult.success) {
      return; // Both attempts failed
    }

    // Store the bundle events
    const storedEvents = await bundleRepository.storeBundleEvents(
      reconstructionResult.bundleData,
      bundle.id,
    );
    await bundleRepository.updateBundleEventsAssociatedFlag(bundle.id);
    logger.debug({
      at: "Indexer#BundleIncludedEventsService#getEventsIncludedInBundle",
      message: `Stored bundle events for bundle ${bundle.id}`,
      storedEvents,
    });
  }

  /**
   * Attempts to reconstruct bundle data using blockchain first, then Arweave fallback
   */
  private async attemptBundleReconstruction(
    bundle: entities.Bundle,
    bundleBlockRanges: number[][],
    bundleDataClient: across.clients.BundleDataClient.BundleDataClient,
    spokeClients: Record<number, across.clients.SpokePoolClient>,
    spokeClientsUpdated: boolean,
  ): Promise<{ success: true; bundleData: any } | { success: false }> {
    // First attempt: blockchain data (only if spoke clients were updated successfully)
    if (spokeClientsUpdated) {
      const blockchainResult = await this.reconstructBundleWithSource(
        bundle,
        bundleBlockRanges,
        bundleDataClient,
        spokeClients,
        false, // useArweave = false
        "blockchain",
      );

      if (blockchainResult.success) {
        return blockchainResult;
      }

      this.logger.warn({
        at: "Indexer#BundleIncludedEventsService#attemptBundleReconstruction",
        message: `Blockchain reconstruction failed for bundle ${bundle.id}. Trying Arweave fallback.`,
      });
    } else {
      // Skip blockchain reconstruction since spoke clients failed to update
      this.logger.info({
        at: "Indexer#BundleIncludedEventsService#attemptBundleReconstruction",
        message: `Skipping blockchain reconstruction for bundle ${bundle.id} due to spoke client update failure. Using Arweave fallback.`,
      });
    }

    // Arweave fallback attempt
    // Note: Arweave reconstruction doesn't rely on spoke clients being updated
    // since it fetches data directly from Arweave storage
    const arweaveResult = await this.reconstructBundleWithSource(
      bundle,
      bundleBlockRanges,
      bundleDataClient,
      spokeClients,
      true, // useArweave = true
      "arweave",
    );

    if (!arweaveResult.success) {
      this.logger.error({
        at: "Indexer#BundleIncludedEventsService#attemptBundleReconstruction",
        message: `Both blockchain and Arweave reconstruction failed for bundle ${bundle.id}`,
        notificationPath: "across-indexer-error",
      });
    }

    return arweaveResult;
  }

  private async reconstructBundleWithSource(
    bundle: entities.Bundle,
    bundleBlockRanges: number[][],
    bundleDataClient: across.clients.BundleDataClient.BundleDataClient,
    spokeClients: Record<number, across.clients.SpokePoolClient>,
    useArweave: boolean,
    sourceName: string,
  ): Promise<{ success: true; bundleData: any } | { success: false }> {
    this.logger.debug({
      at: "Indexer#BundleIncludedEventsService#reconstructBundleWithSource",
      message: `Attempting bundle ${bundle.id} reconstruction using ${sourceName} data`,
    });

    try {
      const bundleData = await bundleDataClient.loadData(
        bundleBlockRanges,
        spokeClients,
        useArweave,
      );

      // Skip root validation for Arweave reconstruction since there could've been changes in the
      // BundleDataClient logic that makes it impossible to get matching roots
      if (useArweave) {
        this.logger.debug({
          at: "Indexer#BundleIncludedEventsService#reconstructBundleWithSource",
          message: `Skipping root validation for Arweave reconstruction of bundle ${bundle.id}`,
        });
        return { success: true, bundleData };
      }

      // Perform root validation for blockchain reconstruction
      const poolRebalanceRoot = await buildPoolRebalanceRoot(
        bundle.proposal.blockNumber,
        bundleBlockRanges,
        bundleData,
        this.hubPoolClient,
        this.configStoreClient,
        bundleDataClient,
        spokeClients,
      );

      const rootMatches =
        bundle.poolRebalanceRoot === poolRebalanceRoot.tree.getHexRoot();

      if (rootMatches) {
        return { success: true, bundleData };
      } else {
        this.logger.warn({
          at: "Indexer#BundleIncludedEventsService#reconstructBundleWithSource",
          message: `Mismatching roots. Skipping bundle ${bundle.id}.`,
        });
        return { success: false };
      }
    } catch (error) {
      this.logger.warn({
        at: "Indexer#BundleIncludedEventsService#reconstructBundleWithSource",
        message: `Error during ${sourceName} reconstruction for bundle ${bundle.id}`,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false };
    }
  }

  private async getSpokeClientsForLookbackBlockRange(
    lookbackRange: utils.ProposalRangeResult[],
    spokePoolClientFactory: utils.SpokePoolClientFactory,
    latestBlocks: Record<number, number>,
  ) {
    const clients = await Promise.all(
      lookbackRange.map(async ({ chainId, startBlock, endBlock }) => {
        if (EXCLUDED_CHAIN_IDS_FROM_BUNDLE_RECONSTRUCTION.includes(chainId)) {
          return [chainId, null];
        }
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
        let deployedBlockNumber: number;

        try {
          deployedBlockNumber = getDeployedBlockNumber(contractName, chainId);
        } catch (error) {
          this.logger.debug({
            at: "Indexer#BundleIncludedEventsService#getSpokeClientsForLookbackBlockRange",
            message: `Could not get deployed block number for chain ${chainId}`,
            startBlock,
            cappedEndBlock,
          });
          return [chainId, null];
        }

        if (!deployedBlockNumber) {
          this.logger.debug({
            at: "Indexer#BundleIncludedEventsService#getSpokeClientsForLookbackBlockRange",
            message: `No deployed block number found for chain ${chainId}`,
            startBlock,
            cappedEndBlock,
          });
          return [chainId, null];
        }

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
      lookbackRange.map(async ({ chainId, startBlock, endBlock }) => {
        let latestBlock: number;
        // skip if chainid is in the excluded chain ids
        if (EXCLUDED_CHAIN_IDS_FROM_BUNDLE_RECONSTRUCTION.includes(chainId)) {
          return [chainId, endBlock];
        }
        // If chain is disabled, just return the end block as the latest block
        if (startBlock === endBlock) {
          return [chainId, endBlock];
        }
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
