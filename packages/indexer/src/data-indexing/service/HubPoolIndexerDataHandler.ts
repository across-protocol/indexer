import {
  getDeployedAddress,
  getDeployedBlockNumber,
} from "@across-protocol/contracts";
import * as across from "@across-protocol/sdk";
import { Logger } from "winston";
import { HubPoolRepository } from "../../database/HubPoolRepository";
import { BundleEventsProcessor } from "../../services";
import * as utils from "../../utils";
import { BlockRange } from "../model";
import { IndexerDataHandler } from "./IndexerDataHandler";

export type FetchEventsResult = {
  proposedRootBundleEvents: (across.interfaces.ProposedRootBundle & {
    chainIds: number[];
  })[];
  rootBundleCanceledEvents: across.interfaces.CancelledRootBundle[];
  rootBundleDisputedEvents: across.interfaces.DisputedRootBundle[];
  rootBundleExecutedEvents: (across.interfaces.ExecutedRootBundle & {
    groupIndex: number;
    caller: string;
  })[]; // TODO: Add groupIndex and caller to the SDK type
  setPoolRebalanceRouteEvents: (across.interfaces.DestinationTokenWithBlock & {
    l2ChainId: number;
  })[];
};
export class HubPoolIndexerDataHandler implements IndexerDataHandler {
  private hubPoolClient: across.clients.HubPoolClient;
  private configStoreClient: across.clients.AcrossConfigStoreClient;
  private isInitialized: boolean;
  private cachedFetchEventsResult?: FetchEventsResult;

  constructor(
    private logger: Logger,
    private chainId: number,
    private configStoreFactory: utils.ConfigStoreClientFactory,
    private hubPoolFactory: utils.HubPoolClientFactory,
    private hubPoolRepository: HubPoolRepository,
    private bundleProcessor: BundleEventsProcessor,
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
    this.logger.debug({
      at: "Indexer#HubPoolIndexerDataHandler#processBlockRange",
      message: `Start processing block range ${this.getDataIdentifier()}`,
      blockRange,
      lastFinalisedBlock,
      identifier: this.getDataIdentifier(),
    });
    if (!this.isInitialized) {
      await this.initialize();
      this.isInitialized = true;
    }
    let events: FetchEventsResult;

    if (this.cachedFetchEventsResult) {
      this.logger.debug({
        at: "Indexer#HubPoolIndexerDataHandler#processBlockRange",
        message: `Using cached events for ${this.getDataIdentifier()}`,
      });
      events = this.cachedFetchEventsResult;
    } else {
      events = await this.fetchEventsByRange(blockRange);
      this.cachedFetchEventsResult = events;
    }

    this.logger.debug({
      at: "Indexer#HubPoolIndexerDataHandler#processBlockRange",
      message: `Fetched events ${this.getDataIdentifier()}`,
      events: {
        proposedRootBundleEvents: events.proposedRootBundleEvents.length,
        rootBundleExecutedEvents: events.rootBundleExecutedEvents.length,
        rootBundleCanceledEvents: events.rootBundleCanceledEvents.length,
        rootBundleDisputedEvents: events.rootBundleDisputedEvents.length,
        setPoolRebalanceRouteEvents: events.setPoolRebalanceRouteEvents.length,
      },
      blockRange,
      identifier: this.getDataIdentifier(),
    });
    await this.storeEvents(events, lastFinalisedBlock);
    await this.bundleProcessor.process();
    this.logger.debug({
      at: "Indexer#HubPoolIndexerDataHandler#processBlockRange",
      message: `Finished processing block range ${this.getDataIdentifier()}`,
      blockRange,
      lastFinalisedBlock,
      identifier: this.getDataIdentifier(),
    });
    this.cachedFetchEventsResult = undefined;
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
    const rootBundleExecutedEvents =
      hubPoolClient.getExecutedRootBundles() as FetchEventsResult["rootBundleExecutedEvents"];

    return {
      // we need to make sure we filter out all unecessary events for the block range requested
      proposedRootBundleEvents: proposedRootBundleEvents.map((p) => ({
        ...p,
        // Ensure both bundleEvaluationBlockNumbers and chainIds are the same length as
        // a chain might be included in the config store list but not in a bundle yet.
        chainIds: configStoreClient
          .getChainIdIndicesForBlock(p.blockNumber)
          .slice(0, p.bundleEvaluationBlockNumbers.length),
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
