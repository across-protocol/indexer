import winston from "winston";
import { ethers } from "ethers";
import * as across from "@across-protocol/sdk";

import { DataSource, entities, utils as dbUtils } from "@repo/indexer-database";

import {
  OFTReceivedEvent,
  OFTSentEvent,
} from "../data-indexing/adapter/oft/model";

export class OftRepository extends dbUtils.BlockchainEventRepository {
  constructor(
    postgres: DataSource,
    logger: winston.Logger,
    private chunkSize = 100,
  ) {
    super(postgres, logger);
  }

  public async deleteUnfinalisedOFTEvents(
    chainId: number,
    lastFinalisedBlock: number,
  ) {
    const chainIdColumn = "chainId";
    const [oftSentEvents, oftReceivedEvents] = await Promise.all([
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.OFTSent,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.OFTReceived,
      ),
    ]);

    return {
      oftSentEvents,
      oftReceivedEvents,
    };
  }

  public async formatAndSaveOftEvents(
    oftSentEvents: OFTSentEvent[],
    oftReceivedEvents: OFTReceivedEvent[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<string, Date>,
    tokenAddress: string,
  ) {
    const [savedOftSentEvents, savedOftReceivedEvents] = await Promise.all([
      this.formatAndSaveOftSentEvents(
        oftSentEvents,
        lastFinalisedBlock,
        chainId,
        blockDates,
        tokenAddress,
      ),
      this.formatAndSaveOftReceivedEvents(
        oftReceivedEvents,
        lastFinalisedBlock,
        chainId,
        blockDates,
        tokenAddress,
      ),
    ]);
    return {
      savedOftSentEvents,
      savedOftReceivedEvents,
    };
  }

  public async formatAndSaveOftSentEvents(
    oftSentEvents: OFTSentEvent[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<string, Date>,
    tokenAddress: string,
  ) {
    const formattedEvents: Partial<entities.OFTSent>[] = oftSentEvents.map(
      (event) => {
        return {
          ...this.formatTransactionData(event),

          blockTimestamp: blockDates[event.blockHash]!,
          chainId: chainId.toString(),

          guid: event.args.guid,
          dstEid: event.args.dstEid,
          fromAddress: event.args.fromAddress,
          amountSentLD: event.args.amountSentLD.toString(),
          amountReceivedLD: event.args.amountReceivedLD.toString(),
          token: tokenAddress,

          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      },
    );
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.OFTSent>(
          entities.OFTSent,
          eventsChunk,
          ["chainId", "blockHash", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  public async formatAndSaveOftReceivedEvents(
    oftReceivedEvents: OFTReceivedEvent[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<string, Date>,
    tokenAddress: string,
  ) {
    const formattedEvents: Partial<entities.OFTReceived>[] =
      oftReceivedEvents.map((event) => {
        return {
          ...this.formatTransactionData(event),
          blockTimestamp: blockDates[event.blockHash]!,
          chainId: chainId.toString(),
          guid: event.args.guid,
          srcEid: event.args.srcEid,
          toAddress: event.args.toAddress,
          amountReceivedLD: event.args.amountReceivedLD.toString(),
          token: tokenAddress,
          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.OFTReceived>(
          entities.OFTReceived,
          eventsChunk,
          ["blockHash", "chainId", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  private formatTransactionData(event: ethers.providers.Log | ethers.Event) {
    const {
      blockHash,
      blockNumber,
      logIndex,
      transactionHash,
      transactionIndex,
    } = event;
    return {
      blockHash,
      blockNumber,
      logIndex,
      transactionHash,
      transactionIndex,
    };
  }
}
