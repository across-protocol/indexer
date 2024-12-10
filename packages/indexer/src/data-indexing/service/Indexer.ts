import * as across from "@across-protocol/sdk";
import { ethers } from "ethers";
import { Logger } from "winston";

import { IndexerDataHandler } from "./IndexerDataHandler";
import { BlockRange } from "../model";
import { RedisCache } from "../../redis/redisCache";

export type ConstructorConfig = {
  /** Time to wait before going to the next block ranges. */
  loopWaitTimeSeconds: number;
  /** Distance from the latest block to consider onchain data finalised. */
  finalisedBlockBufferDistance: number;
};

type BlockRangeResult = {
  latestBlockNumber: number;
  blockRange: BlockRange | undefined;
  lastFinalisedBlock: number;
  isBackfilling: boolean;
};

/**
 * Indexer class that accepts a data handler and passes block ranges to it for processing.
 * It also handles on chain data finalisation.
 * Block ranges are resumed from the last finalised block stored in a persistent cache/db.
 */
export class Indexer {
  private stopRequested: boolean;

  constructor(
    private config: ConstructorConfig,
    private dataHandler: IndexerDataHandler,
    private rpcProvider: ethers.providers.JsonRpcProvider,
    private redisCache: RedisCache,
    private logger: Logger,
  ) {
    this.stopRequested = false;
  }

  public async start() {
    let blockRangeResult: BlockRangeResult | undefined = undefined;
    let blockRangeProcessedSuccessfully = true;

    while (!this.stopRequested) {
      try {
        // if the previous block range was processed successfully or if this is the first loop iteration,
        // get the next block range to process
        if (blockRangeProcessedSuccessfully || !blockRangeResult) {
          blockRangeResult = await this.getBlockRange();
        }

        if (!blockRangeResult?.blockRange) {
          this.logger.debug({
            at: "Indexer#start",
            message: `No new blocks to process ${this.dataHandler.getDataIdentifier()}`,
            blockRangeResult,
            dataIdentifier: this.dataHandler.getDataIdentifier(),
          });
        } else {
          await this.dataHandler.processBlockRange(
            blockRangeResult.blockRange,
            blockRangeResult.lastFinalisedBlock,
          );
          await this.redisCache.set(
            this.getLastFinalisedBlockCacheKey(),
            blockRangeResult.lastFinalisedBlock,
          );
        }
        blockRangeProcessedSuccessfully = true;
      } catch (error) {
        // TODO: remove this after testing
        console.error(error);
        this.logger.error({
          at: "Indexer#start",
          message: "Error processing block range",
          notificationPath: "across-indexer-error",
          blockRangeResult,
          dataIdentifier: this.dataHandler.getDataIdentifier(),
          error,
        });
        blockRangeProcessedSuccessfully = false;
      } finally {
        if (!blockRangeResult?.isBackfilling) {
          await across.utils.delay(this.config.loopWaitTimeSeconds);
        } else {
          this.logger.debug({
            at: "Indexer#start",
            message: `Skip delay ${this.dataHandler.getDataIdentifier()}. Backfill in progress...`,
            dataIdentifier: this.dataHandler.getDataIdentifier(),
          });
        }
      }
    }
  }

  /**
   * Issues a stop request to the indexer.
   * @dev Note: this does not stop the indexer immediately, but sets a flag that the indexer should stop at the next opportunity.
   */
  public stopGracefully() {
    this.logger.info({
      at: "Indexer#stopGracefully",
      message: `Requesting indexer ${this.dataHandler.getDataIdentifier()} to be stopped`,
    });
    this.stopRequested = true;
  }

  /**
   * Gets the next block range to process.
   * `from` block is the last finalised block stored in redis + 1 or the start block number for the data handler.
   * `to` block is the latest block number onchain, but `to` - `from` is capped at a certain value.
   *  If the last finalised block onchain is the same as the last finalised block stored in redis,
   *  i.e no new blocks have been mined, then the block range is `undefined`.
   */
  private async getBlockRange(): Promise<BlockRangeResult> {
    const lastBlockFinalisedStored = await this.redisCache.get<number>(
      this.getLastFinalisedBlockCacheKey(),
    );
    const latestBlockNumber = await this.rpcProvider.getBlockNumber();
    const lastFinalisedBlockOnChain =
      latestBlockNumber - this.config.finalisedBlockBufferDistance;

    if (lastBlockFinalisedStored === lastFinalisedBlockOnChain) {
      return {
        latestBlockNumber,
        blockRange: undefined,
        lastFinalisedBlock: lastFinalisedBlockOnChain,
        isBackfilling: false,
      };
    }
    const fromBlock = lastBlockFinalisedStored
      ? lastBlockFinalisedStored + 1
      : this.dataHandler.getStartIndexingBlockNumber();
    const toBlock = Math.min(fromBlock + 50_000, latestBlockNumber);
    const blockRange: BlockRange = { from: fromBlock, to: toBlock };
    const lastFinalisedBlockInBlockRange = Math.min(
      blockRange.to,
      lastFinalisedBlockOnChain,
    );
    const isBackfilling = latestBlockNumber - blockRange.to > 100_000;
    return {
      latestBlockNumber,
      blockRange,
      lastFinalisedBlock: lastFinalisedBlockInBlockRange,
      isBackfilling,
    };
  }

  private getLastFinalisedBlockCacheKey() {
    return `indexer:lastBlockFinalised:${this.dataHandler.getDataIdentifier()}`;
  }
}
