import * as across from "@across-protocol/sdk";
import { Logger } from "winston";
import { DataSource } from "@repo/indexer-database";
import { eventProcessorManager } from "@repo/webhooks";
// Repositories
import { BundleRepository } from "../../database/BundleRepository";
import { CallsFailedRepository } from "../../database/CallsFailedRepository";
import { HubPoolRepository } from "../../database/HubPoolRepository";
import { SpokePoolRepository } from "../../database/SpokePoolRepository";
import { SwapBeforeBridgeRepository } from "../../database/SwapBeforeBridgeRepository";
import { SwapMetadataRepository } from "../../database/SwapMetadataRepository";
import { IndexerQueuesService } from "../../messaging/service";
import { Config } from "../../parseEnv";
// Processors
import { BundleEventsProcessor, SpokePoolProcessor } from "../../services";
// Factories
import {
  ConfigStoreClientFactory,
  HubPoolClientFactory,
  SpokePoolClientFactory,
} from "../../utils";
import {
  RetryProvidersFactory,
  SvmProvider,
} from "../../web3/RetryProvidersFactory";
import {
  getFinalisedBlockBufferDistance,
  getIndexingDelaySeconds,
} from "./constants";
import { HubPoolIndexerDataHandler } from "./HubPoolIndexerDataHandler";
// Indexers
import { EvmIndexer, Indexer, SvmIndexer } from "./Indexer";
import { SpokePoolIndexerDataHandler } from "./SpokePoolIndexerDataHandler";
import { SvmSpokePoolIndexerDataHandler } from "./SvmSpokePoolIndexerDataHandler";

export class AcrossIndexerManager {
  private hubPoolIndexer?: Indexer;
  private evmSpokePoolIndexers: Indexer[] = [];
  private svmSpokePoolIndexers: Indexer[] = [];
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
    private swapBeforeBridgeRepository: SwapBeforeBridgeRepository,
    private callsFailedRepository: CallsFailedRepository,
    private swapMetadataRepository: SwapMetadataRepository,
    private bundleRepository: BundleRepository,
    private indexerQueuesService: IndexerQueuesService,
    private webhookWriteFn?: eventProcessorManager.WebhookWriteFn,
  ) {}

  public async start() {
    return Promise.all([
      this.startHubPoolIndexer(),
      this.startEvmSpokePoolIndexers(),
      this.startSvmSpokePoolIndexers(),
    ]);
  }

  public async stopGracefully() {
    this.hubPoolIndexer?.stopGracefully();
    this.evmSpokePoolIndexers.map((indexer) => indexer.stopGracefully());
    this.svmSpokePoolIndexers.map((indexer) => indexer.stopGracefully());
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
      new BundleEventsProcessor(this.logger, this.bundleRepository),
    );
    this.hubPoolIndexer = new EvmIndexer(
      {
        indexingDelaySeconds: getIndexingDelaySeconds(
          this.config.hubChainId,
          this.config,
        ),
        finalisedBlockBufferDistance: getFinalisedBlockBufferDistance(
          this.config.hubChainId,
        ),
      },
      hubPoolIndexerDataHandler,
      this.logger,
      this.postgres,
      this.retryProvidersFactory.getProviderForChainId(
        this.config.hubChainId,
      ) as across.providers.RetryProvider,
    );

    return this.hubPoolIndexer.start();
  }

  private async startEvmSpokePoolIndexers() {
    const evmSpokePoolIndexers = this.config.evmSpokePoolChainsEnabled.map(
      (chainId) => {
        const spokePoolIndexerDataHandler = new SpokePoolIndexerDataHandler(
          this.logger,
          chainId,
          this.config.hubChainId,
          this.retryProvidersFactory.getProviderForChainId(
            chainId,
          ) as across.providers.RetryProvider,
          this.configStoreClientFactory,
          this.hubPoolClientFactory,
          this.spokePoolClientFactory,
          this.spokePoolRepository,
          this.swapBeforeBridgeRepository,
          this.callsFailedRepository,
          this.swapMetadataRepository,
          new SpokePoolProcessor(
            this.postgres,
            chainId,
            this.logger,
            this.webhookWriteFn,
          ),
          this.indexerQueuesService,
        );
        const spokePoolIndexer = new EvmIndexer(
          {
            indexingDelaySeconds: getIndexingDelaySeconds(chainId, this.config),
            finalisedBlockBufferDistance:
              getFinalisedBlockBufferDistance(chainId),
            maxBlockRangeSize: this.config.maxBlockRangeSize,
          },
          spokePoolIndexerDataHandler,
          this.logger,
          this.postgres,
          this.retryProvidersFactory.getProviderForChainId(
            chainId,
          ) as across.providers.RetryProvider,
        );
        return spokePoolIndexer;
      },
    );
    this.evmSpokePoolIndexers = evmSpokePoolIndexers;

    if (this.evmSpokePoolIndexers.length === 0) {
      this.logger.warn({
        at: "Indexer#AcrossIndexerManager#startEvmSpokePoolIndexers",
        message: "No EVM spoke pool indexers to start",
      });
      return;
    }
    return Promise.all(
      this.evmSpokePoolIndexers.map((indexer) => indexer.start()),
    );
  }

  private startSvmSpokePoolIndexers() {
    const svmSpokePoolIndexers = this.config.svmSpokePoolChainsEnabled.map(
      (chainId) => {
        const svmSpokePoolIndexerDataHandler =
          new SvmSpokePoolIndexerDataHandler(
            this.logger,
            chainId,
            this.config.hubChainId,
            this.retryProvidersFactory.getProviderForChainId(
              chainId,
            ) as SvmProvider,
            this.configStoreClientFactory,
            this.hubPoolClientFactory,
            this.spokePoolClientFactory,
            this.spokePoolRepository,
            new SpokePoolProcessor(
              this.postgres,
              chainId,
              this.logger,
              this.webhookWriteFn,
            ),
            this.indexerQueuesService,
          );
        const svmIndexer = new SvmIndexer(
          {
            indexingDelaySeconds: getIndexingDelaySeconds(chainId, this.config),
            finalisedBlockBufferDistance:
              getFinalisedBlockBufferDistance(chainId),
            maxBlockRangeSize: this.config.maxBlockRangeSize,
          },
          svmSpokePoolIndexerDataHandler,
          this.logger,
          this.postgres,
          this.retryProvidersFactory.getProviderForChainId(
            chainId,
          ) as SvmProvider,
        );
        return svmIndexer;
      },
    );
    this.svmSpokePoolIndexers = svmSpokePoolIndexers;

    if (this.svmSpokePoolIndexers.length === 0) {
      this.logger.warn({
        at: "Indexer#AcrossIndexerManager#startSvmSpokePoolIndexers",
        message: "No SVM spoke pool indexers to start",
      });
      return;
    }

    return Promise.all(
      this.svmSpokePoolIndexers.map((indexer) => indexer.start()),
    );
  }
}
