import winston from "winston";
import * as across from "@across-protocol/sdk";
import { DataSource, entities, utils as dbUtils } from "@repo/indexer-database";
import { SwapFlowInitializedWithBlock } from "../data-indexing/adapter/hyper-evm/model";

export class SwapFlowInitializedRepository extends dbUtils.BlockchainEventRepository {
  constructor(
    postgres: DataSource,
    logger: winston.Logger,
    private chunkSize = 100,
  ) {
    super(postgres, logger);
  }

  public async deleteUnfinalisedSwapFlowInitializedEvents(
    chainId: number,
    lastFinalisedBlock: number,
  ) {
    const chainIdColumn = "chainId";
    const [swapFlowInitializedEvents] = await Promise.all([
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.SwapFlowInitialized,
      ),
    ]);

    return {
      swapFlowInitializedEvents,
    };
  }

  public async formatAndSaveSwapFlowInitializedEvents(
    swapFlowInitializedEvents: SwapFlowInitializedWithBlock[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
  ) {
    const formattedEvents: Partial<entities.SwapFlowInitialized>[] =
      swapFlowInitializedEvents.map((event) => {
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
          coreAmountIn: event.coreAmountIn,
          minAmountToSend: event.minAmountToSend,
          maxAmountToSend: event.maxAmountToSend,
          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      });

    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.SwapFlowInitialized>(
          entities.SwapFlowInitialized,
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
