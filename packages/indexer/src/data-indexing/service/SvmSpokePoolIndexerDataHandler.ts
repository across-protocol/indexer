import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import {
  getDeployedAddress,
  getDeployedBlockNumber,
} from "@across-protocol/contracts";

import * as utils from "../../utils";
import { BlockRange } from "../model";
import { IndexerDataHandler } from "./IndexerDataHandler";
import { getMaxBlockLookBack } from "../../web3/constants";
import { SvmProvider } from "../../web3/RetryProvidersFactory";

export type FetchEventsResult = {
  fundsDepositedEvents: utils.V3FundsDepositedWithIntegradorId[];
  filledRelayEvents: across.interfaces.FillWithBlock[];
  requestedSlowFillEvents: across.interfaces.SlowFillRequestWithBlock[];
  relayedRootBundleEvents: across.interfaces.RootBundleRelayWithBlock[];
  executedRelayerRefundRootEvents: (across.interfaces.RelayerRefundExecutionWithBlock & {
    deferredRefunds: boolean;
  })[]; // TODO: Add missing property to SDK type
  tokensBridgedEvents: across.interfaces.TokensBridged[];
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

    const events = await this.fetchEventsByRange(blockRange, isBackfilling);

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
      },
      blockRange,
    });

    await this.updateNewDepositsWithIntegratorId(events.fundsDepositedEvents);

    // TODO:
    // - store events
    // - delete unfinalised events
    // - process events
    // - publish price messages
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

    // TODO: create svm spoke pool client factory and instantiate client using it as we do for evm
    const spokePoolClient = await across.clients.SvmSpokePoolClient.create(
      this.logger,
      this.hubPoolClient,
      this.chainId,
      BigInt(this.getStartIndexingBlockNumber()),
      { from: blockRange.from, to: blockRange.to },
      this.provider,
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
    // getSlotTimes function will make sure we dont query more than we need to.
    const slots = [
      ...fundsDepositedEvents.map((deposit) => deposit.blockNumber),
      ...filledRelayEvents.map((fill) => fill.blockNumber),
    ];

    const startTimeToGetSlotTimes = performance.now();
    const slotTimes = await this.getSlotTimes(slots);
    const endTimeToGetSlotTimes = performance.now();

    this.logger.debug({
      at: "SpokePoolIndexerDataHandler#fetchEventsByRange",
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

  private async updateNewDepositsWithIntegratorId(
    deposits: FetchEventsResult["fundsDepositedEvents"],
  ) {
    await across.utils.forEachAsync(deposits, async (deposit) => {
      const integratorId = await utils.getSvmIntegratorId(
        this.provider,
        deposit.txnRef,
      );
      if (integratorId) {
        // TODO: update deposit with integrator id when we are storing them in the database
      }
    });
  }
}
