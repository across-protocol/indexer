import winston from "winston";
import * as across from "@across-protocol/sdk";
import { DataSource, entities, utils as dbUtils } from "@repo/indexer-database";
import { UserAccountActivatedEvent } from "../web3/model/events";

export class HyperliquidDepositHandlerRepository extends dbUtils.BlockchainEventRepository {
  constructor(
    postgres: DataSource,
    logger: winston.Logger,
    private chunkSize = 100,
  ) {
    super(postgres, logger);
  }

  public async formatAndSaveUserAccountActivatedEvents(
    events: UserAccountActivatedEvent[],
    chainId: number,
    lastFinalisedBlock: number,
    blockTimes: Record<number, number>,
  ) {
    const formattedEvents = events.map((event) => {
      const blockTimestamp = blockTimes[event.blockNumber]
        ? new Date(blockTimes[event.blockNumber]! * 1000)
        : undefined;
      return {
        user: event.args.user,
        token: event.args.token,
        amountRequiredToActivate:
          event.args.amountRequiredToActivate.toString(),
        blockHash: event.blockHash,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        logIndex: event.logIndex,
        chainId: chainId,
        finalised: event.blockNumber <= lastFinalisedBlock,
        blockTimestamp,
      };
    });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.UserAccountActivated>(
          entities.UserAccountActivated,
          eventsChunk,
          ["blockNumber", "chainId", "logIndex"],
          [],
        ),
      ),
    );
    return savedEvents.flat();
  }

  public async deleteUnfinalisedUserAccountActivatedEvents(
    chainId: number,
    lastFinalisedBlock: number,
  ) {
    const chainIdColumn = "chainId";
    return await this.deleteUnfinalisedEvents(
      chainId,
      chainIdColumn,
      lastFinalisedBlock,
      entities.UserAccountActivated,
    );
  }
}
