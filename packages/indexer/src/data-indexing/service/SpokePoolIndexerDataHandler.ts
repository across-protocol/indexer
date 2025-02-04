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
  SaveQueryResultType,
} from "@repo/indexer-database";

import { BlockRange } from "../model";
import { IndexerDataHandler } from "./IndexerDataHandler";

import * as utils from "../../utils";
import { getIntegratorId } from "../../utils/spokePoolUtils";
import { SpokePoolRepository } from "../../database/SpokePoolRepository";
import { SpokePoolProcessor } from "../../services/spokePoolProcessor";
import { IndexerQueues, IndexerQueuesService } from "../../messaging/service";
import { IntegratorIdMessage } from "../../messaging/IntegratorIdWorker";
import { getMaxBlockLookBack } from "../../web3/constants";
import { PriceMessage } from "../../messaging/priceWorker";

export type FetchEventsResult = {
  v3FundsDepositedEvents: utils.V3FundsDepositedWithIntegradorId[];
  filledV3RelayEvents: across.interfaces.FillWithBlock[];
  requestedV3SlowFillEvents: across.interfaces.SlowFillRequestWithBlock[];
  requestedSpeedUpV3Events: {
    [depositorAddress: string]: {
      [depositId: string]: across.interfaces.SpeedUpWithBlock[];
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

  public getDataIdentifier() {
    return `${getDeployedAddress("SpokePool", this.chainId)}:${this.chainId}`;
  }
  public getStartIndexingBlockNumber() {
    return getDeployedBlockNumber("SpokePool", this.chainId);
  }

  public async processBlockRange(
    blockRange: BlockRange,
    lastFinalisedBlock: number,
    isBackfilling: boolean = false,
  ) {
    this.logger.debug({
      at: "Indexer#SpokePoolIndexerDataHandler#processBlockRange",
      message: `Processing block range ${this.getDataIdentifier()}`,
      blockRange,
      lastFinalisedBlock,
      isBackfilling,
    });

    if (!this.isInitialized) {
      this.initialize();
      this.isInitialized = true;
    }

    //FIXME: Remove performance timing
    const startPerfTime = performance.now();

    const events = await this.fetchEventsByRange(blockRange, isBackfilling);
    const requestedSpeedUpV3EventsCount = Object.values(
      events.requestedSpeedUpV3Events,
    ).reduce((acc, speedUps) => {
      return acc + Object.values(speedUps).length;
    }, 0);

    //FIXME: Remove performance timing
    const timeToFetchEvents = performance.now();

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

    //FIXME: Remove performance timing
    const timeToStoreEvents = performance.now();

    // Delete unfinalised deposits
    const deletedDeposits =
      await this.spokePoolClientRepository.deleteUnfinalisedDepositEvents(
        this.chainId,
        lastFinalisedBlock,
      );
    const timeToDeleteDeposits = performance.now();

    await this.updateNewDepositsWithIntegratorId(newInsertedDeposits);

    //FIXME: Remove performance timing
    const timeToUpdateDepositIds = performance.now();

    await this.spokePoolProcessor.process(storedEvents, deletedDeposits);

    //FIXME: Remove performance timing
    const timeToProcessDeposits = performance.now();

    this.profileStoreEvents(storedEvents);

    //FIXME: Remove performance timing
    const finalPerfTime = performance.now();

    this.logger.debug({
      at: "Indexer#SpokePoolIndexerDataHandler#processBlockRange",
      message:
        "System Time Log for SpokePoolIndexerDataHandler#processBlockRange",
      spokeChainId: this.chainId,
      blockRange: blockRange,
      timeToFetchEvents: timeToFetchEvents - startPerfTime,
      timeToStoreEvents: timeToStoreEvents - timeToFetchEvents,
      timeToDeleteDeposits: timeToDeleteDeposits - timeToStoreEvents,
      timeToUpdateDepositIds: timeToUpdateDepositIds - timeToDeleteDeposits,
      timeToProcessDeposits: timeToProcessDeposits - timeToUpdateDepositIds,
      timeToProcessAnciliaryEvents: finalPerfTime - timeToProcessDeposits,
      finalTime: finalPerfTime - startPerfTime,
    });
    // publish new relays to workers to fill in prices
    await this.publishNewRelays(storedEvents.fills);
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
        acc[blockNumber] = timestamps[index]!;
        return acc;
      },
      {} as Record<number, number>,
    );
    return blockTimestamps;
  }

  private async fetchEventsByRange(
    blockRange: BlockRange,
    isBackfilling: boolean,
  ): Promise<FetchEventsResult> {
    const { configStoreClient, hubPoolClient } = this;

    // If we are in a backfilling state then we should grab the largest
    // lookback available to us. Otherwise, for this specific indexer we
    // only need exactly what we're looking for, plus some padding to be
    // sure
    const maxBlockLookback = isBackfilling
      ? getMaxBlockLookBack(this.chainId)
      : Math.min(
          getMaxBlockLookBack(this.chainId),
          (blockRange.to - blockRange.from) * 2,
        );

    const spokePoolClient = this.spokePoolFactory.get(
      this.chainId,
      blockRange.from,
      blockRange.to,
      {
        hubPoolClient: this.hubPoolClient,
        disableQuoteBlockLookup: true,
        maxBlockLookback,
      },
    );

    const initialTime = performance.now();

    await configStoreClient.update();
    await hubPoolClient.update([
      "SetPoolRebalanceRoute",
      "CrossChainContractsSet",
    ]);

    const timeToUpdateProtocolClients = performance.now();
    // We aim to avoid the unneeded update events
    // Specifically, we avoid the EnabledDepositRoute event because this
    // requires a lookback to the deployment block of the SpokePool contract.
    await spokePoolClient.update([
      "V3FundsDeposited",
      "FilledV3Relay",
      "RequestedV3SlowFill",
      "RequestedSpeedUpV3Deposit",
      "RelayedRootBundle",
      "ExecutedRelayerRefundRoot",
      "TokensBridged",
      "FundsDeposited",
      "RequestedSpeedUpDeposit",
      "RequestedSlowFill",
      "FilledRelay",
    ]);
    const timeToUpdateSpokePoolClient = performance.now();

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

    const startTimeToGetBlockTimes = performance.now();
    const blockTimes = await this.getBlockTimes(blockNumbers);
    const endTimeToGetBlockTimes = performance.now();

    this.logger.debug({
      at: "SpokePoolIndexerDataHandler#fetchEventsByRange",
      message: "Time to update protocol clients",
      timeToUpdateProtocolClients: timeToUpdateProtocolClients - initialTime,
      timeToUpdateSpokePoolClient:
        timeToUpdateSpokePoolClient - timeToUpdateProtocolClients,
      timeToGetBlockTimes: endTimeToGetBlockTimes - startTimeToGetBlockTimes,
      totalTime: endTimeToGetBlockTimes - initialTime,
      spokeChainId: this.chainId,
      blockRange: blockRange,
      isBackfilling,
      dynamicMaxBlockLookback: maxBlockLookback,
    });

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
    const [
      savedV3FundsDepositedEvents,
      savedV3RequestedSlowFills,
      savedFilledV3RelayEvents,
      savedExecutedRelayerRefundRootEvents,
    ] = await Promise.all([
      spokePoolClientRepository.formatAndSaveV3FundsDepositedEvents(
        v3FundsDepositedEvents,
        lastFinalisedBlock,
        blockTimes,
      ),
      spokePoolClientRepository.formatAndSaveRequestedV3SlowFillEvents(
        requestedV3SlowFillEvents,
        lastFinalisedBlock,
      ),
      spokePoolClientRepository.formatAndSaveFilledV3RelayEvents(
        filledV3RelayEvents,
        lastFinalisedBlock,
        blockTimes,
      ),
      spokePoolClientRepository.formatAndSaveExecutedRelayerRefundRootEvents(
        executedRelayerRefundRootEvents,
        lastFinalisedBlock,
      ),
      spokePoolClientRepository.formatAndSaveRequestedSpeedUpV3Events(
        requestedSpeedUpV3Events,
        lastFinalisedBlock,
      ),
      spokePoolClientRepository.formatAndSaveRelayedRootBundleEvents(
        relayedRootBundleEvents,
        this.chainId,
        lastFinalisedBlock,
      ),
      spokePoolClientRepository.formatAndSaveTokensBridgedEvents(
        tokensBridgedEvents,
        lastFinalisedBlock,
      ),
    ]);
    return {
      deposits: savedV3FundsDepositedEvents,
      fills: savedFilledV3RelayEvents,
      slowFillRequests: savedV3RequestedSlowFills,
      executedRefundRoots: savedExecutedRelayerRefundRootEvents,
    };
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

  private async publishNewRelays(
    fills: SaveQueryResult<entities.FilledV3Relay>[],
  ) {
    const messages: PriceMessage[] = fills
      .filter((x) => x.data != undefined)
      .map((fill) => ({
        fillEventId: fill.data?.id!,
      }));

    await this.indexerQueuesService.publishMessagesBulk(
      IndexerQueues.PriceQuery,
      IndexerQueues.PriceQuery, // Use queue name as job name
      messages,
    );
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
