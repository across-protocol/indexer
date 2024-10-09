import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import {
  getDeployedAddress,
  getDeployedBlockNumber,
} from "@across-protocol/contracts";

import { BlockRange } from "../data-indexing/model";
import { IndexerDataHandler } from "../data-indexing/service/IndexerDataHandler";

import * as utils from "../utils";
import { providers } from "@across-protocol/sdk";
import { SpokePoolRepository } from "../database/SpokePoolRepository";
import { SpokePoolProcessor } from "./spokePoolProcessor";

type FetchEventsResult = {
  v3FundsDepositedEvents: (across.interfaces.DepositWithBlock & {
    integratorId: string | undefined;
  })[];
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
    private hubPoolChainId: number,
    private provider: providers.RetryProvider,
    private configStoreFactory: utils.ConfigStoreClientFactory,
    private hubPoolFactory: utils.HubPoolClientFactory,
    private spokePoolFactory: utils.SpokePoolClientFactory,
    private spokePoolClientRepository: SpokePoolRepository,
    private spokePoolProcessor: SpokePoolProcessor,
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
      at: "SpokePoolIndexerDataHandler::processBlockRange",
      message: "Processing block range",
      blockRange,
      lastFinalisedBlock,
      identifier: this.getDataIdentifier(),
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
    this.logger.info({
      at: "SpokePoolIndexerDataHandler::processBlockRange",
      message: "Found events",
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
      identifier: this.getDataIdentifier(),
    });
    const storedEvents = await this.storeEvents(events, lastFinalisedBlock);
    await this.spokePoolProcessor.process(storedEvents);
  }

  private async fetchEventsByRange(
    blockRange: BlockRange,
  ): Promise<FetchEventsResult> {
    const { configStoreClient, hubPoolClient, spokePoolClient } = this;

    spokePoolClient.firstBlockToSearch = blockRange.from;
    spokePoolClient.eventSearchConfig.toBlock = blockRange.to;

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
    const v3FundsDepositedWithIntegradorId = await Promise.all(
      v3FundsDepositedEvents.map(async (deposit) => {
        return {
          ...deposit,
          integratorId: await this.getIntegratorId(deposit),
        };
      }),
    );
    const filledV3RelayEvents = spokePoolClient.getFills();
    const requestedV3SlowFillEvents =
      spokePoolClient.getSlowFillRequestsForOriginChain(this.chainId);
    const requestedSpeedUpV3Events = spokePoolClient.getSpeedUps();
    const relayedRootBundleEvents = spokePoolClient.getRootBundleRelays();
    const executedRelayerRefundRootEvents =
      spokePoolClient.getRelayerRefundExecutions();
    const tokensBridgedEvents = spokePoolClient.getTokensBridged();

    return {
      v3FundsDepositedEvents: v3FundsDepositedWithIntegradorId,
      filledV3RelayEvents,
      requestedV3SlowFillEvents,
      requestedSpeedUpV3Events,
      relayedRootBundleEvents,
      executedRelayerRefundRootEvents,
      tokensBridgedEvents,
    };
  }

  private async storeEvents(
    params: FetchEventsResult,
    lastFinalisedBlock: number,
  ) {
    const { spokePoolClientRepository } = this;
    const {
      v3FundsDepositedEvents,
      filledV3RelayEvents,
      requestedV3SlowFillEvents,
      requestedSpeedUpV3Events,
      relayedRootBundleEvents,
      executedRelayerRefundRootEvents,
      tokensBridgedEvents,
    } = params;
    const savedV3FundsDepositedEvents =
      await spokePoolClientRepository.formatAndSaveV3FundsDepositedEvents(
        v3FundsDepositedEvents,
        lastFinalisedBlock,
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
    this.spokePoolClient = this.spokePoolFactory.get(
      this.chainId,
      undefined,
      undefined,
      {
        hubPoolClient: this.hubPoolClient,
      },
    );
  }

  private async getIntegratorId(deposit: across.interfaces.DepositWithBlock) {
    const INTEGRATOR_DELIMITER = "1dc0de";
    const INTEGRATOR_ID_LENGTH = 4; // Integrator ids are 4 characters long
    let integratorId = undefined;
    const txn = await this.provider.getTransaction(deposit.transactionHash);
    const txnData = txn.data;
    if (txnData.includes(INTEGRATOR_DELIMITER)) {
      integratorId = txnData
        .split(INTEGRATOR_DELIMITER)
        .pop()
        ?.substring(0, INTEGRATOR_ID_LENGTH);
    }
    return integratorId;
  }
}
