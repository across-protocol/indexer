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
import { HyperEVMIndexerDataHandler } from "./HyperEVMIndexerDataHandler";
import { SimpleTransferFlowCompletedRepository } from "../../database/SimpleTransferFlowCompletedRepository";

const MAX_BLOCK_RANGE_SIZE = 1000;

export class HyperEVMIndexerManager {
  private evmIndexer?: Indexer;

  constructor(
    private logger: Logger,
    private config: Config,
    private postgres: DataSource,
    private retryProvidersFactory: RetryProvidersFactory,
    private simpleTransferFlowCompletedRepository: SimpleTransferFlowCompletedRepository,
    private testNet: boolean = false,
  ) {}

  public async start() {
    try {
      if (!this.config.enableHyperEVMIndexer) {
        this.logger.warn({
          at: "Indexer#HyperEVMIndexerManager#start",
          message: "Hyper EVM indexer is disabled",
        });
        return;
      }

      return this.startEvmIndexer();
    } catch (error) {
      this.logger.error({
        at: "Indexer#HyperEVMIndexerManager#start",
        message: "Error starting Hyper EVM indexer",
        error,
        errorJson: JSON.stringify(error),
      });
      throw error;
    }
  }

  public async stopGracefully() {
    this.evmIndexer?.stopGracefully();
  }

  private async startEvmIndexer() {
    const chainId = this.testNet
      ? CHAIN_IDs.HYPEREVM_TESTNET
      : CHAIN_IDs.HYPEREVM;
    const provider = this.retryProvidersFactory.getCustomEvmProvider({
      chainId,
      enableCaching: false,
    }) as across.providers.RetryProvider;
    const hyperEVMIndexerDataHandler = new HyperEVMIndexerDataHandler(
      this.logger,
      chainId,
      provider,
      this.simpleTransferFlowCompletedRepository,
    );
    const indexer = new EvmIndexer(
      {
        indexingDelaySeconds: getIndexingDelaySeconds(chainId, this.config),
        finalisedBlockBufferDistance: getFinalisedBlockBufferDistance(chainId),
        maxBlockRangeSize: MAX_BLOCK_RANGE_SIZE,
        indexingDelaySecondsOnError: this.config.indexingDelaySecondsOnError,
      },
      hyperEVMIndexerDataHandler,
      this.logger,
      this.postgres,
      provider,
    );

    this.logger.debug({
      at: "Indexer#HyperEVMIndexerManager#startEvmIndexer",
      message: "Starting Hyper EVM indexer",
      chainId,
    });
    this.evmIndexer = indexer;
    return indexer.start();
  }
}
