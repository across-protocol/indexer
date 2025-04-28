import winston from "winston";
import * as across from "@across-protocol/sdk";
import {
  DataSource,
  entities,
  utils as dbUtils,
  EntityManager,
} from "@repo/indexer-database";
import { SwapBeforeBridgeEvent } from "../web3/model/events";

export class SwapBeforeBridgeRepository extends dbUtils.BlockchainEventRepository {
  constructor(
    postgres: DataSource,
    logger: winston.Logger,
    private chunkSize = 100,
  ) {
    super(postgres, logger);
  }

  public async formatAndSaveSwapBeforeBridgeEvents(
    swapBeforeBridgeEvents: SwapBeforeBridgeEvent[],
    chainId: number,
    lastFinalisedBlock: number,
    transactionalEntityManager?: EntityManager,
  ) {
    const formattedEvents = swapBeforeBridgeEvents.map((event) => {
      const entity = new entities.SwapBeforeBridge();
      entity.swapToken = event.args.swapToken;
      entity.acrossInputToken = event.args.acrossInputToken;
      entity.acrossOutputToken = event.args.acrossOutputToken;
      entity.swapTokenAmount = event.args.swapTokenAmount.toString();
      entity.acrossInputAmount = event.args.acrossInputAmount.toString();
      entity.acrossOutputAmount = event.args.acrossOutputAmount.toString();
      entity.exchange = event.args.exchange;
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
        this.saveAndHandleFinalisationBatch<entities.SwapBeforeBridge>(
          entities.SwapBeforeBridge,
          eventsChunk,
          ["blockNumber", "chainId", "logIndex"],
          [],
          transactionalEntityManager,
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  public async deleteUnfinalisedSwapEvents(
    chainId: number,
    lastFinalisedBlock: number,
    transactionalEntityManager?: EntityManager,
  ) {
    const chainIdColumn = "chainId";
    const deletedSwapEvents = await this.deleteUnfinalisedEvents(
      chainId,
      chainIdColumn,
      lastFinalisedBlock,
      entities.SwapBeforeBridge,
      transactionalEntityManager,
    );
    return deletedSwapEvents;
  }
}
