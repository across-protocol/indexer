import winston from "winston";
import * as across from "@across-protocol/sdk";

import { DataSource, entities, utils as dbUtils } from "@repo/indexer-database";

import { SimpleTransferFlowCompletedWithBlock } from "../data-indexing/adapter/hyper-evm/model";

export class SimpleTransferFlowCompletedRepository extends dbUtils.BlockchainEventRepository {
  constructor(
    postgres: DataSource,
    logger: winston.Logger,
    private chunkSize = 100,
  ) {
    super(postgres, logger);
  }

  public async deleteUnfinalisedSimpleTransferFlowCompletedEvents(
    chainId: number,
    lastFinalisedBlock: number,
  ) {
    const chainIdColumn = "chainId";
    const [simpleTransferFlowCompletedEvents] = await Promise.all([
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.SimpleTransferFlowCompleted,
      ),
    ]);

    return {
      simpleTransferFlowCompletedEvents,
    };
  }

  public async formatAndSaveSimpleTransferFlowCompletedEvents(
    simpleTransferFlowCompletedEvents: SimpleTransferFlowCompletedWithBlock[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
  ) {
    const formattedEvents: Partial<entities.SimpleTransferFlowCompleted>[] =
      simpleTransferFlowCompletedEvents.map((event) => {
        return {
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
          transactionHash: event.transactionHash,
          transactionIndex: event.transactionIndex,

          blockTimestamp: blockDates[event.blockNumber]!,
          chainId: chainId.toString(),

          quoteNonce: event.quoteNonce,
          finalRecipient: event.finalRecipient,
          finalToken: event.finalToken,
          evmAmountIn: event.evmAmountIn,
          bridgingFeesIncurred: event.bridgingFeesIncurred,
          evmAmountSponsored: event.evmAmountSponsored,
          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      });

    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.SimpleTransferFlowCompleted>(
          entities.SimpleTransferFlowCompleted,
          eventsChunk,
          ["chainId", "blockNumber", "transactionHash", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }
}
