import { getDeployedBlockNumber } from "@across-protocol/contracts";
import winston from "winston";
import * as across from "@across-protocol/sdk";
import Redis from "ioredis";
import { DataSource, entities } from "@repo/indexer-database";
import { differenceWith, isEqual } from "lodash";

import { RedisCache } from "../redis/redisCache";
import { SpokePoolRepository } from "../database/SpokePoolRepository";
import { RangeQueryStore, Ranges } from "../redis/rangeQueryStore";
import * as utils from "../utils";
import { IndexerQueues, IndexerQueuesService } from "../messaging/service";
import { RelayHashInfoMessage } from "../messaging/RelayHashInfoWorker";
import { BaseIndexer } from "../generics";
import { providers } from "ethers";

type Config = {
  logger: winston.Logger;
  redis: Redis;
  postgres: DataSource;
  indexerQueuesService: IndexerQueuesService;
  retryProviderConfig: utils.RetryProviderConfig;
  configStoreConfig: {
    chainId: number;
    providerUrl: string;
    maxBlockLookBack: number;
  };
  hubConfig: {
    chainId: number;
    providerUrl: string;
    maxBlockLookBack: number;
  };
  spokeConfig: {
    chainId: number;
    providerUrl: string;
    maxBlockLookBack: number;
  };
  redisKeyPrefix: string;
};

export class Indexer extends BaseIndexer {
  private indexerQueuesService: IndexerQueuesService;
  private resolvedRangeStore: RangeQueryStore;
  private hubPoolClient: across.clients.HubPoolClient;
  private spokePoolClientRepository: SpokePoolRepository;
  private spokePoolProvider: providers.Provider;
  private configStoreClient: across.clients.AcrossConfigStoreClient;

  constructor(private readonly config: Config) {
    super(config.logger, "spokePool");
  }

  protected async initialize(): Promise<void> {
    const {
      logger,
      redis,
      postgres,
      indexerQueuesService,
      retryProviderConfig,
      redisKeyPrefix,
      hubConfig,
      spokeConfig,
      configStoreConfig,
    } = this.config;

    this.indexerQueuesService = indexerQueuesService;

    this.resolvedRangeStore = new RangeQueryStore({
      redis,
      prefix: `${redisKeyPrefix}:rangeQuery:resolved`,
    });

    const redisCache = new RedisCache(redis);
    const hubPoolProvider = utils.getRetryProvider({
      ...retryProviderConfig,
      cache: redisCache,
      logger,
      ...hubConfig,
    });
    const configStoreProvider = utils.getRetryProvider({
      ...retryProviderConfig,
      cache: redisCache,
      logger,
      ...configStoreConfig,
    });
    this.spokePoolProvider = utils.getRetryProvider({
      ...retryProviderConfig,
      cache: redisCache,
      logger,
      ...spokeConfig,
    });

    this.spokePoolClientRepository = new SpokePoolRepository(
      postgres,
      logger,
      true,
    );

    this.configStoreClient = await utils.getConfigStoreClient({
      logger,
      provider: configStoreProvider,
      maxBlockLookBack: configStoreConfig.maxBlockLookBack,
      chainId: configStoreConfig.chainId,
    });
    this.hubPoolClient = await utils.getHubPoolClient({
      configStoreClient: this.configStoreClient,
      provider: hubPoolProvider,
      logger,
      maxBlockLookBack: hubConfig.maxBlockLookBack,
      chainId: hubConfig.chainId,
    });
  }

  protected async indexerLogic(): Promise<void> {
    const allPendingQueries = await this.getUnprocessedRanges();
    this.logger.info({
      message: `Running indexer on ${allPendingQueries.length} block range requests`,
    });
    for (const query of allPendingQueries) {
      if (this.stopRequested) break;
      const [fromBlock, toBlock] = query;
      try {
        this.logger.info({
          message: `Starting update for block range ${fromBlock} to ${toBlock}`,
          query,
        });
        const events = await this.fetchEventsByRange(fromBlock, toBlock);
        // TODO: may need to catch error to see if there is some data that exists in db already or change storage to overwrite any existing values
        await this.storeEvents(events);

        await this.resolvedRangeStore.setByRange(fromBlock, toBlock);
        this.logger.info({
          message: `Completed update for block range ${fromBlock} to ${toBlock}`,
          query,
        });
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error({
            message: `Error updating for block range ${fromBlock} to ${toBlock}`,
            query,
            errorMessage: error.message,
          });
        } else {
          // not an error type, throw it and crash app likely
          throw error;
        }
      }
    }
  }

  private async storeEvents(params: {
    v3FundsDepositedEvents: across.interfaces.DepositWithBlock[];
    filledV3RelayEvents: across.interfaces.FillWithBlock[];
    requestedV3SlowFillEvents: across.interfaces.SlowFillRequestWithBlock[];
    requestedSpeedUpV3Events: {
      [depositorAddress: string]: {
        [depositId: number]: across.interfaces.SpeedUpWithBlock[];
      };
    };
    relayedRootBundleEvents: across.interfaces.RootBundleRelayWithBlock[];
    executedRelayerRefundRootEvents: across.interfaces.RelayerRefundExecutionWithBlock[];
    tokensBridgedEvents: across.interfaces.TokensBridged[];
  }) {
    const { spokePoolClientRepository } = this;

    const {
      v3FundsDepositedEvents,
      filledV3RelayEvents,
      requestedV3SlowFillEvents,
      requestedSpeedUpV3Events,
      relayedRootBundleEvents,
      executedRelayerRefundRootEvents,
      tokensBridgedEvents,
    } = params;
    const savedV3FundsDepositedEvents =
      await spokePoolClientRepository.formatAndSaveV3FundsDepositedEvents(
        v3FundsDepositedEvents,
      );
    await this.publishRelayHashInfoMessages(
      savedV3FundsDepositedEvents,
      "V3FundsDeposited",
    );

    const savedRequestedV3SlowFillEvents =
      await spokePoolClientRepository.formatAndSaveRequestedV3SlowFillEvents(
        requestedV3SlowFillEvents,
      );
    await this.publishRelayHashInfoMessages(
      savedRequestedV3SlowFillEvents,
      "RequestedV3SlowFill",
    );

    const savedFilledV3RelayEvents =
      await spokePoolClientRepository.formatAndSaveFilledV3RelayEvents(
        filledV3RelayEvents,
      );
    await this.publishRelayHashInfoMessages(
      savedFilledV3RelayEvents,
      "FilledV3Relay",
    );

    await spokePoolClientRepository.formatAndSaveRequestedSpeedUpV3Events(
      requestedSpeedUpV3Events,
    );
    await spokePoolClientRepository.formatAndSaveRelayedRootBundleEvents(
      relayedRootBundleEvents,
      this.config.spokeConfig.chainId,
    );
    await spokePoolClientRepository.formatAndSaveExecutedRelayerRefundRootEvents(
      executedRelayerRefundRootEvents,
    );
    await spokePoolClientRepository.formatAndSaveTokensBridgedEvents(
      tokensBridgedEvents,
    );
  }
  private async getUnprocessedRanges(toBlock?: number): Promise<Ranges> {
    const deployedBlockNumber = getDeployedBlockNumber(
      "SpokePool",
      this.config.spokeConfig.chainId,
    );
    const spokeLatestBlockNumber =
      toBlock ?? (await this.spokePoolProvider.getBlockNumber());

    const allPaginatedBlockRanges = across.utils.getPaginatedBlockRanges({
      fromBlock: deployedBlockNumber,
      toBlock: spokeLatestBlockNumber,
      maxBlockLookBack: this.config.spokeConfig.maxBlockLookBack,
    });

    const allQueries = await this.resolvedRangeStore.entries();
    const resolvedRanges = allQueries.map(([, x]) => [x.fromBlock, x.toBlock]);
    const needsProcessing = differenceWith(
      allPaginatedBlockRanges,
      resolvedRanges,
      isEqual,
    );

    this.logger.info({
      message: `${needsProcessing.length} block ranges need processing`,
      deployedBlockNumber,
      spokeLatestBlockNumber,
    });

    return needsProcessing;
  }

  private async fetchEventsByRange(fromBlock: number, toBlock: number) {
    this.logger.info({
      message: "updating config store client",
      fromBlock,
      toBlock,
    });
    await this.configStoreClient.update();
    this.logger.info({
      message: "updated config store client",
      fromBlock,
      toBlock,
    });

    this.logger.info({
      message: "updating hubpool client",
      fromBlock,
      toBlock,
    });
    await this.hubPoolClient.update();
    this.logger.info({
      message: "updated hubpool client",
      fromBlock,
      toBlock,
    });

    const spokeClient = await utils.getSpokeClient({
      hubPoolClient: this.hubPoolClient,
      provider: this.spokePoolProvider,
      logger: this.logger,
      maxBlockLookBack: this.config.spokeConfig.maxBlockLookBack,
      chainId: this.config.spokeConfig.chainId,
      fromBlock,
      toBlock,
    });

    this.logger.info({
      message: "updating spokepool client",
      fromBlock,
      toBlock,
    });
    await spokeClient.update();
    this.logger.info({
      message: "updated spokepool client",
      fromBlock,
      toBlock,
    });

    const v3FundsDepositedEvents = spokeClient.getDeposits();
    const filledV3RelayEvents = spokeClient.getFills();
    const requestedV3SlowFillEvents =
      spokeClient.getSlowFillRequestsForOriginChain(
        this.config.spokeConfig.chainId,
      );
    const requestedSpeedUpV3Events = spokeClient.getSpeedUps();
    const relayedRootBundleEvents = spokeClient.getRootBundleRelays();
    const executedRelayerRefundRootEvents =
      spokeClient.getRelayerRefundExecutions();
    const tokensBridgedEvents = spokeClient.getTokensBridged();

    return {
      v3FundsDepositedEvents,
      filledV3RelayEvents,
      requestedV3SlowFillEvents,
      requestedSpeedUpV3Events,
      relayedRootBundleEvents,
      executedRelayerRefundRootEvents,
      tokensBridgedEvents,
    };
  }

  private async publishRelayHashInfoMessages(
    events:
      | entities.V3FundsDeposited[]
      | entities.FilledV3Relay[]
      | entities.RequestedV3SlowFill[],
    eventType: "V3FundsDeposited" | "FilledV3Relay" | "RequestedV3SlowFill",
  ) {
    const messages: RelayHashInfoMessage[] = events.map((event) => {
      return {
        relayHash: event.relayHash,
        eventType,
        eventId: event.id,
        depositId: event.depositId,
        originChainId: event.originChainId,
      };
    });
    await this.indexerQueuesService.publishMessagesBulk(
      IndexerQueues.RelayHashInfo,
      IndexerQueues.RelayHashInfo, // use queue name as job name
      messages,
    );
  }
}
