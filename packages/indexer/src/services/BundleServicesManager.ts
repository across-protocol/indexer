import { Logger } from "winston";
import { Config } from "../parseEnv";
import { BundleBuilderService } from "./BundleBuilderService";
import { BundleEventsProcessor } from "./bundles";
import { Redis } from "ioredis";
import { DataSource } from "@repo/indexer-database";
import {
  ConfigStoreClientFactory,
  HubPoolClientFactory,
  SpokePoolClientFactory,
} from "../utils";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";
import { BundleRepository } from "../database/BundleRepository";

export class BundleServicesManager {
  private bundleEventsProcessor?: BundleEventsProcessor;
  private bundleBuilderService?: BundleBuilderService;

  public constructor(
    private config: Config,
    private logger: Logger,
    private redis: Redis,
    private postgres: DataSource,
    private hubPoolClientFactory: HubPoolClientFactory,
    private spokePoolClientFactory: SpokePoolClientFactory,
    private configStoreClientFactory: ConfigStoreClientFactory,
    private retryProvidersFactory: RetryProvidersFactory,
    private bundleRepository: BundleRepository,
  ) {}
  public start() {
    return Promise.all([
      this.startBundleEventsProcessor(),
      this.startBundleBuilderService(),
    ]);
  }

  public stop() {
    this.bundleEventsProcessor?.stop();
    this.bundleBuilderService?.stop();
  }

  private startBundleEventsProcessor() {
    if (!this.config.enableBundleEventsProcessor) {
      this.logger.warn("Bundle events processor is disabled");
      return;
    }
    this.bundleEventsProcessor = new BundleEventsProcessor({
      logger: this.logger,
      redis: this.redis,
      postgres: this.postgres,
      bundleRepository: this.bundleRepository,
    });
    return this.bundleEventsProcessor.start(10);
  }

  private startBundleBuilderService() {
    if (!this.config.enableBundleBuilder) {
      this.logger.warn("Bundle builder service is disabled");
      return;
    }

    this.bundleBuilderService = new BundleBuilderService({
      logger: this.logger,
      redis: this.redis,
      bundleRepository: this.bundleRepository,
      providerFactory: this.retryProvidersFactory,
      hubClientFactory: this.hubPoolClientFactory,
      spokePoolClientFactory: this.spokePoolClientFactory,
      configStoreClientFactory: this.configStoreClientFactory,
      hubChainId: this.config.hubChainId,
    });
    return this.bundleBuilderService.start(10);
  }
}
