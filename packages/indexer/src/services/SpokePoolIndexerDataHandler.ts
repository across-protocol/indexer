import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import {
  CHAIN_IDs,
  getDeployedAddress,
  getDeployedBlockNumber,
} from "@across-protocol/contracts";

import { BlockRange } from "../data-indexing/model";
import { IndexerDataHandler } from "../data-indexing/service/IndexerDataHandler";
import { SpokePoolRepository } from "../database/SpokePoolRepository";

import * as utils from "../utils";
import { getMaxBlockLookBack } from "../web3/constants";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";

type FetchEventsResult = {
  v3FundsDepositedEvents: across.interfaces.DepositWithBlock[];
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
};

export class SpokePoolIndexerDataHandler implements IndexerDataHandler {
  private isInitialized: boolean;
  private configStoreClient: across.clients.AcrossConfigStoreClient;
  private hubPoolClient: across.clients.HubPoolClient;
  private spokePoolClient: across.clients.SpokePoolClient;

  constructor(
    private logger: Logger,
    private chainId: number,
    private providersFactory: RetryProvidersFactory,
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
    this.logger.info({
      message: "SpokePoolIndexerDataHandler::Processing block range",
      blockRange,
      lastFinalisedBlock,
      identifier: this.getDataIdentifier(),
    });

    if (!this.isInitialized) {
      await this.initialize();
      this.isInitialized = true;
    }

    const events = await this.fetchEventsByRange(blockRange);
    const requestedSpeedUpV3EventsCount = Object.values(
      events.requestedSpeedUpV3Events,
    ).reduce((acc, speedUps) => {
      return acc + Object.values(speedUps).length;
    }, 0);
    this.logger.info({
      message: "HubPoolIndexerDataHandler::Found events",
      events: {
        proposedRootBundleEvents: events.v3FundsDepositedEvents.length,
        filledV3RelayEvents: events.filledV3RelayEvents.length,
        requestedV3SlowFillEvents: events.requestedV3SlowFillEvents.length,
        requestedSpeedUpV3Events: requestedSpeedUpV3EventsCount,
        relayedRootBundleEvents: events.relayedRootBundleEvents.length,
        executedRelayerRefundRootEvents:
          events.executedRelayerRefundRootEvents.length,
        tokensBridgedEvents: events.tokensBridgedEvents.length,
      },
    });
  }

  private async fetchEventsByRange(
    blockRange: BlockRange,
  ): Promise<FetchEventsResult> {
    const { configStoreClient, hubPoolClient, spokePoolClient } = this;

    configStoreClient.eventSearchConfig.fromBlock = blockRange.from;
    configStoreClient.eventSearchConfig.toBlock = blockRange.to;
    hubPoolClient.eventSearchConfig.fromBlock = blockRange.from;
    hubPoolClient.eventSearchConfig.toBlock = blockRange.to;
    spokePoolClient.eventSearchConfig.fromBlock = blockRange.from;
    spokePoolClient.eventSearchConfig.toBlock = blockRange.to;

    await configStoreClient.update();
    await hubPoolClient.update();
    await spokePoolClient.update();

    const v3FundsDepositedEvents = spokePoolClient.getDeposits();
    const filledV3RelayEvents = spokePoolClient.getFills();
    const requestedV3SlowFillEvents =
      spokePoolClient.getSlowFillRequestsForOriginChain(this.chainId);
    const requestedSpeedUpV3Events = spokePoolClient.getSpeedUps();
    const relayedRootBundleEvents = spokePoolClient.getRootBundleRelays();
    const executedRelayerRefundRootEvents =
      spokePoolClient.getRelayerRefundExecutions();
    const tokensBridgedEvents = spokePoolClient.getTokensBridged();

    return {
      v3FundsDepositedEvents,
      filledV3RelayEvents,
      requestedV3SlowFillEvents,
      requestedSpeedUpV3Events,
      relayedRootBundleEvents,
      executedRelayerRefundRootEvents,
      tokensBridgedEvents,
    };
  }

  private async initialize() {
    this.configStoreClient = await utils.getConfigStoreClient({
      logger: this.logger,
      provider: this.providersFactory.getProviderForChainId(CHAIN_IDs.MAINNET),
      maxBlockLookBack: getMaxBlockLookBack(this.chainId),
      chainId: this.chainId,
    });
    this.hubPoolClient = await utils.getHubPoolClient({
      configStoreClient: this.configStoreClient,
      provider: this.providersFactory.getProviderForChainId(CHAIN_IDs.MAINNET),
      logger: this.logger,
      maxBlockLookBack: getMaxBlockLookBack(this.chainId),
      chainId: this.chainId,
    });
    this.spokePoolClient = await utils.getSpokeClient({
      hubPoolClient: this.hubPoolClient,
      provider: this.providersFactory.getProviderForChainId(this.chainId),
      logger: this.logger,
      maxBlockLookBack: getMaxBlockLookBack(this.chainId),
      chainId: this.chainId,
    });
  }
}
