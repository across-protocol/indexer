import { Logger } from "winston";
import * as across from "@across-protocol/sdk";

import * as utils from "../utils";
import {
  getDeployedBlockNumber,
  getDeployedAddress,
} from "@across-protocol/contracts";
import { IndexerDataHandler } from "../data-indexing/service/IndexerDataHandler";
import { BlockRange } from "../data-indexing/model";
import { HubPoolRepository } from "../database/HubPoolRepository";
import { getMaxBlockLookBack } from "../web3/constants";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";

type FetchEventsResult = {
  proposedRootBundleEvents: (across.interfaces.ProposedRootBundle & {
    chainIds: number[];
  })[];
  rootBundleCanceledEvents: across.interfaces.CancelledRootBundle[];
  rootBundleDisputedEvents: across.interfaces.DisputedRootBundle[];
  rootBundleExecutedEvents: across.interfaces.ExecutedRootBundle[];
  setPoolRebalanceRouteEvents: (across.interfaces.DestinationTokenWithBlock & {
    l2ChainId: number;
  })[];
};
export class HubPoolIndexerDataHandler implements IndexerDataHandler {
  private hubPoolClient: across.clients.HubPoolClient;
  private configStoreClient: across.clients.AcrossConfigStoreClient;
  private isInitialized: boolean;

  constructor(
    private logger: Logger,
    private chainId: number,
    private configStoreFactory: utils.ConfigStoreClientFactory,
    private hubPoolFactory: utils.HubPoolClientFactory,
    private hubPoolRepository: HubPoolRepository,
  ) {
    this.isInitialized = false;
  }

  public getDataIdentifier() {
    return `${getDeployedAddress("HubPool", this.chainId)}:${this.chainId}`;
  }

  public getStartIndexingBlockNumber() {
    const deployedBlockNumber = getDeployedBlockNumber("HubPool", this.chainId);
    return deployedBlockNumber;
  }

  public async processBlockRange(
    blockRange: BlockRange,
    lastFinalisedBlock: number,
  ) {
    this.logger.info({
      message: "HubPoolIndexerDataHandler::Processing block range",
      blockRange,
      lastFinalisedBlock,
    });
    if (!this.isInitialized) {
      await this.initialize();
      this.isInitialized = true;
    }
    const events = await this.fetchEventsByRange(blockRange);
    this.logger.info({
      message: "HubPoolIndexerDataHandler::Found events",
      events: {
        proposedRootBundleEvents: events.proposedRootBundleEvents.length,
        rootBundleExecutedEvents: events.rootBundleExecutedEvents.length,
        rootBundleCanceledEvents: events.rootBundleCanceledEvents.length,
        rootBundleDisputedEvents: events.rootBundleDisputedEvents.length,
        setPoolRebalanceRouteEvents: events.setPoolRebalanceRouteEvents.length,
      },
    });
    await this.storeEvents(events, lastFinalisedBlock);
  }

  private async initialize() {
    this.configStoreClient = this.configStoreFactory.get(this.chainId);
    this.hubPoolClient = this.hubPoolFactory.get(
      this.chainId,
      undefined,
      undefined,
      {
        configStoreClient: this.configStoreClient,
      },
    );
  }

  private async fetchEventsByRange(
    blockRange: BlockRange,
  ): Promise<FetchEventsResult> {
    const { hubPoolClient, configStoreClient } = this;

    configStoreClient.eventSearchConfig.toBlock = blockRange.to;
    hubPoolClient.eventSearchConfig.fromBlock = blockRange.from;
    hubPoolClient.eventSearchConfig.toBlock = blockRange.to;
    await configStoreClient.update();
    await hubPoolClient.update();
    const proposedRootBundleEvents =
      hubPoolClient.getProposedRootBundlesInBlockRange(
        blockRange.from,
        blockRange.to,
      );
    const rootBundleCanceledEvents =
      hubPoolClient.getCancelledRootBundlesInBlockRange(
        blockRange.from,
        blockRange.to,
      );
    const rootBundleDisputedEvents =
      hubPoolClient.getDisputedRootBundlesInBlockRange(
        blockRange.from,
        blockRange.to,
      );
    const setPoolRebalanceRouteEvents =
      hubPoolClient.getTokenMappingsModifiedInBlockRange(
        blockRange.from,
        blockRange.to,
      );
    // we do not have a block range query for executed root bundles
    const rootBundleExecutedEvents = hubPoolClient.getExecutedRootBundles();

    return {
      // we need to make sure we filter out all unecessary events for the block range requested
      proposedRootBundleEvents: proposedRootBundleEvents.map((p) => ({
        ...p,
        chainIds: configStoreClient.getChainIdIndicesForBlock(p.blockNumber),
      })),
      rootBundleCanceledEvents,
      rootBundleDisputedEvents,
      rootBundleExecutedEvents: rootBundleExecutedEvents.filter(
        (event) =>
          event.blockNumber >= blockRange.from &&
          event.blockNumber <= blockRange.to,
      ),
      setPoolRebalanceRouteEvents,
    };
  }

  async storeEvents(events: FetchEventsResult, lastFinalisedBlock: number) {
    const { hubPoolRepository } = this;
    const {
      proposedRootBundleEvents,
      rootBundleCanceledEvents,
      rootBundleDisputedEvents,
      rootBundleExecutedEvents,
      setPoolRebalanceRouteEvents,
    } = events;
    await hubPoolRepository.formatAndSaveProposedRootBundleEvents(
      proposedRootBundleEvents,
      lastFinalisedBlock,
    );
    await hubPoolRepository.formatAndSaveRootBundleCanceledEvents(
      rootBundleCanceledEvents,
      lastFinalisedBlock,
    );
    await hubPoolRepository.formatAndSaveRootBundleDisputedEvents(
      rootBundleDisputedEvents,
      lastFinalisedBlock,
    );
    await hubPoolRepository.formatAndSaveRootBundleExecutedEvents(
      rootBundleExecutedEvents,
      lastFinalisedBlock,
    );
    await hubPoolRepository.formatAndSaveSetPoolRebalanceRouteEvents(
      setPoolRebalanceRouteEvents,
      lastFinalisedBlock,
    );
  }
}
