import * as across from "@across-protocol/sdk";
import winston from "winston";

import { DataSource, entities, utils as dbUtils } from "@repo/indexer-database";

import { CallsFailedEvent } from "../web3/model/events";

export class CallsFailedRepository extends dbUtils.BlockchainEventRepository {
  constructor(
    postgres: DataSource,
    logger: winston.Logger,
    private chunkSize = 100,
  ) {
    super(postgres, logger);
  }

  public async formatAndSaveCallsFailedEvents(
    callsFailedEvents: CallsFailedEvent[],
    chainId: number,
    lastFinalisedBlock: number,
  ) {
    const formattedEvents = callsFailedEvents.map((event) => {
      const entity = new entities.CallsFailed();
      entity.calls = event.args.calls.map((call) => ({
        target: call[0],
        calldata: call[1],
        value: call[2].toString(),
      }));
      entity.fallbackRecipient = event.args.fallbackRecipient;
      entity.blockHash = event.blockHash;
      entity.blockNumber = event.blockNumber;
      entity.transactionHash = event.transactionHash;
      entity.logIndex = event.logIndex;
      entity.chainId = chainId;
      entity.finalised = event.blockNumber <= lastFinalisedBlock;
      return entity;
    });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.CallsFailed>(
          entities.CallsFailed,
          eventsChunk,
          ["blockNumber", "chainId", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  public async deleteUnfinalisedCallsFailedEvents(
    chainId: number,
    lastFinalisedBlock: number,
  ) {
    const chainIdColumn = "chainId";
    const deletedCallsFailedEvents = await this.deleteUnfinalisedEvents(
      chainId,
      chainIdColumn,
      lastFinalisedBlock,
      entities.CallsFailed,
    );
    return deletedCallsFailedEvents;
  }
}
