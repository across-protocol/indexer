import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import {
  MessageTransmitterV2Client,
  TokenMessengerMinterV2Idl,
} from "@across-protocol/contracts";
import { address, signature } from "@solana/kit";

import { BlockRange } from "../model";
import { IndexerDataHandler } from "./IndexerDataHandler";
import { SvmProvider } from "../../web3/RetryProvidersFactory";
import { CCTPRepository, BurnEventsPair } from "../../database/CctpRepository";
import {
  getIndexingStartBlockNumber,
  decodeMessage,
} from "../adapter/cctp-v2/service";
import {
  SolanaDepositForBurnEvent,
  DepositForBurnWithBlock,
  MessageSentWithBlock,
} from "../adapter/cctp-v2/model";

export type FetchEventsResult = {
  burnEvents: BurnEventsPair[];
  slotTimes: Record<number, number>;
};

export type StoreEventsResult = {};

// Solana CCTP V2 program addresses
const MESSAGE_TRANSMITTER_V2_ADDRESS =
  "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC";
const TOKEN_MESSENGER_MINTER_V2_ADDRESS =
  "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe";

const SWAP_API_CALLDATA_MARKER = "0x73c0de";

export class SvmCCTPIndexerDataHandler implements IndexerDataHandler {
  private isInitialized: boolean;
  private tokenMessengerClient: across.arch.svm.SvmCpiEventsClient | undefined;

  constructor(
    private logger: Logger,
    private chainId: number,
    private provider: SvmProvider,
    private cctpRepository: CCTPRepository,
  ) {
    this.isInitialized = false;
  }

  private async initialize() {
    try {
      // Initialize client for TokenMessengerMinter
      this.tokenMessengerClient =
        await across.arch.svm.SvmCpiEventsClient.createFor(
          this.provider,
          TOKEN_MESSENGER_MINTER_V2_ADDRESS,
          TokenMessengerMinterV2Idl,
        );
    } catch (error) {
      this.logger.error({
        at: "SvmCCTPIndexerDataHandler#initialize",
        message: "Failed to initialize TokenMessengerMinter client",
        error,
      });
      throw error;
    }
  }

  public getDataIdentifier() {
    return `cctp:v2:${this.chainId}`;
  }

  public getStartIndexingBlockNumber() {
    return getIndexingStartBlockNumber(this.chainId);
  }

  public async processBlockRange(
    blockRange: BlockRange,
    lastFinalisedBlock: number,
    isBackfilling: boolean = false,
  ) {
    this.logger.debug({
      at: "Indexer#SvmCCTPIndexerDataHandler#processBlockRange",
      message: `Processing block range ${this.getDataIdentifier()}`,
      blockRange,
      lastFinalisedBlock,
      isBackfilling,
    });

    if (!this.isInitialized) {
      await this.initialize();
      this.isInitialized = true;
    }

    const startPerfTime = performance.now();

    const events = await this.fetchEventsByRange(blockRange);
    await this.storeEvents(events, lastFinalisedBlock);
    const timeToStoreEvents = performance.now();

    await this.cctpRepository.deleteUnfinalisedCCTPEvents(
      this.chainId,
      lastFinalisedBlock,
    );
    const timeToDeleteEvents = performance.now();
    const finalPerfTime = performance.now();

    this.logger.debug({
      at: "Indexer#SvmCCTPIndexerDataHandler#processBlockRange",
      message:
        "System Time Log for SvmCCTPIndexerDataHandler#processBlockRange",
      chainId: this.chainId,
      blockRange: blockRange,
      finalTime: finalPerfTime - startPerfTime,
      timeToStoreEvents: timeToStoreEvents - startPerfTime,
      timeToDeleteEvents: timeToDeleteEvents - timeToStoreEvents,
    });
  }

  /**
   * Checks if a Solana transaction contains the Swap API marker in its logs
   */
  private async isSwapApiTransaction(sig: string): Promise<boolean> {
    try {
      const txn = await this.provider
        .getTransaction(signature(sig), {
          maxSupportedTransactionVersion: 0,
        })
        .send();

      const txnLogs = txn?.meta?.logMessages;
      if (!txnLogs) {
        this.logger.debug({
          at: "SvmCCTPIndexerDataHandler#isSwapApiTransaction",
          message: "No logs found in transaction",
          signature: sig,
        });
        return false;
      }

      const hasMarker = txnLogs.some((log) =>
        log.includes(SWAP_API_CALLDATA_MARKER),
      );
      return hasMarker;
    } catch (error) {
      this.logger.error({
        at: "SvmCCTPIndexerDataHandler#isSwapApiTransaction",
        message: "Failed to fetch transaction for Swap API filtering",
        signature: sig,
        error,
      });
      throw error;
    }
  }

  /**
   * Filters DepositForBurn events to only include those from Swap API
   */
  private async filterTransactionsFromSwapApi(
    depositForBurnEvents: SolanaDepositForBurnEvent[],
  ): Promise<SolanaDepositForBurnEvent[]> {
    // Get unique signatures to minimize RPC calls
    const uniqueSignatures = [
      ...new Set(depositForBurnEvents.map((e) => e.signature)),
    ];

    const swapApiSignatures = new Set<string>();
    let checkedCount = 0;
    await across.utils.forEachAsync(uniqueSignatures, async (sig) => {
      checkedCount++;
      const isSwapApi = await this.isSwapApiTransaction(sig);

      if (isSwapApi) {
        swapApiSignatures.add(sig);
      }
    });

    const filtered = depositForBurnEvents.filter((event) =>
      swapApiSignatures.has(event.signature),
    );

    return filtered;
  }

  private convertSolanaDepositForBurnToChainAgnostic(
    event: SolanaDepositForBurnEvent,
  ): DepositForBurnWithBlock {
    return {
      blockNumber: Number(event.slot),
      transactionHash: event.signature,
      transactionIndex: 0,
      logIndex: 0,
      burnToken: event.data.burnToken,
      amount: event.data.amount,
      depositor: event.data.depositor,
      mintRecipient: event.data.mintRecipient,
      destinationDomain: event.data.destinationDomain,
      destinationTokenMessenger: event.data.destinationTokenMessenger,
      destinationCaller: event.data.destinationCaller,
      maxFee: event.data.maxFee,
      minFinalityThreshold: event.data.minFinalityThreshold,
      hookData: event.data.hookData,
    };
  }

  private async fetchEventsByRange(
    blockRange: BlockRange,
  ): Promise<FetchEventsResult> {
    this.logger.debug({
      at: "SvmCCTPIndexerDataHandler#fetchEventsByRange",
      message: "Fetching CCTP burn events for Solana",
      blockRange,
      fromSlot: blockRange.from,
      toSlot: blockRange.to,
    });

    if (!this.tokenMessengerClient) {
      throw new Error("TokenMessengerMinter client not initialized");
    }

    const depositForBurnEvents = (await this.tokenMessengerClient.queryEvents(
      "DepositForBurn" as any,
      BigInt(blockRange.from),
      BigInt(blockRange.to),
    )) as across.arch.svm.EventWithData[];

    // Filter for Swap API transactions (check transaction logs for marker)
    const filteredDepositForBurnEvents =
      await this.filterTransactionsFromSwapApi(
        depositForBurnEvents as SolanaDepositForBurnEvent[],
      );

    // Look for MessageSent account in the transaction
    const burnEvents =
      await this.matchDepositForBurnWithMessageSentFromTransactions(
        filteredDepositForBurnEvents,
      );

    // Build slotTimes from the events (no need for separate RPC call!)
    const slotTimes = depositForBurnEvents.reduce(
      (acc, event) => {
        if (event.blockTime !== null) {
          acc[Number(event.slot)] = Number(event.blockTime);
        }
        return acc;
      },
      {} as Record<number, number>,
    );

    this.runChecks(burnEvents);

    if (burnEvents.length > 0) {
      this.logger.info({
        at: "SvmCCTPIndexerDataHandler#fetchEventsByRange",
        message: `Found ${burnEvents.length} burn events from Solana on chain ${this.chainId}`,
      });
    }

    return {
      burnEvents,
      slotTimes,
    };
  }

  private runChecks(burnEvents: BurnEventsPair[]) {
    for (const burnEventsPair of burnEvents) {
      if (!burnEventsPair.depositForBurn || !burnEventsPair.messageSent) {
        this.logger.error({
          at: "SvmCCTPIndexerDataHandler#runChecks",
          message: `Found incomplete pair of burn events for signature`,
          notificationPath: "across-indexer-error",
          signature:
            burnEventsPair.depositForBurn?.transactionHash ||
            burnEventsPair.messageSent?.transactionHash,
          burnEventsPair,
        });
      }
    }
  }

  /**
   * Fetches MessageSent data and pairs with DepositForBurn events
   * In Solana, MessageSent data is stored in an account.
   */
  private async matchDepositForBurnWithMessageSentFromTransactions(
    depositForBurnEvents: SolanaDepositForBurnEvent[],
  ): Promise<BurnEventsPair[]> {
    const burnEventsPairs: BurnEventsPair[] = [];

    await across.utils.forEachAsync(depositForBurnEvents, async (deposit) => {
      try {
        const txn = await this.provider
          .getTransaction(signature(deposit.signature), {
            maxSupportedTransactionVersion: 0,
          })
          .send();

        // Extract the MessageSent account address from the transaction
        // The MessageSent account is the second signer (index 1) in the transaction
        // First signer (index 0) is the payer, second signer is the message_sent_event_data account
        const messageSentAccountAddress =
          txn?.transaction?.message?.accountKeys?.[1];

        if (!messageSentAccountAddress) {
          this.logger.warn({
            at: "SvmCCTPIndexerDataHandler#matchDepositForBurnWithMessageSentFromTransactions",
            message:
              "Could not find MessageSent account address in transaction",
            signature: deposit.signature,
          });
          throw new Error("MessageSent account not found in transaction");
        }

        // Fetch and decode the MessageSent account using the V2 client
        const messageSentAccount =
          await MessageTransmitterV2Client.fetchMessageSent(
            this.provider,
            address(messageSentAccountAddress.toString()),
          );
        if (!messageSentAccount?.data?.message) {
          this.logger.error({
            at: "SvmCCTPIndexerDataHandler#matchDepositForBurnWithMessageSentFromTransactions",
            message: "Could not fetch or decode MessageSent account data",
            signature: deposit.signature,
            messageSentAccountAddress: messageSentAccountAddress.toString(),
          });
          throw new Error("MessageSent account data not found");
        }

        // Extract the message bytes from the decoded account
        const messageBytes = Buffer.from(messageSentAccount.data.message);
        const messageHex = "0x" + messageBytes.toString("hex");

        // Decode the CCTP V2 message
        const decodedMessage = decodeMessage(new Uint8Array(messageBytes));
        // Create the MessageSent event with all decoded fields
        const messageSent: MessageSentWithBlock = {
          blockNumber: Number(deposit.slot),
          transactionHash: deposit.signature,
          transactionIndex: 0,
          logIndex: 0,
          message: messageHex,
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
        };

        burnEventsPairs.push({
          depositForBurn:
            this.convertSolanaDepositForBurnToChainAgnostic(deposit),
          messageSent,
        });
      } catch (error) {
        this.logger.error({
          at: "SvmCCTPIndexerDataHandler#matchDepositForBurnWithMessageSentFromTransactions",
          message: "Failed to fetch transaction for MessageSent extraction",
          signature: deposit.signature,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return burnEventsPairs;
  }

  private async storeEvents(
    events: FetchEventsResult,
    lastFinalisedBlock: number,
  ): Promise<StoreEventsResult> {
    const { burnEvents, slotTimes } = events;

    const blockDates: Record<number, Date> = {};
    for (const event of burnEvents) {
      const slot = event.depositForBurn.blockNumber;
      const timestamp = slotTimes[slot];
      if (timestamp) {
        // Key by slot number (blockNumber)
        blockDates[slot] = new Date(timestamp * 1000);
      }
    }

    const savedBurnEvents = await this.cctpRepository.formatAndSaveBurnEvents(
      burnEvents,
      lastFinalisedBlock,
      this.chainId,
      blockDates,
    );

    return {
      savedBurnEvents,
    };
  }
}
