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
  constructor(
    private config: ConstructorConfig,
    private dataHandler: IndexerDataHandler,
    private rpcProvider: ethers.providers.JsonRpcProvider,
    private redisCache: RedisCache,
    private logger: Logger,
  ) {}

  async start() {
    while (true) {
      try {
        const { latestBlockNumber, blockRange } = await this.getBlockRange();

        if (!blockRange) {
          this.logger.info({
            at: "Indexer::start",
            message: "No new blocks to process",
            latestBlockNumber,
            dataIdentifier: this.dataHandler.getDataIdentifier(),
          });
        } else {
          const lastFinalisedBlockInBlockRange =
            this.getLastFinalisedBlockInBlockRange(
              latestBlockNumber,
              blockRange,
            );
          await this.dataHandler.processBlockRange(
            blockRange,
            lastFinalisedBlockInBlockRange,
          );
          await this.redisCache.set(
            this.getLastFinalisedBlockCacheKey(),
            lastFinalisedBlockInBlockRange,
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

  private getLastFinalisedBlockInBlockRange(
    latestBlockNumber: number,
    blockRange: BlockRange,
  ) {
    const lastOnChainFinalisedBlock =
      latestBlockNumber - this.config.finalisedBlockBufferDistance + 1;
    const lastFinalisedBlockInBlockRange = Math.min(
      blockRange.to,
      lastOnChainFinalisedBlock,
    );

    return lastFinalisedBlockInBlockRange;
  }

  private async getBlockRange() {
    const lastBlockFinalised = await this.redisCache.get<number>(
      this.getLastFinalisedBlockCacheKey(),
    );
    const latestBlockNumber = await this.rpcProvider.getBlockNumber();
    // If the last block finalised is the same as the latest block, no new blocks to process
    if (latestBlockNumber === lastBlockFinalised) {
      return { latestBlockNumber, blockRange: undefined };
    }
    const fromBlock = lastBlockFinalised
      ? lastBlockFinalised + 1
      : this.dataHandler.getStartIndexingBlockNumber();
    // TODO: hardcoded 200_000, should be a config or removed
    const toBlock = Math.min(fromBlock + 200_000, latestBlockNumber);
    const blockRange: BlockRange = { from: fromBlock, to: toBlock };
    return { latestBlockNumber, blockRange };
  }

  private getLastFinalisedBlockCacheKey() {
    return `indexer:lastBlockFinalised:${this.dataHandler.getDataIdentifier()}`;
  }
}
