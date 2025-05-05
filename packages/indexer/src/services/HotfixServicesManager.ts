import { Logger } from "winston";

import { DataSource } from "@repo/indexer-database";

import { Config } from "../parseEnv";
import { UnmatchedFillEventsService } from "./UnmatchedFillEventsService";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";
import { IndexerQueuesService } from "../messaging/service";

export class HotfixServicesManager {
  private unmatchedFillEventsService?: UnmatchedFillEventsService;

  public constructor(
    private logger: Logger,
    private postgres: DataSource,
    private config: Config,
    private providersFactory: RetryProvidersFactory,
    private indexerQueuesService: IndexerQueuesService,
  ) {}
  public start() {
    return Promise.all([this.startUnmatchedFillEventsService()]);
  }

  public stop() {
    this.unmatchedFillEventsService?.stop();
  }

  private startUnmatchedFillEventsService() {
    if (!this.config.enableHotfixServices) {
      this.logger.warn({
        at: "HotfixServicesManager#startUnmatchedFillEventsService",
        message: "UnmatchedFillEventsService is disabled",
      });
      return;
    }
    this.unmatchedFillEventsService = new UnmatchedFillEventsService(
      this.postgres,
      this.providersFactory,
      this.indexerQueuesService,
      this.logger,
    );
    return this.unmatchedFillEventsService.start(60);
  }
}
