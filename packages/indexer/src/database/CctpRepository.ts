import winston from "winston";
import { ethers } from "ethers";
import * as across from "@across-protocol/sdk";

import {
  DataSource,
  entities,
  utils as dbUtils,
  SaveQueryResult,
} from "@repo/indexer-database";

import {
  DepositForBurnEvent,
  MessageReceivedEvent,
  MessageSentLog,
  MintAndWithdrawLog,
} from "../data-indexing/adapter/cctp-v2/model";
import {
  decodeMessage,
  getCctpDestinationChainFromDomain,
} from "../data-indexing/adapter/cctp-v2/service";
import {
  BurnEventsPair,
  MintEventsPair,
} from "../data-indexing/service/CCTPIndexerDataHandler";

export class CCTPRepository extends dbUtils.BlockchainEventRepository {
  constructor(
    postgres: DataSource,
    logger: winston.Logger,
    private chunkSize = 100,
  ) {
    super(postgres, logger);
  }

  public async formatAndSaveBurnEvents(
    burnEvents: BurnEventsPair[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<string, Date>,
  ) {
    const savedEvents: {
      depositForBurnEvent: SaveQueryResult<entities.DepositForBurn>;
      messageSentEvent: SaveQueryResult<entities.MessageSent>;
    }[] = [];
    const chunkedEvents = across.utils.chunk(burnEvents, this.chunkSize);
    for (const eventsChunk of chunkedEvents) {
      const savedEventsChunk = await Promise.all(
        eventsChunk.map(async (eventsPair) => {
          return this.formatAndSaveBurnEventsPair(
            eventsPair,
            lastFinalisedBlock,
            chainId,
            blockDates,
          );
        }),
      );
      savedEvents.push(...savedEventsChunk);
    }
    return savedEvents;
  }

  public async formatAndSaveMintEvents(
    mintEvents: MintEventsPair[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<string, Date>,
  ) {
    const savedEvents: {
      messageReceivedEvent: SaveQueryResult<entities.MessageReceived>;
      mintAndWithdrawEvent: SaveQueryResult<entities.MintAndWithdraw>;
    }[] = [];
    const chunkedEvents = across.utils.chunk(mintEvents, this.chunkSize);
    for (const eventsChunk of chunkedEvents) {
      const savedEventsChunk = await Promise.all(
        eventsChunk.map(async (eventsPair) => {
          return this.formatAndSaveMintEventsPair(
            eventsPair,
            lastFinalisedBlock,
            chainId,
            blockDates,
          );
        }),
      );
      savedEvents.push(...savedEventsChunk);
    }
    return savedEvents;
  }

  public async formatAndSaveBurnEventsPair(
    burnEventsPair: BurnEventsPair,
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<string, Date>,
  ) {
    const { depositForBurn, messageSent } = burnEventsPair;
    const [depositForBurnEvents, messageSentEvents] = await Promise.all([
      this.formatAndSaveDepositForBurnEvents(
        [depositForBurn],
        lastFinalisedBlock,
        chainId,
        blockDates,
      ),
      this.formatAndSaveMessageSentEvents(
        [messageSent],
        lastFinalisedBlock,
        chainId,
        blockDates,
      ),
    ]);
    return {
      depositForBurnEvent:
        depositForBurnEvents[0] as SaveQueryResult<entities.DepositForBurn>,
      messageSentEvent:
        messageSentEvents[0] as SaveQueryResult<entities.MessageSent>,
    };
  }

  public async formatAndSaveMintEventsPair(
    mintEventsPair: MintEventsPair,
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<string, Date>,
  ) {
    const { messageReceived, mintAndWithdraw } = mintEventsPair;
    const [messageReceivedEvents, mintAndWithdrawEvents] = await Promise.all([
      this.formatAndSaveMessageReceivedEvents(
        [messageReceived],
        lastFinalisedBlock,
        chainId,
        blockDates,
      ),
      this.formatAndSaveMintAndWithdrawEvents(
        [mintAndWithdraw],
        lastFinalisedBlock,
        chainId,
        blockDates,
      ),
    ]);
    return {
      messageReceivedEvent:
        messageReceivedEvents[0] as SaveQueryResult<entities.MessageReceived>,
      mintAndWithdrawEvent:
        mintAndWithdrawEvents[0] as SaveQueryResult<entities.MintAndWithdraw>,
    };
  }

  public async formatAndSaveDepositForBurnEvents(
    depositForBurnEvents: DepositForBurnEvent[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<string, Date>,
  ) {
    const formattedEvents: Partial<entities.DepositForBurn>[] =
      depositForBurnEvents.map((event) => {
        const destinationChainId = getCctpDestinationChainFromDomain(
          event.args.destinationDomain,
        );
        const mintRecipientAddressType = across.utils.toAddressType(
          event.args.mintRecipient,
          destinationChainId,
        );
        const mintRecipient = across.utils.chainIsSvm(destinationChainId)
          ? mintRecipientAddressType.toBase58()
          : mintRecipientAddressType.toEvmAddress();
        const tokenMessengerAddressType = across.utils.toAddressType(
          event.args.destinationTokenMessenger,
          destinationChainId,
        );
        const tokenMessenger = across.utils.chainIsSvm(destinationChainId)
          ? tokenMessengerAddressType.toBase58()
          : tokenMessengerAddressType.toEvmAddress();
        const destinationCallerAddressType = across.utils.toAddressType(
          event.args.destinationCaller,
          destinationChainId,
        );
        const destinationCaller = across.utils.chainIsSvm(destinationChainId)
          ? destinationCallerAddressType.toBase58()
          : destinationCallerAddressType.toEvmAddress();
        return {
          ...this.formatTransactionData(event),

          blockTimestamp: blockDates[event.blockHash]!,
          chainId,

          amount: event.args.amount.toString(),
          burnToken: event.args.burnToken,
          depositor: event.args.depositor,
          destinationCaller,
          destinationDomain: event.args.destinationDomain,
          destinationTokenMessenger: tokenMessenger,
          hookData: event.args.hookData,
          maxFee: event.args.maxFee.toString(),
          minFinalityThreshold: event.args.minFinalityThreshold,
          mintRecipient,

          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.DepositForBurn>(
          entities.DepositForBurn,
          eventsChunk,
          ["chainId", "blockHash", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  public async formatAndSaveMessageSentEvents(
    messageSentEvents: MessageSentLog[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<string, Date>,
  ) {
    const formattedEvents: Partial<entities.MessageSent>[] =
      messageSentEvents.map((event) => {
        const decodedMessage = decodeMessage(event.args.message);
        return {
          ...this.formatTransactionData(event),
          blockTimestamp: blockDates[event.blockHash]!,
          chainId,
          message: event.args.message,
          version: decodedMessage.version,
          sourceDomain: decodedMessage.sourceDomain,
          destinationDomain: decodedMessage.destinationDomain,
          nonce: decodedMessage.nonce,
          sender: decodedMessage.sender,
          recipient: decodedMessage.recipient,
          destinationCaller: decodedMessage.destinationCaller,
          minFinalityThreshold: decodedMessage.minFinalityThreshold,
          finalityThresholdExecuted: decodedMessage.finalityThresholdExecuted,
          messageBody: decodedMessage.messageBody,
          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.MessageSent>(
          entities.MessageSent,
          eventsChunk,
          ["blockHash", "chainId", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  public async formatAndSaveMessageReceivedEvents(
    messageReceivedEvents: MessageReceivedEvent[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<string, Date>,
  ) {
    const formattedEvents: Partial<entities.MessageReceived>[] =
      messageReceivedEvents.map((event) => {
        const sourceChainId = getCctpDestinationChainFromDomain(
          event.args.sourceDomain,
        );
        const senderAddressType = across.utils.toAddressType(
          event.args.sender,
          sourceChainId,
        );
        const sender = across.utils.chainIsSvm(sourceChainId)
          ? senderAddressType.toBase58()
          : senderAddressType.toEvmAddress();
        return {
          ...this.formatTransactionData(event),
          blockTimestamp: blockDates[event.blockHash]!,
          chainId,
          caller: event.args.caller,
          sourceDomain: event.args.sourceDomain,
          nonce: event.args.nonce,
          sender,
          finalityThresholdExecuted: event.args.finalityThresholdExecuted,
          messageBody: event.args.messageBody,
          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.MessageReceived>(
          entities.MessageReceived,
          eventsChunk,
          ["chainId", "blockHash", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  public async formatAndSaveMintAndWithdrawEvents(
    mintAndWithdrawEvents: MintAndWithdrawLog[],
    lastFinalisedBlock: number,
    chainId: number,
    blockDates: Record<string, Date>,
  ) {
    const formattedEvents: Partial<entities.MintAndWithdraw>[] =
      mintAndWithdrawEvents.map((event) => {
        return {
          ...this.formatTransactionData(event),
          blockTimestamp: blockDates[event.blockHash]!,
          chainId,
          mintRecipient: event.args.mintRecipient,
          amount: event.args.amount.toString(),
          mintToken: event.args.mintToken,
          feeCollected: event.args.feeCollected.toString(),
          finalised: event.blockNumber <= lastFinalisedBlock,
        };
      });
    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.MintAndWithdraw>(
          entities.MintAndWithdraw,
          eventsChunk,
          ["chainId", "blockHash", "logIndex"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();
    return result;
  }

  private formatTransactionData(event: ethers.providers.Log | ethers.Event) {
    return {
      blockHash: event.blockHash,
      blockNumber: event.blockNumber,
      logIndex: event.logIndex,
      transactionHash: event.transactionHash,
      transactionIndex: event.transactionIndex,
    };
  }
}
