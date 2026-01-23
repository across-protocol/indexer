import winston from "winston";
import { MoreThan } from "typeorm";
import * as across from "@across-protocol/sdk";
import {
  DataSource,
  entities,
  utils as dbUtils,
  SaveQueryResult,
} from "@repo/indexer-database";
import { HyperliquidDepositEvent } from "../data-indexing/adapter/hyperliquid/model";

export class HyperliquidRepository extends dbUtils.BlockchainEventRepository {
  constructor(
    postgres: DataSource,
    logger: winston.Logger,
    private chunkSize = 100,
  ) {
    super(postgres, logger);
  }

  public async deleteUnfinalisedHyperliquidDeposits(
    lastFinalisedBlock: number,
  ) {
    const repository = this.postgres.getRepository(entities.HyperliquidDeposit);
    return repository.delete({
      blockNumber: MoreThan(lastFinalisedBlock),
      finalised: false,
    });
  }

  /**
   * Generates hypercore identifier from user and nonce
   */
  private generateHypercoreIdentifier(user: string, nonce: string): string {
    if (!user || !nonce) {
      throw new Error(
        "user and nonce are required to generate hypercoreIdentifier",
      );
    }
    return `${user}-${nonce}`;
  }

  public async formatAndSaveHyperliquidDeposits(
    deposits: HyperliquidDepositEvent[],
    lastFinalisedBlock: number,
    blockDates: Record<number, Date>,
  ) {
    const formattedEvents: Partial<entities.HyperliquidDeposit>[] =
      deposits.map((deposit) => {
        if (!deposit.user) {
          throw new Error("user is required for HyperliquidDeposit");
        }
        if (!deposit.nonce) {
          throw new Error("nonce is required for HyperliquidDeposit");
        }

        return {
          blockNumber: deposit.blockNumber,
          transactionHash: deposit.transactionHash,
          blockTimestamp:
            deposit.blockTimestamp || blockDates[deposit.blockNumber]!,
          user: deposit.user,
          amount: deposit.amount,
          token: deposit.token,
          depositType: deposit.depositType,
          nonce: deposit.nonce,
          hypercoreIdentifier: this.generateHypercoreIdentifier(
            deposit.user,
            deposit.nonce,
          ),
          finalised: deposit.blockNumber <= lastFinalisedBlock,
        };
      });

    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.HyperliquidDeposit>(
          entities.HyperliquidDeposit,
          eventsChunk,
          ["hypercoreIdentifier"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();

    return result;
  }
}
