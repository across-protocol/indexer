import { Logger } from "winston";
import { providers } from "ethers";
import * as across from "@across-protocol/sdk";

import { BlockRange } from "../model";
import { IndexerDataHandler } from "./IndexerDataHandler";
import { SimpleTransferFlowCompletedRepository } from "../../database/SimpleTransferFlowCompletedRepository";
import {
  getIndexingStartBlockNumber,
  getSimpleTransferFlowCompletedEvents,
  getHyperCoreFlowExecutorAddress,
} from "../adapter/hyper-evm/service";
import { SimpleTransferFlowCompletedWithBlock } from "../adapter/hyper-evm/model";

export type FetchEventsResult = {
  simpleTransferFlowCompletedEvents: SimpleTransferFlowCompletedWithBlock[];
  blocks: Record<string, providers.Block>;
};
export type StoreEventsResult = {};

export class HyperEVMIndexerDataHandler implements IndexerDataHandler {
  private isInitialized: boolean;

  constructor(
    private logger: Logger,
    private chainId: number,
    private provider: across.providers.RetryProvider,
    private simpleTransferFlowCompletedRepository: SimpleTransferFlowCompletedRepository,
  ) {
    this.isInitialized = false;
  }

  private initialize() {}

  public getDataIdentifier() {
    return `hyperevm:${this.chainId}`;
  }
  public getStartIndexingBlockNumber() {
    return getIndexingStartBlockNumber(this.chainId);
  }

  public async processBlockRange(
    blockRange: BlockRange,
    lastFinalisedBlock: number,
    isBackfilling: boolean = false,
  ) {
    this.logger.debug({
      at: "Indexer#HyperEVMIndexerDataHandler#processBlockRange",
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

    const events = await this.fetchEventsByRange(blockRange);
    await this.storeEvents(events, lastFinalisedBlock);
    const timeToStoreEvents = performance.now();
    await this.simpleTransferFlowCompletedRepository.deleteUnfinalisedSimpleTransferFlowCompletedEvents(
      this.chainId,
      lastFinalisedBlock,
    );
    const timeToDeleteEvents = performance.now();
    const finalPerfTime = performance.now();

    this.logger.debug({
      at: "Indexer#HyperEVMIndexerDataHandler#processBlockRange",
      message:
        "System Time Log for HyperEVMIndexerDataHandler#processBlockRange",
      spokeChainId: this.chainId,
      blockRange: blockRange,
      finalTime: finalPerfTime - startPerfTime,
      timeToStoreEvents: timeToStoreEvents - startPerfTime,
      timeToDeleteEvents: timeToDeleteEvents - timeToStoreEvents,
    });
  }

  private async fetchEventsByRange(
    blockRange: BlockRange,
  ): Promise<FetchEventsResult> {
    const address = getHyperCoreFlowExecutorAddress(this.chainId);
    const simpleTransferFlowCompletedEvents =
      await getSimpleTransferFlowCompletedEvents(
        this.provider,
        address,
        blockRange.from,
        blockRange.to,
      );

    const blocks = await this.getBlocks([
      ...new Set(
        simpleTransferFlowCompletedEvents.map((event) =>
          event.blockNumber.toString(),
        ),
      ),
    ]);

    return {
      simpleTransferFlowCompletedEvents,
      blocks,
    };
  }

  private async getBlocks(blockNumbers: string[]) {
    const blocks = await Promise.all(
      blockNumbers.map(async (blockNumber) => {
        return this.provider.getBlock(parseInt(blockNumber));
      }),
    );
    return blocks.reduce(
      (acc, block) => {
        acc[block.number] = block;
        return acc;
      },
      {} as Record<string, providers.Block>,
    );
  }

  private async storeEvents(
    events: FetchEventsResult,
    lastFinalisedBlock: number,
  ): Promise<StoreEventsResult> {
    const { simpleTransferFlowCompletedEvents, blocks } = events;
    const blocksTimestamps = this.getBlocksTimestamps(blocks);

    await this.simpleTransferFlowCompletedRepository.formatAndSaveSimpleTransferFlowCompletedEvents(
      simpleTransferFlowCompletedEvents,
      lastFinalisedBlock,
      this.chainId,
      blocksTimestamps,
    );

    return {};
  }

  private getBlocksTimestamps(
    blocks: Record<string, providers.Block>,
  ): Record<number, Date> {
    return Object.entries(blocks).reduce(
      (acc, [blockNumber, block]) => {
        acc[parseInt(blockNumber)] = new Date(block.timestamp * 1000);
        return acc;
      },
      {} as Record<number, Date>,
    );
  }
}
