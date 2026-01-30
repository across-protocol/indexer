import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import { DataSource } from "@repo/indexer-database";
import { eventProcessorManager } from "@repo/webhooks";

import { Config } from "../../parseEnv";
import {
  getFinalisedBlockBufferDistance,
  getIndexingDelaySeconds,
} from "./constants";
// Indexers
import { Indexer, SvmIndexer, EvmIndexer } from "./Indexer";
import { HubPoolIndexerDataHandler } from "./HubPoolIndexerDataHandler";
import { SpokePoolIndexerDataHandler } from "./SpokePoolIndexerDataHandler";
import { SvmSpokePoolIndexerDataHandler } from "./SvmSpokePoolIndexerDataHandler";
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
// Processors
import { BundleEventsProcessor, SpokePoolProcessor } from "../../services";
import { IndexerQueuesService } from "../../messaging/service";
// Repositories
import { BundleRepository } from "../../database/BundleRepository";
import { HubPoolRepository } from "../../database/HubPoolRepository";
import { SpokePoolRepository } from "../../database/SpokePoolRepository";
import { SwapBeforeBridgeRepository } from "../../database/SwapBeforeBridgeRepository";
import { CallsFailedRepository } from "../../database/CallsFailedRepository";
import { SwapMetadataRepository } from "../../database/SwapMetadataRepository";

export class AcrossIndexerManager {
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

  public async start(signal: AbortSignal) {
    return Promise.all([
      this.startHubPoolIndexer(signal),
      this.startEvmSpokePoolIndexers(signal),
      this.startSvmSpokePoolIndexers(signal),
    ]);
  }

  private startHubPoolIndexer(signal: AbortSignal) {
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
    const hubPoolIndexer = new EvmIndexer(
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

    return hubPoolIndexer.start(signal);
  }

  private async startEvmSpokePoolIndexers(signal: AbortSignal) {
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

    if (evmSpokePoolIndexers.length === 0) {
      this.logger.warn({
        at: "Indexer#AcrossIndexerManager#startEvmSpokePoolIndexers",
        message: "No EVM spoke pool indexers to start",
      });
      return;
    }
    return Promise.all(
      evmSpokePoolIndexers.map((indexer) => indexer.start(signal)),
    );
  }

  private startSvmSpokePoolIndexers(signal: AbortSignal) {
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

    if (svmSpokePoolIndexers.length === 0) {
      this.logger.warn({
        at: "Indexer#AcrossIndexerManager#startSvmSpokePoolIndexers",
        message: "No SVM spoke pool indexers to start",
      });
      return;
    }

    return Promise.all(
      svmSpokePoolIndexers.map((indexer) => indexer.start(signal)),
    );
  }
}
