import { Logger } from "winston";
import { CHAIN_IDs } from "@across-protocol/constants";
import * as across from "@across-protocol/sdk";

import { DataSource } from "@repo/indexer-database";

import { Config } from "../../parseEnv";
import { RetryProvidersFactory } from "../../web3/RetryProvidersFactory";
import {
  getFinalisedBlockBufferDistance,
  getIndexingDelaySeconds,
} from "./constants";
import { EvmIndexer, Indexer } from "./Indexer";
import { OFTIndexerDataHandler } from "./OFTIndexerDataHandler";
import { OftRepository } from "../../database/OftRepository";

const MAX_BLOCK_RANGE_SIZE = 10_000;

export class OFTIndexerManager {
  private indexers: Indexer[] = [];

  constructor(
    private logger: Logger,
    private config: Config,
    private postgres: DataSource,
    private retryProvidersFactory: RetryProvidersFactory,
    private oftRepository: OftRepository,
  ) {}

  public async start() {
    try {
      if (!this.config.enableOftIndexer) {
        this.logger.warn({
          at: "Indexer#OFTIndexerManager#start",
          message: "OFT indexer is disabled",
        });
        return;
      }

      return this.startEvmIndexer();
    } catch (error) {
      this.logger.error({
        at: "Indexer#OFTIndexerManager#start",
        message: "Error starting OFT indexer",
        error,
        errorJson: JSON.stringify(error),
      });
      throw error;
    }
  }

  public async stopGracefully() {
    this.indexers.map((indexer) => indexer.stopGracefully());
  }

  private async startEvmIndexer() {
    const indexers = Object.keys(OFT_SUPPORTED_CHAINS).map((chainId) => {
      const provider = this.retryProvidersFactory.getCustomEvmProvider({
        chainId: Number(chainId),
        enableCaching: false,
      }) as across.providers.RetryProvider;
      const oftIndexerDataHandler = new OFTIndexerDataHandler(
        this.logger,
        Number(chainId),
        provider,
        this.oftRepository,
      );
      const indexer = new EvmIndexer(
        {
          indexingDelaySeconds: getIndexingDelaySeconds(
            Number(chainId),
            this.config,
          ),
          finalisedBlockBufferDistance: getFinalisedBlockBufferDistance(
            Number(chainId),
          ),
          maxBlockRangeSize: MAX_BLOCK_RANGE_SIZE,
        },
        oftIndexerDataHandler,
        this.logger,
        this.postgres,
        provider,
      );
      return indexer;
    });

    if (indexers.length === 0) {
      this.logger.warn({
        at: "Indexer#OFTIndexerManager#startEvmIndexer",
        message: "No EVM OFT indexers to start",
      });
      return;
    }

    this.logger.debug({
      at: "Indexer#OFTIndexerManager#startEvmIndexer",
      message: "Starting EVM OFT indexers",
    });
    await Promise.all(indexers.map((indexer) => indexer.start()));
    this.indexers = indexers;

    return Promise.resolve();
  }
}

export const OFT_SUPPORTED_CHAINS = {
  [CHAIN_IDs.MAINNET]: {
    address: "0x6C96dE32CEa08842dcc4058c14d3aaAD7Fa41dee",
    startBlockNumber: 23400000,
  },
  [CHAIN_IDs.ARBITRUM]: {
    address: "0x14E4A1B13bf7F943c8ff7C51fb60FA964A298D92",
    startBlockNumber: 385700000,
  },
  [CHAIN_IDs.POLYGON]: {
    address: "0x6BA10300f0DC58B7a1e4c0e41f5daBb7D7829e13",
    startBlockNumber: 77200000,
  },
  [CHAIN_IDs.HYPEREVM]: {
    address: "0x904861a24F30EC96ea7CFC3bE9EA4B476d237e98",
    startBlockNumber: 15500000,
  },
  [CHAIN_IDs.PLASMA]: {
    address: "0x02ca37966753bDdDf11216B73B16C1dE756A7CF9",
    startBlockNumber: 2500000,
  },
};
