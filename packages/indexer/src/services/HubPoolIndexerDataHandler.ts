import { Logger } from "winston";
import * as across from "@across-protocol/sdk";

import * as utils from "../utils";
import {
  getDeployedBlockNumber,
  getDeployedAddress,
} from "@across-protocol/contracts";
import { IndexerDataHandler } from "../data-indexing/service/IndexerDataHandler";
import { BlockRange } from "../data-indexing/model";

export class HubPoolIndexerDataHandler implements IndexerDataHandler {
  private hubPoolClient: across.clients.HubPoolClient;
  private configStoreClient: across.clients.AcrossConfigStoreClient;
  private isInitialized: boolean;

  constructor(
    private logger: Logger,
    private chainId: number,
    private provider: across.providers.RetryProvider,
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
    this.logger.info(
      `HubPoolIndexerDataHandler::Found events ${JSON.stringify({
        proposedRootBundleEvents: events.proposedRootBundleEvents.length,
        rootBundleExecutedEvents: events.rootBundleExecutedEvents.length,
        rootBundleCanceledEvents: events.rootBundleCanceledEvents.length,
        rootBundleDisputedEvents: events.rootBundleDisputedEvents.length,
      })}`,
    );
    return;
  }

  private async initialize() {
    this.configStoreClient = await utils.getConfigStoreClient({
      logger: this.logger,
      provider: this.provider,
      maxBlockLookBack: 10_000,
      chainId: this.chainId,
    });
    // how to limit the blocks to only the queried range?
    this.hubPoolClient = await utils.getHubPoolClient({
      configStoreClient: this.configStoreClient,
      provider: this.provider,
      logger: this.logger,
      maxBlockLookBack: 10_000,
      chainId: this.chainId,
    });
  }

  private async fetchEventsByRange(blockRange: BlockRange) {
    const { hubPoolClient, configStoreClient } = this;

    configStoreClient.eventSearchConfig.toBlock = blockRange.to;
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
    };
  }
}
