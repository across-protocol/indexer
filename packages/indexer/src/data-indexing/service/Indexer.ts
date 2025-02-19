import * as across from "@across-protocol/sdk";
import { ethers } from "ethers";
import { Logger } from "winston";

import { entities, DataSource } from "@repo/indexer-database";

import { IndexerDataHandler } from "./IndexerDataHandler";
import { BlockRange } from "../model";
import { RedisCache } from "../../redis/redisCache";

const DEFAULT_MAX_BLOCK_RANGE_SIZE = 50_000;

export type ConstructorConfig = {
  /** Time to wait before going to the next block ranges. */
  loopWaitTimeSeconds: number;
  /** Distance from the latest block to consider onchain data finalised. */
  finalisedBlockBufferDistance: number;
  /**
   * Maximum block range size to process in a single call. This is mainly for debugging purposes.
   * If not set, the max block range size is set to {@link DEFAULT_MAX_BLOCK_RANGE_SIZE}.
   */
  maxBlockRangeSize?: number;
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
    private logger: Logger,
    private dataSource: DataSource,
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
            blockRangeResult.isBackfilling,
          );
          // When the block range is processed successfully and the indexer is ready to start
          // processing the next block range, save the progress in the database. The most important
          // information to save is the last finalised block, as this is the block that will be used
          // as the starting point for the next block range.
          await this.saveProgressInDatabase(blockRangeResult);
        }
        blockRangeProcessedSuccessfully = true;
      } catch (error) {
        this.logger.error({
          at: "Indexer#start",
          message: "Error processing block range",
          notificationPath: "across-indexer-error",
          blockRangeResult,
          dataIdentifier: this.dataHandler.getDataIdentifier(),
          error: JSON.stringify(error),
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

  private async saveProgressInDatabase(blockRangeResult: BlockRangeResult) {
    return this.dataSource.getRepository(entities.IndexerProgressInfo).upsert(
      {
        id: this.dataHandler.getDataIdentifier(),
        lastFinalisedBlock: blockRangeResult.lastFinalisedBlock,
        latestBlockNumber: blockRangeResult.latestBlockNumber,
        isBackfilling: blockRangeResult.isBackfilling,
      },
      { conflictPaths: ["id"], skipUpdateIfNoValuesChanged: true },
    );
  }

  private async loadProgressFromDatabase(
    latestBlockNumber: number,
  ): Promise<BlockRangeResult | undefined> {
    const indexerProgressInfo = await this.dataSource
      .getRepository(entities.IndexerProgressInfo)
      .findOne({
        where: {
          id: this.dataHandler.getDataIdentifier(),
        },
      });
    if (across.utils.isDefined(indexerProgressInfo)) {
      const fromBlock = indexerProgressInfo.lastFinalisedBlock + 1;
      const toBlock = Math.min(
        fromBlock +
          (this.config.maxBlockRangeSize ?? DEFAULT_MAX_BLOCK_RANGE_SIZE),
        indexerProgressInfo.latestBlockNumber,
      );

      // If the last finalized block is the same as the latest block number,
      // then we are at the latest block and there are no new blocks to process.
      if (latestBlockNumber === indexerProgressInfo.latestBlockNumber) {
        return {
          latestBlockNumber: indexerProgressInfo.latestBlockNumber,
          blockRange: undefined,
          lastFinalisedBlock: indexerProgressInfo.lastFinalisedBlock,
          isBackfilling: false,
        };
      }

      return {
        latestBlockNumber: indexerProgressInfo.latestBlockNumber,
        blockRange: { from: fromBlock, to: toBlock },
        lastFinalisedBlock: indexerProgressInfo.lastFinalisedBlock,
        isBackfilling: indexerProgressInfo.isBackfilling,
      };
    }
  }

  /**
   * Gets the next block range to process.
   * `from` block is the last finalised block stored in redis + 1 or the start block number for the data handler.
   * `to` block is the latest block number onchain, but `to` - `from` is capped at a certain value.
   *  If the last finalised block onchain is the same as the last finalised block stored in redis,
   *  i.e no new blocks have been mined, then the block range is `undefined`.
   */
  private async getBlockRange(): Promise<BlockRangeResult> {
    const latestBlockNumber = await this.rpcProvider.getBlockNumber();

    const databaseProgress =
      await this.loadProgressFromDatabase(latestBlockNumber);
    if (databaseProgress) {
      return databaseProgress;
    }

    const lastFinalisedBlockOnChain =
      latestBlockNumber - this.config.finalisedBlockBufferDistance;
    const fromBlock = this.dataHandler.getStartIndexingBlockNumber();
    const toBlock = Math.min(
      fromBlock +
        (this.config.maxBlockRangeSize ?? DEFAULT_MAX_BLOCK_RANGE_SIZE),
      latestBlockNumber,
    );
    const blockRange: BlockRange = { from: fromBlock, to: toBlock };
    const lastFinalisedBlockInBlockRange = Math.min(
      blockRange.to,
      lastFinalisedBlockOnChain,
    );

    // If we specifically set the max block range then do not consider this
    // run to be a backfilling run
    const isBackfilling =
      !this.config.maxBlockRangeSize &&
      latestBlockNumber - blockRange.to > 100_000;

    return {
      latestBlockNumber,
      blockRange,
      lastFinalisedBlock: lastFinalisedBlockInBlockRange,
      isBackfilling,
    };
  }
}
