import { Logger } from "winston";
import { DataSource, entities } from "@repo/indexer-database";
import { IndexerDataHandler } from "./IndexerDataHandler";
import { BlockRange } from "../model";
import {
  HyperliquidRpcClient,
  HyperliquidBlock,
} from "../adapter/hyperliquid/HyperliquidRpcClient";
import { HyperliquidDepositEvent } from "../adapter/hyperliquid/model";
import { HyperliquidRepository } from "../../database/HyperliquidRepository";
import * as across from "@across-protocol/sdk";

export type FetchDepositsResult = {
  deposits: HyperliquidDepositEvent[];
};

export type StoreDepositsResult = {
  savedDeposits: {
    inserted: entities.HyperliquidDeposit[];
    updated: entities.HyperliquidDeposit[];
  };
};

export class HyperliquidIndexerDataHandler implements IndexerDataHandler {
  private isInitialized: boolean;
  private readonly STREAM_TYPE: "writer_actions" = "writer_actions";

  constructor(
    private logger: Logger,
    private rpcUrl: string,
    private hyperliquidRepository: HyperliquidRepository,
    private startBlockNumber: number = 0,
  ) {
    this.isInitialized = false;
  }

  private initialize() {}

  public getDataIdentifier() {
    return "hyperliquid:writer_actions";
  }

  public getStartIndexingBlockNumber() {
    return this.startBlockNumber;
  }

  public async processBlockRange(
    blockRange: BlockRange,
    lastFinalisedBlock: number,
    isBackfilling: boolean = false,
  ) {
    this.logger.debug({
      at: "Indexer#HyperliquidIndexerDataHandler#processBlockRange",
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

    // Fetch deposits from Hyperliquid blocks
    const deposits = await this.fetchDepositsByRange(blockRange);
    const timeToFetchDeposits = performance.now();

    this.logger.debug({
      at: "Indexer#HyperliquidIndexerDataHandler#processBlockRange",
      message: `Found ${deposits.deposits.length} deposits for ${this.getDataIdentifier()}`,
      blockRange,
    });

    // Store deposits
    const storedDeposits = await this.storeDeposits(
      deposits,
      lastFinalisedBlock,
    );
    const timeToStoreDeposits = performance.now();

    // Delete unfinalised deposits
    await this.hyperliquidRepository.deleteUnfinalisedHyperliquidDeposits(
      lastFinalisedBlock,
    );
    const timeToDeleteDeposits = performance.now();

    const finalPerfTime = performance.now();

    this.logger.debug({
      at: "Indexer#HyperliquidIndexerDataHandler#processBlockRange",
      message:
        "System Time Log for HyperliquidIndexerDataHandler#processBlockRange",
      blockRange: blockRange,
      finalTime: finalPerfTime - startPerfTime,
      timeToFetchDeposits: timeToFetchDeposits - startPerfTime,
      timeToStoreDeposits: timeToStoreDeposits - timeToFetchDeposits,
      timeToDeleteDeposits: timeToDeleteDeposits - timeToStoreDeposits,
    });
  }

  /**
   * Fetches Hyperliquid deposit events from the QuickNode RPC for a given block range
   */
  private async fetchDepositsByRange(
    blockRange: BlockRange,
  ): Promise<FetchDepositsResult> {
    const rpcClient = new HyperliquidRpcClient(this.rpcUrl, this.logger);

    try {
      const batchSize = 100;
      const deposits: HyperliquidDepositEvent[] = [];

      for (
        let fromBlock = blockRange.from;
        fromBlock <= blockRange.to;
        fromBlock += batchSize
      ) {
        const toBlock = Math.min(fromBlock + batchSize - 1, blockRange.to);

        this.logger.debug({
          at: "HyperliquidIndexerDataHandler#fetchDepositsByRange",
          message: `Fetching blocks ${fromBlock} to ${toBlock}`,
        });

        const blocks = await rpcClient.getBatchBlocks(
          this.STREAM_TYPE,
          fromBlock,
          toBlock,
        );

        // Parse deposits from blocks
        for (const block of blocks) {
          const blockDeposits = this.parseDepositsFromBlock(block);
          deposits.push(...blockDeposits);
        }
      }

      return { deposits };
    } catch (error: any) {
      this.logger.error({
        at: "HyperliquidIndexerDataHandler#fetchDepositsByRange",
        message: "Error fetching deposits from Hyperliquid RPC",
        error: error.message,
        errorJson: JSON.stringify(error),
        blockRange,
      });
      throw error;
    }
  }

  /**
   * Parses deposit events from a Hyperliquid block
   */
  private parseDepositsFromBlock(
    block: HyperliquidBlock,
  ): HyperliquidDepositEvent[] {
    const deposits: HyperliquidDepositEvent[] = [];

    if (!block.data || !Array.isArray(block.data)) {
      return deposits;
    }

    // Store all events from the block as raw data
    for (const event of block.data) {
      try {
        const deposit: HyperliquidDepositEvent = {
          blockNumber: block.blockNumber,
          transactionHash: event.txHash || event.transactionHash || "",
          transactionIndex: event.txIndex ?? 0,
          logIndex: event.logIndex ?? 0,
          blockTimestamp: event.timestamp
            ? new Date(event.timestamp)
            : new Date(),
          user: event.user || event.from || event.address || "",
          amount: event.amount || event.value || "0",
          token: event.token || event.tokenAddress || "",
          depositType: event.type || event.depositType,
          nonce: event.nonce?.toString(),
        };

        deposits.push(deposit);
      } catch (error: any) {
        this.logger.warn({
          at: "HyperliquidIndexerDataHandler#parseDepositsFromBlock",
          message: "Error parsing event",
          error: error.message,
          blockNumber: block.blockNumber,
          event: JSON.stringify(event),
        });
      }
    }

    return deposits;
  }

  /**
   * Stores deposits in the database
   */
  private async storeDeposits(
    deposits: FetchDepositsResult,
    lastFinalisedBlock: number,
  ): Promise<StoreDepositsResult> {
    if (deposits.deposits.length === 0) {
      return {
        savedDeposits: {
          inserted: [],
          updated: [],
        },
      };
    }

    const blockDates: Record<number, Date> = {};

    for (const deposit of deposits.deposits) {
      if (!blockDates[deposit.blockNumber]) {
        blockDates[deposit.blockNumber] = deposit.blockTimestamp;
      }
    }

    const savedDeposits =
      await this.hyperliquidRepository.formatAndSaveHyperliquidDeposits(
        deposits.deposits,
        lastFinalisedBlock,
        blockDates,
      );

    const inserted = savedDeposits.filter(
      (r) => r.result === "inserted",
    ) as any[];
    const updated = savedDeposits.filter(
      (r) => r.result === "updated",
    ) as any[];

    return {
      savedDeposits: {
        inserted: inserted.map((r) => r.data),
        updated: updated.map((r) => r.data),
      },
    };
  }
}
