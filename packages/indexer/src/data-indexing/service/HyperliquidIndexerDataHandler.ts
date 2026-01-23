import { Logger } from "winston";
import { DataSource, entities } from "@repo/indexer-database";
import {
  IndexerDataHandler,
  ProcessBlockRangeRequest,
} from "./IndexerDataHandler";
import { BlockRange } from "../model";
import {
  HyperliquidRpcClient,
  HyperliquidBlock,
  HyperliquidStreamType,
} from "../adapter/hyperliquid/HyperliquidRpcClient";
import { HyperliquidDepositEvent } from "../adapter/hyperliquid/model";
import { HyperliquidRepository } from "../../database/HyperliquidRepository";
import { HYPERLIQUID_CORE_DEPOSIT_WALLET } from "./constants";
import { IndexerError } from "@repo/error-handling";

/**
 * Error thrown when a required field is missing from a Hyperliquid deposit event
 */
class HyperliquidMissingFieldError extends IndexerError {
  constructor(
    fieldName: string,
    blockNumber: number,
    additionalData?: Record<string, string>,
  ) {
    const message = `Missing required field '${fieldName}' for HyperliquidDeposit event in block ${blockNumber}`;
    super(HyperliquidMissingFieldError.name, message, {
      fieldName,
      blockNumber: blockNumber.toString(),
      ...additionalData,
    });
  }
}

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
  private readonly STREAM_TYPE = HyperliquidStreamType.WRITER_ACTIONS;

  constructor(
    private logger: Logger,
    private rpcUrl: string,
    private hyperliquidRepository: HyperliquidRepository,
    private startBlockNumber: number,
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

  public async processBlockRange(request: ProcessBlockRangeRequest) {
    const { blockRange, lastFinalisedBlock, isBackfilling = false } = request;
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
    await this.storeDeposits(deposits, lastFinalisedBlock);
    const timeToStoreDeposits = performance.now();

    const finalPerfTime = performance.now();

    this.logger.debug({
      at: "Indexer#HyperliquidIndexerDataHandler#processBlockRange",
      message:
        "System Time Log for HyperliquidIndexerDataHandler#processBlockRange",
      blockRange: blockRange,
      finalTime: finalPerfTime - startPerfTime,
      timeToFetchDeposits: timeToFetchDeposits - startPerfTime,
      timeToStoreDeposits: timeToStoreDeposits - timeToFetchDeposits,
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
   * Uses writer_actions stream and filters for deposits based on core deposit wallet
   *
   * Rule for deposits (EVM → HyperCore):
   * - SystemSendAssetAction where user field equals the core deposit wallet address
   * - The destination field is the actual user wallet
   * - Token must be 0 (USDC)
   */
  private parseDepositsFromBlock(
    block: HyperliquidBlock,
  ): HyperliquidDepositEvent[] {
    const deposits: HyperliquidDepositEvent[] = [];

    if (!block.data || !Array.isArray(block.data)) {
      return deposits;
    }

    // USDC token ID
    const USDC_TOKEN_ID = 0;

    // Process events from writer_actions stream
    for (const event of block.data) {
      try {
        // Only process SystemSendAssetAction events
        if (event.action?.type !== "SystemSendAssetAction") {
          continue;
        }

        // Check if user equals the core deposit wallet address
        if (
          event.user?.toLowerCase() !==
          HYPERLIQUID_CORE_DEPOSIT_WALLET.toLowerCase()
        ) {
          continue;
        }

        // Filter for USDC only (token 0)
        if (event.action?.token !== USDC_TOKEN_ID) {
          continue;
        }

        // The destination is the actual user wallet
        if (!event.action?.destination) {
          throw new HyperliquidMissingFieldError(
            "destination",
            block.blockNumber,
          );
        }
        if (!event.nonce) {
          throw new HyperliquidMissingFieldError("nonce", block.blockNumber);
        }
        if (!event.evm_tx_hash) {
          throw new HyperliquidMissingFieldError(
            "evm_tx_hash",
            block.blockNumber,
          );
        }
        if (event.action?.wei == null) {
          throw new HyperliquidMissingFieldError(
            "action.wei",
            block.blockNumber,
          );
        }
        if (event.action?.token == null) {
          throw new HyperliquidMissingFieldError(
            "action.token",
            block.blockNumber,
          );
        }
        if (!event.action?.type) {
          throw new HyperliquidMissingFieldError(
            "action.type",
            block.blockNumber,
          );
        }

        const deposit: HyperliquidDepositEvent = {
          blockNumber: block.blockNumber,
          transactionHash: event.evm_tx_hash,
          blockTimestamp: block.blockTime
            ? new Date(block.blockTime)
            : new Date(),
          user: event.action.destination,
          amount: event.action.wei.toString(),
          token: event.action.token.toString(),
          depositType: event.action.type,
          nonce: event.nonce.toString(),
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
