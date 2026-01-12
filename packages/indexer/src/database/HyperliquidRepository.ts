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

  public async formatAndSaveHyperliquidDeposits(
    deposits: HyperliquidDepositEvent[],
    lastFinalisedBlock: number,
    blockDates: Record<number, Date>,
  ) {
    const formattedEvents: Partial<entities.HyperliquidDeposit>[] =
      deposits.map((deposit) => {
        return {
          blockNumber: deposit.blockNumber,
          logIndex: deposit.logIndex ?? 0,
          transactionHash: deposit.transactionHash,
          transactionIndex: deposit.transactionIndex ?? 0,
          blockTimestamp:
            deposit.blockTimestamp || blockDates[deposit.blockNumber]!,
          user: deposit.user,
          amount: deposit.amount,
          token: deposit.token,
          depositType: deposit.depositType,
          nonce: deposit.nonce,
          finalised: deposit.blockNumber <= lastFinalisedBlock,
        };
      });

    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.HyperliquidDeposit>(
          entities.HyperliquidDeposit,
          eventsChunk,
          ["blockNumber", "transactionHash", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }
}
