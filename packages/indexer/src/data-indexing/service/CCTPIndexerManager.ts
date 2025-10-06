import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import { CHAIN_IDs } from "@across-protocol/constants";

import { DataSource } from "@repo/indexer-database";

import { Config } from "../../parseEnv";
import {
  getFinalisedBlockBufferDistance,
  getIndexingDelaySeconds,
} from "./constants";
import { Indexer, EvmIndexer } from "./Indexer";
import { RetryProvidersFactory } from "../../web3/RetryProvidersFactory";
import { CCTPIndexerDataHandler } from "./CCTPIndexerDataHandler";
import { CCTPRepository } from "../../database/CctpRepository";

const MAX_BLOCK_RANGE_SIZE = 10000;

export class CCTPIndexerManager {
  private evmIndexer?: Indexer;
  private svmIndexer?: Indexer;

  constructor(
    private logger: Logger,
    private config: Config,
    private postgres: DataSource,
    private retryProvidersFactory: RetryProvidersFactory,
    private cctpRepository: CCTPRepository,
  ) {}

  public async start() {
    try {
      return Promise.all([this.startEvmIndexer()]);
    } catch (error) {
      this.logger.error({
        at: "Indexer#CCTPIndexerManager#start",
        message: "Error starting CCTP indexer",
        error,
        errorJson: JSON.stringify(error),
      });
      throw error;
    }
  }

  public async stopGracefully() {
    this.evmIndexer?.stopGracefully();
    this.svmIndexer?.stopGracefully();
  }

  private async startEvmIndexer() {
    const indexers = CCTP_SUPPORTED_CHAINS.map((chainId) => {
      const provider = this.retryProvidersFactory.getCustomEvmProvider({
        chainId,
        enableCaching: false,
      }) as across.providers.RetryProvider;
      const cctpIndexerDataHandler = new CCTPIndexerDataHandler(
        this.logger,
        chainId,
        provider,
        this.cctpRepository,
      );
      const indexer = new EvmIndexer(
        {
          indexingDelaySeconds: getIndexingDelaySeconds(chainId, this.config),
          finalisedBlockBufferDistance:
            getFinalisedBlockBufferDistance(chainId),
          maxBlockRangeSize: MAX_BLOCK_RANGE_SIZE,
        },
        cctpIndexerDataHandler,
        this.logger,
        this.postgres,
        provider,
      );
      return indexer;
    });

    if (indexers.length === 0) {
      this.logger.warn({
        at: "Indexer#CCTPIndexerManager#startEvmIndexer",
        message: "No EVM CCTP indexers to start",
      });
      return;
    }

    this.logger.debug({
      at: "Indexer#CCTPIndexerManager#startEvmIndexer",
      message: "Starting EVM CCTP indexers",
    });
    return Promise.all(indexers.map((indexer) => indexer.start()));
  }

  private startSvmIndexer() {
    return Promise.resolve();
  }
}

export const CCTP_SUPPORTED_CHAINS = [
  CHAIN_IDs.MAINNET,
  CHAIN_IDs.ARBITRUM,
  CHAIN_IDs.BASE,
  CHAIN_IDs.HYPEREVM,
  CHAIN_IDs.INK,
  CHAIN_IDs.OPTIMISM,
  CHAIN_IDs.POLYGON,
  CHAIN_IDs.UNICHAIN,
  CHAIN_IDs.WORLD_CHAIN,
];
