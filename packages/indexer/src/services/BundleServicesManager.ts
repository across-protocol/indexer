import { Logger } from "winston";
import { Config } from "../parseEnv";
import { BundleBuilderService } from "./BundleBuilderService";
import { Redis } from "ioredis";
import { DataSource } from "@repo/indexer-database";
import {
  ConfigStoreClientFactory,
  HubPoolClientFactory,
  SpokePoolClientFactory,
} from "../utils";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";
import { BundleRepository } from "../database/BundleRepository";
import { BundleIncludedEventsService } from "./BundleIncludedEventsService";
import { RefundedDepositsStatusService } from "./RefundedDepositsStatusService";

export class BundleServicesManager {
  private bundleBuilderService?: BundleBuilderService;
  private bundleIncludedEventsService?: BundleIncludedEventsService;

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
  public start(signal: AbortSignal) {
    return Promise.all([
      this.startBundleBuilderService(signal),
      this.startBundleIncludedEventsService(signal),
    ]);
  }

  private startBundleIncludedEventsService(signal: AbortSignal) {
    if (!this.config.enableBundleIncludedEventsService) {
      this.logger.warn({
        at: "Indexer#BundleServicesManager#startBundleIncludedEventsService",
        message: "Bundle included events service is disabled",
      });
      return;
    }
    const refundedDepositsStatusService = new RefundedDepositsStatusService(
      this.logger,
      this.postgres,
    );
    this.bundleIncludedEventsService = new BundleIncludedEventsService({
      hubChainId: this.config.hubChainId,
      logger: this.logger,
      redis: this.redis,
      postgres: this.postgres,
      hubPoolClientFactory: this.hubPoolClientFactory,
      spokePoolClientFactory: this.spokePoolClientFactory,
      bundleRepository: this.bundleRepository,
      retryProvidersFactory: this.retryProvidersFactory,
      config: this.config,
      refundedDepositsStatusService,
    });
    return this.bundleIncludedEventsService.start(
      this.config.bundleEventsServiceDelaySeconds!,
      signal,
    );
  }

  private startBundleBuilderService(signal: AbortSignal) {
    if (!this.config.enableBundleBuilder) {
      this.logger.warn({
        at: "Indexer#BundleServicesManager#startBundleBuilderService",
        message: "Bundle builder service is disabled",
      });
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
    return this.bundleBuilderService.start(10, signal);
  }
}
