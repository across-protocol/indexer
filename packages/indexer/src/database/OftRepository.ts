import winston from "winston";
import { ethers } from "ethers";
import * as across from "@across-protocol/sdk";

import { DataSource, entities, utils as dbUtils } from "@repo/indexer-database";

import {
  OFTReceivedEvent,
  OFTSentEvent,
  SponsoredOFTSendLog,
} from "../data-indexing/adapter/oft/model";
import { formatFromAddressToChainFormat } from "../utils";

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
    contractAddress?: string,
  ) {
    const chainIdColumn = "chainId";
    const [
      oftSentEvents,
      oftReceivedEvents,
      simpleTransferFlowCompletedEvents,
      fallbackHyperEVMFlowCompletedEvents,
      arbitraryActionsExecutedEvents,
      sponsoredAccountActivationEvents,
      swapFlowInitializedEvents,
    ] = await Promise.all([
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
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.SimpleTransferFlowCompleted,
        contractAddress,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.FallbackHyperEVMFlowCompleted,
        contractAddress,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.ArbitraryActionsExecuted,
        contractAddress,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.SponsoredAccountActivation,
        contractAddress,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.SwapFlowInitialized,
        contractAddress,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.SwapFlowFinalized,
        contractAddress,
      ),
    ]);

    return {
      oftSentEvents,
      oftReceivedEvents,
      simpleTransferFlowCompletedEvents,
      fallbackHyperEVMFlowCompletedEvents,
      arbitraryActionsExecutedEvents,
      sponsoredAccountActivationEvents,
      swapFlowInitializedEvents,
    };
  }

  public async formatAndSaveOftSentEvents(
    oftSentEvents: OFTSentEvent[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
    tokenAddress: string,
  ) {
    const formattedEvents: Partial<entities.OFTSent>[] = oftSentEvents.map(
      (event) => {
        return {
          ...this.formatTransactionData(event),

          blockTimestamp: blockDates[event.blockNumber]!,
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

  public async deleteUnfinalisedSponsoredOFTSendEvents(
    chainId: number,
    lastFinalisedBlock: number,
  ) {
    const chainIdColumn = "chainId";
    const [sponsoredOFTSendEvents] = await Promise.all([
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.SponsoredOFTSend,
      ),
    ]);

    return {
      sponsoredOFTSendEvents,
    };
  }

  public async formatAndSaveSponsoredOFTSendEvents(
    sponsoredOFTSendEvents: SponsoredOFTSendLog[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<number, Date>,
  ) {
    const formattedEvents: Partial<entities.SponsoredOFTSend>[] =
      sponsoredOFTSendEvents.map((event) => {
        const finalRecipientAddressType = across.utils.toAddressType(
          event.args.finalRecipient,
          chainId,
        );
        const finalRecipient = formatFromAddressToChainFormat(
          finalRecipientAddressType,
          chainId,
        );
        const finalTokenAddressType = across.utils.toAddressType(
          event.args.finalToken,
          chainId,
        );
        const finalToken = formatFromAddressToChainFormat(
          finalTokenAddressType,
          chainId,
        );

        return {
          ...this.formatTransactionData(event),
          blockTimestamp: blockDates[event.blockNumber]!,
          chainId: chainId.toString(),
          quoteNonce: event.args.quoteNonce,
          originSender: event.args.originSender,
          finalRecipient: finalRecipient,
          destinationHandler: event.args.destinationHandler,
          quoteDeadline: new Date(event.args.quoteDeadline.toNumber() * 1000),
          maxBpsToSponsor: event.args.maxBpsToSponsor.toString(),
          maxUserSlippageBps: event.args.maxUserSlippageBps.toString(),
          finalToken: finalToken,
          sig: event.args.sig,
          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      });

    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.SponsoredOFTSend>(
          entities.SponsoredOFTSend,
          eventsChunk,
          ["chainId", "blockNumber", "transactionHash", "logIndex"],
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
    blockDates: Record<number, Date>,
    tokenAddress: string,
  ) {
    const formattedEvents: Partial<entities.OFTReceived>[] =
      oftReceivedEvents.map((event) => {
        return {
          ...this.formatTransactionData(event),
          blockTimestamp: blockDates[event.blockNumber]!,
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
