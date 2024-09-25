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
        const lastBlockFinalised = await this.redisCache.get<number>(
          this.getLastFinalisedBlockCacheKey(),
        );
        const fromBlock = lastBlockFinalised
          ? lastBlockFinalised + 1
          : this.dataHandler.getStartIndexingBlockNumber();
        const latestBlockNumber = await this.rpcProvider.getBlockNumber();
        // TODO: hardcoded 200_000, should be a config or removed
        const toBlock = Math.min(fromBlock + 200_000, latestBlockNumber);

        if (fromBlock > toBlock) {
          this.logger.info({
            at: "Indexer::start",
            message: "No new blocks to process",
            latestBlockNumber,
            dataIdentifier: this.dataHandler.getDataIdentifier(),
          });
          await across.utils.delay(this.config.loopWaitTimeSeconds);
          continue;
        }
        const blockRange: BlockRange = { from: fromBlock, to: toBlock };
        const lastOnChainFinalisedBlock =
          latestBlockNumber - this.config.finalisedBlockBufferDistance + 1;
        const lastBlockRangeFinalisedBlock = Math.min(
          toBlock,
          lastOnChainFinalisedBlock,
        );
        await this.dataHandler.processBlockRange(
          blockRange,
          lastBlockRangeFinalisedBlock,
        );
        await this.redisCache.set(
          this.getLastFinalisedBlockCacheKey(),
          lastBlockRangeFinalisedBlock,
        );
        await across.utils.delay(this.config.loopWaitTimeSeconds);
      } catch (error) {
        this.logger.error(`Indexer::Error processing block range`, error);
        await across.utils.delay(this.config.loopWaitTimeSeconds);
      }
    }
  }

  private getLastFinalisedBlockCacheKey() {
    return `indexer:lastBlockFinalised:${this.dataHandler.getDataIdentifier()}`;
  }
}
