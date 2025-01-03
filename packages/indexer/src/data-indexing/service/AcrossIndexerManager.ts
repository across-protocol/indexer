import { Logger } from "winston";

import { DataSource, entities, Repository } from "@repo/indexer-database";
import { eventProcessorManager } from "@repo/webhooks";

import { Config } from "../../parseEnv";
import { HubPoolRepository } from "../../database/HubPoolRepository";
import { RedisCache } from "../../redis/redisCache";
import { RetryProvidersFactory } from "../../web3/RetryProvidersFactory";
import { SpokePoolRepository } from "../../database/SpokePoolRepository";
import { IndexerQueuesService } from "../../messaging/service";
import { SpokePoolProcessor } from "../../services/spokePoolProcessor";

import { HubPoolIndexerDataHandler } from "./HubPoolIndexerDataHandler";
import { SpokePoolIndexerDataHandler } from "./SpokePoolIndexerDataHandler";
import {
  ConfigStoreClientFactory,
  HubPoolClientFactory,
  SpokePoolClientFactory,
} from "../../utils";
import { Indexer } from "./Indexer";
import {
  getFinalisedBlockBufferDistance,
  getLoopWaitTimeSeconds,
} from "./constants";

export class AcrossIndexerManager {
  private hubPoolIndexer?: Indexer;
  private spokePoolIndexers: Indexer[] = [];

  constructor(
    private logger: Logger,
    private config: Config,
    private postgres: DataSource,
    private configStoreClientFactory: ConfigStoreClientFactory,
    private hubPoolClientFactory: HubPoolClientFactory,
    private spokePoolClientFactory: SpokePoolClientFactory,
    private retryProvidersFactory: RetryProvidersFactory,
    private hubPoolRepository: HubPoolRepository,
    private spokePoolRepository: SpokePoolRepository,
    private swapBeforeBridgeRepository: Repository<entities.SwapBeforeBridgeEvent>,
    private redisCache: RedisCache,
    private indexerQueuesService: IndexerQueuesService,
    private webhookWriteFn?: eventProcessorManager.WebhookWriteFn,
  ) {}

  public async start() {
    return Promise.all([
      this.startHubPoolIndexer(),
      this.startSpokePoolIndexers(),
    ]);
  }

  public async stopGracefully() {
    this.hubPoolIndexer?.stopGracefully();
    this.spokePoolIndexers.map((indexer) => indexer.stopGracefully());
  }

  private startHubPoolIndexer() {
    if (!this.config.enableHubPoolIndexer) {
      this.logger.warn({
        at: "Indexer#AcrossIndexerManager#startHubPoolIndexer",
        message: "Hub pool indexer is disabled",
      });
      return;
    }
    const hubPoolIndexerDataHandler = new HubPoolIndexerDataHandler(
      this.logger,
      this.config.hubChainId,
      this.configStoreClientFactory,
      this.hubPoolClientFactory,
      this.hubPoolRepository,
    );
    this.hubPoolIndexer = new Indexer(
      {
        loopWaitTimeSeconds: getLoopWaitTimeSeconds(this.config.hubChainId),
        finalisedBlockBufferDistance: getFinalisedBlockBufferDistance(
          this.config.hubChainId,
        ),
      },
      hubPoolIndexerDataHandler,
      this.retryProvidersFactory.getProviderForChainId(this.config.hubChainId),
      this.redisCache,
      this.logger,
    );

    return this.hubPoolIndexer.start();
  }

  private async startSpokePoolIndexers() {
    const spokePoolIndexers = this.config.spokePoolChainsEnabled.map(
      (chainId) => {
        const spokePoolIndexerDataHandler = new SpokePoolIndexerDataHandler(
          this.logger,
          chainId,
          this.config.hubChainId,
          this.retryProvidersFactory.getProviderForChainId(chainId),
          this.configStoreClientFactory,
          this.hubPoolClientFactory,
          this.spokePoolClientFactory,
          this.spokePoolRepository,
          new SpokePoolProcessor(
            this.postgres,
            this.logger,
            chainId,
            this.webhookWriteFn,
          ),
          this.indexerQueuesService,
          this.swapBeforeBridgeRepository,
        );
        const spokePoolIndexer = new Indexer(
          {
            loopWaitTimeSeconds: getLoopWaitTimeSeconds(chainId),
            finalisedBlockBufferDistance:
              getFinalisedBlockBufferDistance(chainId),
          },
          spokePoolIndexerDataHandler,
          this.retryProvidersFactory.getProviderForChainId(chainId),
          this.redisCache,
          this.logger,
        );
        return spokePoolIndexer;
      },
    );
    this.spokePoolIndexers = spokePoolIndexers;

    if (this.spokePoolIndexers.length === 0) {
      this.logger.warn({
        at: "Indexer#AcrossIndexerManager#startSpokePoolIndexers",
        message: "No spoke pool indexers to start",
      });
      return;
    }
    return Promise.all(
      this.spokePoolIndexers.map((indexer) => indexer.start()),
    );
  }
}
