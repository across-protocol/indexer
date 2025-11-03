import winston from "winston";
import * as across from "@across-protocol/sdk";
import { DataSource, entities, utils as dbUtils } from "@repo/indexer-database";
import { SwapFlowFinalizedWithBlock } from "../data-indexing/adapter/hyper-evm/model";

export class SwapFlowFinalizedRepository extends dbUtils.BlockchainEventRepository {
  constructor(
    postgres: DataSource,
    logger: winston.Logger,
    private chunkSize = 100,
  ) {
    super(postgres, logger);
  }

  public async deleteUnfinalisedSwapFlowFinalizedEvents(
    chainId: number,
    lastFinalisedBlock: number,
  ) {
    const chainIdColumn = "chainId";
    const [swapFlowFinalizedEvents] = await Promise.all([
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.SwapFlowFinalized,
      ),
    ]);

    return {
      swapFlowFinalizedEvents,
    };
  }

  public async formatAndSaveSwapFlowFinalizedEvents(
    swapFlowFinalizedEvents: SwapFlowFinalizedWithBlock[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
  ) {
    const formattedEvents: Partial<entities.SwapFlowFinalized>[] =
      swapFlowFinalizedEvents.map((event) => {
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
          totalSent: BigInt(event.totalSent), // Convert to BigInt
          evmAmountSponsored: BigInt(event.evmAmountSponsored), // Convert to BigInt
          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      });

    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.SwapFlowFinalized>(
          entities.SwapFlowFinalized,
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
