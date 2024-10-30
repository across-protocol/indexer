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
    while (!this.stopRequested) {
      try {
        const { latestBlockNumber, blockRange, lastFinalisedBlock } =
          await this.getBlockRange();

        if (!blockRange) {
          this.logger.info({
            at: "Indexer::start",
            message: "No new blocks to process",
            latestBlockNumber,
            dataIdentifier: this.dataHandler.getDataIdentifier(),
          });
        } else {
          await this.dataHandler.processBlockRange(
            blockRange,
            lastFinalisedBlock,
          );
          await this.redisCache.set(
            this.getLastFinalisedBlockCacheKey(),
            lastFinalisedBlock,
          );
        }
      } catch (error) {
        this.logger.error({
          at: "Indexer::start",
          message: "Error processing block range",
          dataIdentifier: this.dataHandler.getDataIdentifier(),
          error,
        });
      } finally {
        await across.utils.delay(this.config.loopWaitTimeSeconds);
      }
    }
  }

  /**
   * Issues a stop request to the indexer.
   * @dev Note: this does not stop the indexer immediately, but sets a flag that the indexer should stop at the next opportunity.
   */
  public stopGracefully() {
    this.logger.info({
      at: "Indexer::stopGracefully",
      message: `Requesting indexer ${this.dataHandler.getDataIdentifier()} to be stopped`,
    });
    this.stopRequested = true;
  }

  private async getBlockRange() {
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
      };
    }
    const fromBlock = lastBlockFinalisedStored
      ? lastBlockFinalisedStored + 1
      : this.dataHandler.getStartIndexingBlockNumber();
    // TODO: hardcoded 200_000, should be a config or removed
    const toBlock = Math.min(fromBlock + 50_000, latestBlockNumber);
    const blockRange: BlockRange = { from: fromBlock, to: toBlock };
    const lastFinalisedBlockInBlockRange = Math.min(
      blockRange.to,
      lastFinalisedBlockOnChain,
    );

    return {
      latestBlockNumber,
      blockRange,
      lastFinalisedBlock: lastFinalisedBlockInBlockRange,
    };
  }

  private getLastFinalisedBlockCacheKey() {
    return `indexer:lastBlockFinalised:${this.dataHandler.getDataIdentifier()}`;
  }
}
