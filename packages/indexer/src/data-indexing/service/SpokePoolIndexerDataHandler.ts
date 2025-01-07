import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import {
  getDeployedAddress,
  getDeployedBlockNumber,
} from "@across-protocol/contracts";
import {
  entities,
  utils as indexerDatabaseUtils,
  SaveQueryResult,
} from "@repo/indexer-database";
import { SaveQueryResultType } from "@repo/indexer-database";

import { BlockRange } from "../model";
import { IndexerDataHandler } from "./IndexerDataHandler";

import * as utils from "../../utils";
import { getIntegratorId } from "../../utils/spokePoolUtils";
import { SpokePoolRepository } from "../../database/SpokePoolRepository";
import { SpokePoolProcessor } from "../../services/spokePoolProcessor";
import { IndexerQueues, IndexerQueuesService } from "../../messaging/service";
import { IntegratorIdMessage } from "../../messaging/IntegratorIdWorker";

export type FetchEventsResult = {
  v3FundsDepositedEvents: utils.V3FundsDepositedWithIntegradorId[];
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
  blockTimes: Record<number, number>;
};

export type StoreEventsResult = {
  deposits: SaveQueryResult<entities.V3FundsDeposited>[];
  fills: SaveQueryResult<entities.FilledV3Relay>[];
  slowFillRequests: SaveQueryResult<entities.RequestedV3SlowFill>[];
  executedRefundRoots: SaveQueryResult<entities.ExecutedRelayerRefundRoot>[];
};

export class SpokePoolIndexerDataHandler implements IndexerDataHandler {
  private isInitialized: boolean;
  private configStoreClient: across.clients.AcrossConfigStoreClient;
  private hubPoolClient: across.clients.HubPoolClient;

  constructor(
    private logger: Logger,
    private chainId: number,
    private hubPoolChainId: number,
    private provider: across.providers.RetryProvider,
    private configStoreFactory: utils.ConfigStoreClientFactory,
    private hubPoolFactory: utils.HubPoolClientFactory,
    private spokePoolFactory: utils.SpokePoolClientFactory,
    private spokePoolClientRepository: SpokePoolRepository,
    private spokePoolProcessor: SpokePoolProcessor,
    private indexerQueuesService: IndexerQueuesService,
  ) {
    this.isInitialized = false;
  }

  public getDataIdentifier() {
    return `${getDeployedAddress("SpokePool", this.chainId)}:${this.chainId}`;
  }
  public getStartIndexingBlockNumber() {
    return getDeployedBlockNumber("SpokePool", this.chainId);
  }

  public async processBlockRange(
    blockRange: BlockRange,
    lastFinalisedBlock: number,
  ) {
    this.logger.debug({
      at: "Indexer#SpokePoolIndexerDataHandler#processBlockRange",
      message: `Processing block range ${this.getDataIdentifier()}`,
      blockRange,
      lastFinalisedBlock,
    });

    if (!this.isInitialized) {
      this.initialize();
      this.isInitialized = true;
    }

    const events = await this.fetchEventsByRange(blockRange);
    const requestedSpeedUpV3EventsCount = Object.values(
      events.requestedSpeedUpV3Events,
    ).reduce((acc, speedUps) => {
      return acc + Object.values(speedUps).length;
    }, 0);
    this.logger.debug({
      at: "Indexer#SpokePoolIndexerDataHandler#processBlockRange",
      message: `Found events for ${this.getDataIdentifier()}`,
      events: {
        v3FundsDepositedEvents: events.v3FundsDepositedEvents.length,
        filledV3RelayEvents: events.filledV3RelayEvents.length,
        requestedV3SlowFillEvents: events.requestedV3SlowFillEvents.length,
        requestedSpeedUpV3Events: requestedSpeedUpV3EventsCount,
        relayedRootBundleEvents: events.relayedRootBundleEvents.length,
        executedRelayerRefundRootEvents:
          events.executedRelayerRefundRootEvents.length,
        tokensBridgedEvents: events.tokensBridgedEvents.length,
      },
      blockRange,
    });
    const storedEvents = await this.storeEvents(events, lastFinalisedBlock);
    const newInsertedDeposits = indexerDatabaseUtils.filterSaveQueryResults(
      storedEvents.deposits,
      SaveQueryResultType.Inserted,
    );
    await this.updateNewDepositsWithIntegratorId(newInsertedDeposits);
    await this.spokePoolProcessor.process(storedEvents);
    this.profileStoreEvents(storedEvents);
  }

  /**
   * Log the time that it took to store the events from the moment they were emitted onchain
   * @param events
   */
  private profileStoreEvents(events: StoreEventsResult) {
    const insertedDeposits = indexerDatabaseUtils.filterSaveQueryResults(
      events.deposits,
      SaveQueryResultType.Inserted,
    );

    // Log the time difference for each deposit event for profiling in datadog
    insertedDeposits.forEach((event) => {
      if (event.blockTimestamp === undefined) return;
      const timeDifference =
        event.createdAt.getTime() - event.blockTimestamp.getTime();
      this.logger.debug({
        at: "SpokePoolIndexerDataHandler#profileStoreEvents",
        message: "V3FundsDeposited event profile",
        depositId: event.depositId,
        originChainId: event.originChainId,
        timeDifference,
        createdAt: event.createdAt,
        blockTimestamp: event.blockTimestamp,
      });
    });

    const insertedFills = indexerDatabaseUtils.filterSaveQueryResults(
      events.fills,
      SaveQueryResultType.Inserted,
    );
    insertedFills.forEach((event) => {
      if (event.blockTimestamp === undefined) return;
      const timeDifference =
        event.createdAt.getTime() - event.blockTimestamp.getTime();
      this.logger.debug({
        at: "SpokePoolIndexerDataHandler#profileStoreEvents",
        message: "FilledV3Relay event profile",
        depositId: event.depositId,
        originChainId: event.originChainId,
        destinationChainId: event.destinationChainId,
        timeDifference,
        createdAt: event.createdAt,
        blockTimestamp: event.blockTimestamp,
      });
    });
  }

  private async getBlockTime(blockNumber: number): Promise<number> {
    const block = await this.provider.getBlock(blockNumber);
    if (!block) {
      throw new Error(`Block with number ${blockNumber} not found`);
    }
    return block.timestamp;
  }

  private async getBlockTimes(
    blockNumbers: number[],
  ): Promise<Record<number, number>> {
    const uniqueBlockNumbers = [...new Set(blockNumbers)];
    const timestamps = await Promise.all(
      uniqueBlockNumbers.map((blockNumber) => this.getBlockTime(blockNumber)),
    );

    const blockTimestamps = uniqueBlockNumbers.reduce(
      (acc, blockNumber, index) => {
        if (timestamps[index] === undefined) {
          throw new Error(`Block time for block ${blockNumber} not found`);
        }
        acc[blockNumber] = timestamps[index];
        return acc;
      },
      {} as Record<number, number>,
    );
    return blockTimestamps;
  }

  private async fetchEventsByRange(
    blockRange: BlockRange,
  ): Promise<FetchEventsResult> {
    const { configStoreClient, hubPoolClient } = this;
    const spokePoolClient = this.spokePoolFactory.get(
      this.chainId,
      blockRange.from,
      blockRange.to,
      {
        hubPoolClient: this.hubPoolClient,
      },
    );

    await configStoreClient.update();
    await hubPoolClient.update([
      "SetPoolRebalanceRoute",
      "CrossChainContractsSet",
    ]);
    await spokePoolClient.update();

    const v3FundsDepositedEvents = spokePoolClient.getDeposits({
      fromBlock: blockRange.from,
      toBlock: blockRange.to,
    });
    const filledV3RelayEvents = spokePoolClient.getFills();
    const requestedV3SlowFillEvents =
      spokePoolClient.getSlowFillRequestsForOriginChain(this.chainId);
    const requestedSpeedUpV3Events = spokePoolClient.getSpeedUps();
    const relayedRootBundleEvents = spokePoolClient.getRootBundleRelays();
    const executedRelayerRefundRootEvents =
      spokePoolClient.getRelayerRefundExecutions();
    const tokensBridgedEvents = spokePoolClient.getTokensBridged();
    // getBlockTimes function will make sure we dont query more than we need to.
    const blockNumbers = [
      ...v3FundsDepositedEvents.map((deposit) => deposit.blockNumber),
      ...filledV3RelayEvents.map((fill) => fill.blockNumber),
    ];
    const blockTimes = await this.getBlockTimes(blockNumbers);

    return {
      v3FundsDepositedEvents,
      filledV3RelayEvents,
      requestedV3SlowFillEvents,
      requestedSpeedUpV3Events,
      relayedRootBundleEvents,
      executedRelayerRefundRootEvents,
      tokensBridgedEvents,
      blockTimes,
    };
  }

  private async storeEvents(
    params: FetchEventsResult,
    lastFinalisedBlock: number,
  ): Promise<StoreEventsResult> {
    const { spokePoolClientRepository } = this;
    const {
      v3FundsDepositedEvents,
      filledV3RelayEvents,
      requestedV3SlowFillEvents,
      requestedSpeedUpV3Events,
      relayedRootBundleEvents,
      executedRelayerRefundRootEvents,
      tokensBridgedEvents,
      blockTimes,
    } = params;
    const savedV3FundsDepositedEvents =
      await spokePoolClientRepository.formatAndSaveV3FundsDepositedEvents(
        v3FundsDepositedEvents,
        lastFinalisedBlock,
        blockTimes,
      );
    const savedV3RequestedSlowFills =
      await spokePoolClientRepository.formatAndSaveRequestedV3SlowFillEvents(
        requestedV3SlowFillEvents,
        lastFinalisedBlock,
      );
    const savedFilledV3RelayEvents =
      await spokePoolClientRepository.formatAndSaveFilledV3RelayEvents(
        filledV3RelayEvents,
        lastFinalisedBlock,
        blockTimes,
      );
    const savedExecutedRelayerRefundRootEvents =
      await spokePoolClientRepository.formatAndSaveExecutedRelayerRefundRootEvents(
        executedRelayerRefundRootEvents,
        lastFinalisedBlock,
      );
    await spokePoolClientRepository.formatAndSaveRequestedSpeedUpV3Events(
      requestedSpeedUpV3Events,
      lastFinalisedBlock,
    );
    await spokePoolClientRepository.formatAndSaveRelayedRootBundleEvents(
      relayedRootBundleEvents,
      this.chainId,
      lastFinalisedBlock,
    );
    await spokePoolClientRepository.formatAndSaveTokensBridgedEvents(
      tokensBridgedEvents,
      lastFinalisedBlock,
    );
    return {
      deposits: savedV3FundsDepositedEvents,
      fills: savedFilledV3RelayEvents,
      slowFillRequests: savedV3RequestedSlowFills,
      executedRefundRoots: savedExecutedRelayerRefundRootEvents,
    };
  }

  private initialize() {
    this.configStoreClient = this.configStoreFactory.get(this.hubPoolChainId);
    this.hubPoolClient = this.hubPoolFactory.get(
      this.hubPoolChainId,
      undefined,
      undefined,
      {
        configStoreClient: this.configStoreClient,
      },
    );
  }

  private async updateNewDepositsWithIntegratorId(
    deposits: entities.V3FundsDeposited[],
  ) {
    await across.utils.forEachAsync(deposits, async (deposit) => {
      const integratorId = await getIntegratorId(
        this.provider,
        deposit.quoteTimestamp,
        deposit.transactionHash,
      );
      if (integratorId) {
        await this.spokePoolClientRepository.updateDepositEventWithIntegratorId(
          deposit.id,
          integratorId,
        );
      }
    });
  }

  private async publishIntegratorIdMessages(
    deposits: entities.V3FundsDeposited[],
  ) {
    const messages: IntegratorIdMessage[] = deposits.map((deposit) => {
      return {
        relayHash: deposit.relayHash,
      };
    });
    await this.indexerQueuesService.publishMessagesBulk(
      IndexerQueues.IntegratorId,
      IndexerQueues.IntegratorId, // Use queue name as job name
      messages,
    );
  }
}
