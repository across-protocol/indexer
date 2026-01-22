import {
  getDeployedAddress,
  getDeployedBlockNumber,
} from "@across-protocol/contracts";
import * as across from "@across-protocol/sdk";
import { Signature } from "@solana/kit";
import { Logger } from "winston";

import {
  entities,
  SaveQueryResultType,
  utils as indexerDatabaseUtils,
} from "@repo/indexer-database";

import {
  SpokePoolRepository,
  StoreEventsResult,
} from "../../database/SpokePoolRepository";
import { PriceMessage } from "../../messaging/priceWorker";
import { IndexerQueues, IndexerQueuesService } from "../../messaging/service";
import { SpokePoolProcessor } from "../../services/spokePoolProcessor";
import * as utils from "../../utils";
import { getMaxBlockLookBack } from "../../web3/constants";
import { SvmProvider } from "../../web3/RetryProvidersFactory";
import { BlockRange } from "../model";
import { IndexerDataHandler } from "./IndexerDataHandler";

export type FetchEventsResult = {
  fundsDepositedEvents: utils.V3FundsDepositedWithIntegradorId[];
  filledRelayEvents: across.interfaces.FillWithBlock[];
  requestedSlowFillEvents: across.interfaces.SlowFillRequestWithBlock[];
  relayedRootBundleEvents: across.interfaces.RootBundleRelayWithBlock[];
  executedRelayerRefundRootEvents: (across.interfaces.RelayerRefundExecutionWithBlock & {
    deferredRefunds: boolean;
  })[]; // TODO: Add missing property to SDK type
  tokensBridgedEvents: across.interfaces.TokensBridged[];
  bridgedToHubPoolEvents: across.interfaces.BridgedToHubPoolWithBlock[];
  claimedRelayerRefunds: across.interfaces.ClaimedRelayerRefundWithBlock[];
  slotTimes: Record<number, number>;
};

export class SvmSpokePoolIndexerDataHandler implements IndexerDataHandler {
  private configStoreClient: across.clients.AcrossConfigStoreClient;
  private hubPoolClient: across.clients.HubPoolClient;
  private isInitialized: boolean;

  constructor(
    private logger: Logger,
    private chainId: number,
    private hubPoolChainId: number,
    private provider: SvmProvider,
    private configStoreFactory: utils.ConfigStoreClientFactory,
    private hubPoolFactory: utils.HubPoolClientFactory,
    private spokePoolFactory: utils.SpokePoolClientFactory,
    private spokePoolClientRepository: SpokePoolRepository,
    private spokePoolProcessor: SpokePoolProcessor,
    private indexerQueuesService: IndexerQueuesService,
  ) {}

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
    return `${getDeployedAddress("SvmSpoke", this.chainId)}:${this.chainId}`;
  }

  public getStartIndexingBlockNumber() {
    return getDeployedBlockNumber("SvmSpoke", this.chainId);
  }

  public async processBlockRange(
    blockRange: BlockRange,
    lastFinalisedBlock: number,
    isBackfilling: boolean = false,
  ) {
    this.logger.debug({
      at: "Indexer#SvmSpokePoolIndexerDataHandler#processBlockRange",
      message: `Processing block range ${this.getDataIdentifier()}`,
      blockRange,
      lastFinalisedBlock,
      isBackfilling,
    });

    if (!this.isInitialized) {
      this.initialize();
      this.isInitialized = true;
    }

    const startPerfTime = performance.now();

    const events = await this.fetchEventsByRange(blockRange, isBackfilling);

    const timeToFetchEvents = performance.now();

    this.logger.debug({
      at: "Indexer#SvmSpokePoolIndexerDataHandler#processBlockRange",
      message: `Found events for ${this.getDataIdentifier()}`,
      events: {
        fundsDepositedEvents: events.fundsDepositedEvents.length,
        filledRelayEvents: events.filledRelayEvents.length,
        requestedSlowFillEvents: events.requestedSlowFillEvents.length,
        relayedRootBundleEvents: events.relayedRootBundleEvents.length,
        executedRelayerRefundRootEvents:
          events.executedRelayerRefundRootEvents.length,
        tokensBridgedEvents: events.tokensBridgedEvents.length,
        bridgedToHubPoolEvents: events.bridgedToHubPoolEvents.length,
        claimedRelayerRefundEvents: events.claimedRelayerRefunds.length,
      },
      blockRange,
    });

    const storedEvents = await this.storeEvents(events, lastFinalisedBlock);
    const timeToStoreEvents = performance.now();

    const newInsertedDeposits = indexerDatabaseUtils.filterSaveQueryResults(
      storedEvents.deposits,
      SaveQueryResultType.Inserted,
    );

    // Delete unfinalised events
    const deletedDeposits =
      await this.spokePoolClientRepository.deleteUnfinalisedDepositEvents(
        this.chainId,
        lastFinalisedBlock,
      );
    const timeToDeleteDeposits = performance.now();

    await this.updateNewDepositsWithIntegratorId(newInsertedDeposits);
    const timeToUpdateDepositIds = performance.now();

    const fillsGasFee = await this.getFillsGasFee(events.filledRelayEvents);
    await this.spokePoolProcessor.process(
      storedEvents,
      deletedDeposits,
      [], // swapBeforeBridge events
      [], // callsFailed events
      [], // targetChainAction pairs
      [], // swap metadata pairs
      fillsGasFee,
    );

    //FIXME: Remove performance timing
    const timeToProcessDeposits = performance.now();

    // publish new relays to workers to fill in prices
    await this.publishNewRelays(storedEvents);

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
  }

  private async getFillsGasFee(
    fills: across.interfaces.FillWithBlock[],
  ): Promise<Record<string, bigint | undefined>> {
    const fillsGasFee = await Promise.all(
      fills.map(async (fill) => {
        const transaction = await this.provider
          .getTransaction(fill.txnRef as Signature, {
            maxSupportedTransactionVersion: 0,
            encoding: "json",
          })
          .send();
        return !!transaction?.meta?.fee
          ? BigInt(transaction.meta.fee.toString())
          : undefined;
      }),
    );
    return fills.reduce(
      (acc, fill, index) => {
        acc[fill.txnRef] = fillsGasFee[index];
        return acc;
      },
      {} as Record<string, bigint | undefined>,
    );
  }

  private async fetchEventsByRange(
    blockRange: BlockRange,
    isBackfilling: boolean,
  ): Promise<FetchEventsResult> {
    // If we are in a backfilling state then we should grab the largest
    // lookback available to us. Otherwise, for this specific indexer we
    // only need exactly what we're looking for, plus some padding to be sure
    const maxBlockLookback = isBackfilling
      ? getMaxBlockLookBack(this.chainId)
      : Math.min(
          getMaxBlockLookBack(this.chainId),
          (blockRange.to - blockRange.from) * 2,
        );

    const spokePoolClient = await this.spokePoolFactory.get(
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

    await this.configStoreClient.update();
    await this.hubPoolClient.update([
      "SetPoolRebalanceRoute",
      "CrossChainContractsSet",
    ]);

    const timeToUpdateProtocolClients = performance.now();
    // We aim to avoid the unneeded update events
    // Specifically, we avoid the EnabledDepositRoute event because this
    // requires a lookback to the deployment block of the SpokePool contract.
    await spokePoolClient.update([
      "BridgedToHubPool",
      "ClaimedRelayerRefund",
      "ExecutedRelayerRefundRoot",
      "FilledRelay",
      "FundsDeposited",
      "RelayedRootBundle",
      "RequestedSlowFill",
      "TokensBridged",
    ]);

    const timeToUpdateSpokePoolClient = performance.now();
    const fundsDepositedEvents = spokePoolClient.getDeposits({
      fromBlock: blockRange.from,
      toBlock: blockRange.to,
    });
    const filledRelayEvents = spokePoolClient.getFills();
    const requestedSlowFillEvents = spokePoolClient.getSlowFillRequests();
    const relayedRootBundleEvents = spokePoolClient.getRootBundleRelays();
    const executedRelayerRefundRootEvents =
      spokePoolClient.getRelayerRefundExecutions() as FetchEventsResult["executedRelayerRefundRootEvents"];
    const tokensBridgedEvents =
      spokePoolClient.getTokensBridged() as FetchEventsResult["tokensBridgedEvents"];
    const bridgedToHubPoolEvents = spokePoolClient.getBridgedToHubPoolEvents();
    const claimedRelayerRefunds = spokePoolClient.getClaimedRelayerRefunds();
    // getSlotTimes function will make sure we dont query more than we need to.
    const slots = [
      ...fundsDepositedEvents.map((deposit) => deposit.blockNumber),
      ...filledRelayEvents.map((fill) => fill.blockNumber),
    ];

    const startTimeToGetSlotTimes = performance.now();
    const slotTimes = await this.getSlotTimes(slots);
    const endTimeToGetSlotTimes = performance.now();

    this.logger.debug({
      at: "SvmSpokePoolIndexerDataHandler#fetchEventsByRange",
      message: "Time to update protocol clients",
      timeToUpdateProtocolClients: timeToUpdateProtocolClients - initialTime,
      timeToUpdateSpokePoolClient:
        timeToUpdateSpokePoolClient - timeToUpdateProtocolClients,
      timeToGetBlockTimes: endTimeToGetSlotTimes - startTimeToGetSlotTimes, // Keep log structure by using key 'timeToGetBlockTimes'
      totalTime: endTimeToGetSlotTimes - initialTime,
      spokeChainId: this.chainId,
      blockRange: blockRange,
      isBackfilling,
      dynamicMaxBlockLookback: maxBlockLookback,
    });

    return {
      fundsDepositedEvents,
      filledRelayEvents,
      requestedSlowFillEvents,
      relayedRootBundleEvents,
      executedRelayerRefundRootEvents,
      tokensBridgedEvents,
      bridgedToHubPoolEvents,
      claimedRelayerRefunds,
      slotTimes,
    };
  }

  private async getSlotTimes(slots: number[]): Promise<Record<number, number>> {
    const uniqueSlots = [...new Set(slots)];
    const timestamps = await Promise.all(
      uniqueSlots.map((slot) =>
        this.provider.getBlockTime(BigInt(slot)).send(),
      ),
    );

    const slotTimestamps = uniqueSlots.reduce(
      (acc, slot, index) => {
        if (timestamps[index] === undefined) {
          throw new Error(`Slot time for slot ${slot} not found`);
        }
        acc[slot] = Number(timestamps[index]!);
        return acc;
      },
      {} as Record<number, number>,
    );
    return slotTimestamps;
  }

  private async storeEvents(
    params: FetchEventsResult,
    lastFinalisedBlock: number,
  ): Promise<StoreEventsResult> {
    const { spokePoolClientRepository } = this;
    const {
      fundsDepositedEvents,
      filledRelayEvents,
      requestedSlowFillEvents,
      relayedRootBundleEvents,
      executedRelayerRefundRootEvents,
      tokensBridgedEvents,
      bridgedToHubPoolEvents,
      claimedRelayerRefunds,
      slotTimes,
    } = params;

    const [
      savedV3FundsDepositedEvents,
      savedV3RequestedSlowFills,
      savedFilledV3RelayEvents,
      savedExecutedRelayerRefundRootEvents,
    ] = await Promise.all([
      spokePoolClientRepository.formatAndSaveV3FundsDepositedEvents(
        fundsDepositedEvents,
        lastFinalisedBlock,
        slotTimes,
      ),
      spokePoolClientRepository.formatAndSaveRequestedV3SlowFillEvents(
        requestedSlowFillEvents,
        lastFinalisedBlock,
      ),
      spokePoolClientRepository.formatAndSaveFilledV3RelayEvents(
        filledRelayEvents,
        lastFinalisedBlock,
        slotTimes,
      ),
      spokePoolClientRepository.formatAndSaveExecutedRelayerRefundRootEvents(
        executedRelayerRefundRootEvents,
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
      spokePoolClientRepository.formatAndSaveBridgedToHubPoolEvents(
        bridgedToHubPoolEvents,
        this.chainId,
        lastFinalisedBlock,
      ),
      spokePoolClientRepository.formatAndSaveClaimedRelayerRefunds(
        claimedRelayerRefunds,
        this.chainId,
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
      const integratorId = await utils.getSvmIntegratorId(
        this.provider,
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

  private async publishNewRelays(storedEvents: StoreEventsResult) {
    const fills = storedEvents.fills.map(({ data }) => data);
    const messages: PriceMessage[] = fills.map((fill) => ({
      fillEventId: fill.id,
    }));
    await this.indexerQueuesService.publishMessagesBulk(
      IndexerQueues.PriceQuery,
      IndexerQueues.PriceQuery, // Use queue name as job name
      messages,
    );
  }
}
