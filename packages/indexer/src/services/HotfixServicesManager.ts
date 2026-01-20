import { Logger } from "winston";
import { DataSource } from "@repo/indexer-database";
import { Config } from "../parseEnv";
import { UnmatchedFillEventsService } from "./UnmatchedFillEventsService";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";
import { IndexerQueuesService } from "../messaging/service";
import { UnmatchedDepositEventsService } from "./UnmatchedDepositEventsService";
export class HotfixServicesManager {
  private unmatchedFillEventsService?: UnmatchedFillEventsService;
  private unmatchedDepositEventsService?: UnmatchedDepositEventsService;

  public constructor(
    private logger: Logger,
    private postgres: DataSource,
    private config: Config,
    private providersFactory: RetryProvidersFactory,
    private indexerQueuesService: IndexerQueuesService,
  ) {}
  public start() {
    return Promise.all([
      this.startUnmatchedFillEventsService(),
      this.startUnmatchedDepositEventsService(),
    ]);
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
    return this.unmatchedFillEventsService.start(60 * 60);
  }

  private startUnmatchedDepositEventsService() {
    if (!this.config.enableHotfixServices) {
      this.logger.warn({
        at: "HotfixServicesManager#startUnmatchedDepositEventsService",
        message: "UnmatchedDepositEventsService is disabled",
      });
      return;
    }
    this.unmatchedDepositEventsService = new UnmatchedDepositEventsService(
      this.postgres,
      this.providersFactory,
      this.logger,
    );
    return this.unmatchedDepositEventsService.start(60 * 60);
  }
}
