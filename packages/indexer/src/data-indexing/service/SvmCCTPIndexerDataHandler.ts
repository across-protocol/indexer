import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import {
  MessageTransmitterV2Client,
  TokenMessengerMinterV2Idl,
  MessageTransmitterV2Idl,
} from "@across-protocol/contracts";
import { address, signature } from "@solana/kit";

import { BlockRange } from "../model";
import { IndexerDataHandler } from "./IndexerDataHandler";
import { SvmProvider } from "../../web3/RetryProvidersFactory";
import {
  CCTPRepository,
  BurnEventsPair,
  MintEventsPair,
} from "../../database/CctpRepository";
import {
  getIndexingStartBlockNumber,
  decodeMessage,
} from "../adapter/cctp-v2/service";
import {
  SolanaDepositForBurnEvent,
  SolanaMessageSentEvent,
  SolanaMessageReceivedEvent,
  SolanaMintAndWithdrawEvent,
} from "../adapter/cctp-v2/model";

export type SolanaBurnEventsPair = {
  depositForBurn: SolanaDepositForBurnEvent;
  messageSent: SolanaMessageSentEvent;
};

export type SolanaMintEventsPair = {
  messageReceived: SolanaMessageReceivedEvent;
  mintAndWithdraw: SolanaMintAndWithdrawEvent;
};

export type FetchEventsResult = {
  burnEvents: SolanaBurnEventsPair[];
  mintEvents: SolanaMintEventsPair[];
  slotTimes: Record<number, number>;
};

export type StoreEventsResult = {};

// Solana CCTP V2 program addresses
const MESSAGE_TRANSMITTER_V2_ADDRESS =
  "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC";
const TOKEN_MESSENGER_MINTER_V2_ADDRESS =
  "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe";

const SWAP_API_CALLDATA_MARKER = "73c0de";
// Solana public keys of the Across finalizers that call receiveMessage
const WHITELISTED_FINALIZERS = ["FmMK62wrtWVb5SVoTZftSCGw3nEDA79hDbZNTRnC1R6t"];

export class SvmCCTPIndexerDataHandler implements IndexerDataHandler {
  private isInitialized: boolean;
  private tokenMessengerClient: across.arch.svm.SvmCpiEventsClient | undefined;
  private messageTransmitterClient:
    | across.arch.svm.SvmCpiEventsClient
    | undefined;

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
      // Initialize client for TokenMessengerMinter (for burn events)
      this.tokenMessengerClient =
        await across.arch.svm.SvmCpiEventsClient.createFor(
          this.provider,
          TOKEN_MESSENGER_MINTER_V2_ADDRESS,
          TokenMessengerMinterV2Idl,
        );

      // Initialize client for MessageTransmitter (for mint events)
      this.messageTransmitterClient =
        await across.arch.svm.SvmCpiEventsClient.createFor(
          this.provider,
          MESSAGE_TRANSMITTER_V2_ADDRESS,
          MessageTransmitterV2Idl,
        );
    } catch (error) {
      this.logger.error({
        at: "SvmCCTPIndexerDataHandler#initialize",
        message: "Failed to initialize CCTP clients",
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

  private async fetchEventsByRange(
    blockRange: BlockRange,
  ): Promise<FetchEventsResult> {
    this.logger.debug({
      at: "SvmCCTPIndexerDataHandler#fetchEventsByRange",
      message: "Fetching CCTP events for Solana",
      blockRange,
      fromSlot: blockRange.from,
      toSlot: blockRange.to,
    });

    if (!this.tokenMessengerClient || !this.messageTransmitterClient) {
      throw new Error("CCTP clients not initialized");
    }

    // Fetch burn events (DepositForBurn from TokenMessengerMinter)
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

    // Fetch mint events (MessageReceived from MessageTransmitter)
    const receiveMessageEvents =
      (await this.messageTransmitterClient.queryEvents(
        "MessageReceived" as any,
        BigInt(blockRange.from),
        BigInt(blockRange.to),
      )) as across.arch.svm.EventWithData[];

    // Filter for Across finalizer transactions
    const filteredReceiveMessageEvents =
      await this.filterTransactionsFromAcrossFinalizer(receiveMessageEvents);

    // Extract and pair MessageReceived with MintAndWithdraw events
    const mintEvents = await this.matchMessageReceivedWithMintAndWithdraw(
      filteredReceiveMessageEvents,
      blockRange,
    );

    // Build slotTimes from all events
    const slotTimes = [...depositForBurnEvents, ...receiveMessageEvents].reduce(
      (acc, event) => {
        if (event.blockTime !== null) {
          acc[Number(event.slot)] = Number(event.blockTime);
        }
        return acc;
      },
      {} as Record<number, number>,
    );

    this.runChecks(burnEvents, mintEvents);

    if (burnEvents.length > 0) {
      this.logger.debug({
        at: "SvmCCTPIndexerDataHandler#fetchEventsByRange",
        message: `Found ${burnEvents.length} burn events from Solana on chain ${this.chainId}`,
      });
    }

    if (mintEvents.length > 0) {
      this.logger.debug({
        at: "SvmCCTPIndexerDataHandler#fetchEventsByRange",
        message: `Found ${mintEvents.length} mint events from Across Finalizer on chain ${this.chainId}`,
      });
    }

    return {
      burnEvents,
      mintEvents,
      slotTimes,
    };
  }

  private runChecks(
    burnEvents: SolanaBurnEventsPair[],
    mintEvents: SolanaMintEventsPair[],
  ) {
    for (const burnEventsPair of burnEvents) {
      if (!burnEventsPair.depositForBurn || !burnEventsPair.messageSent) {
        this.logger.error({
          at: "SvmCCTPIndexerDataHandler#runChecks",
          message: `Found incomplete pair of burn events for signature`,
          notificationPath: "across-indexer-error",
          signature:
            burnEventsPair.depositForBurn?.signature ||
            burnEventsPair.messageSent?.signature,
          burnEventsPair,
        });
      }
    }

    for (const mintEventsPair of mintEvents) {
      if (!mintEventsPair.messageReceived || !mintEventsPair.mintAndWithdraw) {
        this.logger.error({
          at: "SvmCCTPIndexerDataHandler#runChecks",
          message: `Found incomplete pair of mint events for signature`,
          notificationPath: "across-indexer-error",
          signature:
            mintEventsPair.messageReceived?.signature ||
            mintEventsPair.mintAndWithdraw?.signature,
          mintEventsPair,
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
  ): Promise<SolanaBurnEventsPair[]> {
    const burnEventsPairs: SolanaBurnEventsPair[] = [];

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
        const messageSent: SolanaMessageSentEvent = {
          slot: deposit.slot,
          signature: deposit.signature,
          blockTime: deposit.blockTime,
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
          depositForBurn: deposit,
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

  /**
   * Filters ReceiveMessage events to only include those from whitelisted Across finalizer
   */
  private async filterTransactionsFromAcrossFinalizer(
    receiveMessageEvents: across.arch.svm.EventWithData[],
  ): Promise<across.arch.svm.EventWithData[]> {
    // Get unique signatures
    const uniqueSignatures = [
      ...new Set(receiveMessageEvents.map((e) => e.signature)),
    ];

    const finalizerSignatures = new Set<string>();

    await across.utils.forEachAsync(uniqueSignatures, async (sig) => {
      try {
        const txn = await this.provider
          .getTransaction(signature(sig), {
            maxSupportedTransactionVersion: 0,
          })
          .send();

        // Check if the caller (transaction signer/fee payer) is a whitelisted finalizer
        const caller = txn?.transaction?.message?.accountKeys?.[0]?.toString();

        if (caller && WHITELISTED_FINALIZERS.includes(caller)) {
          finalizerSignatures.add(sig);
        }
      } catch (error) {
        this.logger.error({
          at: "SvmCCTPIndexerDataHandler#filterTransactionsFromAcrossFinalizer",
          message: "Failed to fetch transaction for finalizer filtering",
          signature: sig,
          error,
        });
      }
    });

    return receiveMessageEvents.filter((event) =>
      finalizerSignatures.has(event.signature),
    );
  }

  /**
   * Processes ReceiveMessage events and pairs them with MintAndWithdraw events
   */
  private async matchMessageReceivedWithMintAndWithdraw(
    receiveMessageEvents: across.arch.svm.EventWithData[],
    blockRange: BlockRange,
  ): Promise<SolanaMintEventsPair[]> {
    const mintEventsPairs: SolanaMintEventsPair[] = [];

    // Query all MintAndWithdraw events in the queried block range
    const mintAndWithdrawEventsForRange =
      (await this.tokenMessengerClient!.queryEvents(
        "MintAndWithdraw" as any,
        BigInt(blockRange.from),
        BigInt(blockRange.to),
      )) as across.arch.svm.EventWithData[];

    // Create a Set of receiveMessage signatures to filter mint events by
    const receiveMessageSignatures = new Set(
      receiveMessageEvents.map((e) => e.signature),
    );

    // Keep onl
    const mintEventsBySignature = new Map<
      string,
      across.arch.svm.EventWithData
    >();
    for (const mintEvent of mintAndWithdrawEventsForRange) {
      if (receiveMessageSignatures.has(mintEvent.signature)) {
        mintEventsBySignature.set(mintEvent.signature, mintEvent);
      }
    }

    await across.utils.forEachAsync(
      receiveMessageEvents,
      async (receiveMsg) => {
        try {
          const receiveMessageData = receiveMsg.data as any;

          // Convert nonce bytes to hex string
          const nonceBytes = Array.isArray(receiveMessageData.nonce)
            ? receiveMessageData.nonce
            : Array.from(receiveMessageData.nonce);
          const nonceHex = "0x" + Buffer.from(nonceBytes).toString("hex");

          // Convert messageBody bytes to hex string
          const messageBodyBytes = Array.isArray(receiveMessageData.messageBody)
            ? receiveMessageData.messageBody
            : Array.from(receiveMessageData.messageBody);
          const messageBodyHex =
            "0x" + Buffer.from(messageBodyBytes).toString("hex");

          // Create MessageReceived event
          const messageReceived: SolanaMessageReceivedEvent = {
            slot: receiveMsg.slot,
            signature: receiveMsg.signature,
            blockTime: receiveMsg.blockTime,
            caller: receiveMessageData.caller,
            sourceDomain: receiveMessageData.sourceDomain,
            nonce: nonceHex,
            sender: receiveMessageData.sender,
            finalityThresholdExecuted:
              receiveMessageData.finalityThresholdExecuted,
            messageBody: messageBodyHex,
          };

          // Look up MintAndWithdraw event by signature using the pre-built Map
          const matchingMintEvent = mintEventsBySignature.get(
            receiveMsg.signature,
          );

          if (!matchingMintEvent) {
            throw new Error(
              `No MintAndWithdraw event found for MessageReceived signature: ${receiveMsg.signature}`,
            );
          }

          const mintData = matchingMintEvent.data as any;
          const mintAndWithdraw: SolanaMintAndWithdrawEvent = {
            slot: receiveMsg.slot,
            signature: receiveMsg.signature,
            blockTime: receiveMsg.blockTime,
            mintRecipient: mintData.mintRecipient,
            amount: mintData.amount.toString(),
            mintToken: mintData.mintToken,
            feeCollected: mintData.feeCollected.toString(),
          };

          mintEventsPairs.push({
            messageReceived,
            mintAndWithdraw,
          });
        } catch (error) {
          this.logger.error({
            at: "SvmCCTPIndexerDataHandler#matchMessageReceivedWithMintAndWithdraw",
            message: "Failed to process ReceiveMessage event",
            signature: receiveMsg.signature,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );

    return mintEventsPairs;
  }

  private async storeEvents(
    events: FetchEventsResult,
    lastFinalisedBlock: number,
  ): Promise<StoreEventsResult> {
    const { burnEvents, mintEvents, slotTimes } = events;

    // Build blockDates from slotTimes for all events
    const blockDates: Record<number, Date> = {};
    for (const slot in slotTimes) {
      const timestamp = slotTimes[slot];
      if (timestamp) {
        blockDates[slot] = new Date(timestamp * 1000);
      }
    }

    // Convert Solana events to chain-agnostic format for storage
    const chainAgnosticBurnEvents = burnEvents.map((pair) =>
      this.convertBurnEventsPairToChainAgnostic(pair),
    );
    const chainAgnosticMintEvents = mintEvents.map((pair) =>
      this.convertMintEventsPairToChainAgnostic(pair),
    );

    const [savedBurnEvents, savedMintEvents] = await Promise.all([
      this.cctpRepository.formatAndSaveBurnEvents(
        chainAgnosticBurnEvents,
        lastFinalisedBlock,
        this.chainId,
        blockDates,
      ),
      this.cctpRepository.formatAndSaveMintEvents(
        chainAgnosticMintEvents,
        lastFinalisedBlock,
        this.chainId,
        blockDates,
      ),
    ]);

    return {
      savedBurnEvents,
      savedMintEvents,
    };
  }

  /**
   * Converts Solana burn events to chain-agnostic format expected by repository
   */
  private convertBurnEventsPairToChainAgnostic(
    pair: SolanaBurnEventsPair,
  ): BurnEventsPair {
    const { depositForBurn, messageSent } = pair;

    return {
      depositForBurn: {
        blockNumber: Number(depositForBurn.slot),
        transactionHash: depositForBurn.signature,
        transactionIndex: 0,
        logIndex: 0,
        burnToken: depositForBurn.data.burnToken,
        amount: depositForBurn.data.amount,
        depositor: depositForBurn.data.depositor,
        mintRecipient: depositForBurn.data.mintRecipient,
        destinationDomain: depositForBurn.data.destinationDomain,
        destinationTokenMessenger:
          depositForBurn.data.destinationTokenMessenger,
        destinationCaller: depositForBurn.data.destinationCaller,
        maxFee: depositForBurn.data.maxFee,
        minFinalityThreshold: depositForBurn.data.minFinalityThreshold,
        hookData: depositForBurn.data.hookData,
      },
      messageSent: {
        blockNumber: Number(messageSent.slot),
        transactionHash: messageSent.signature,
        transactionIndex: 0,
        logIndex: 0,
        message: messageSent.message,
        version: messageSent.version,
        sourceDomain: messageSent.sourceDomain,
        destinationDomain: messageSent.destinationDomain,
        nonce: messageSent.nonce,
        sender: messageSent.sender,
        recipient: messageSent.recipient,
        destinationCaller: messageSent.destinationCaller,
        minFinalityThreshold: messageSent.minFinalityThreshold,
        finalityThresholdExecuted: messageSent.finalityThresholdExecuted,
        messageBody: messageSent.messageBody,
      },
    };
  }

  /**
   * Converts Solana mint events to chain-agnostic format expected by repository
   */
  private convertMintEventsPairToChainAgnostic(
    pair: SolanaMintEventsPair,
  ): MintEventsPair {
    const { messageReceived, mintAndWithdraw } = pair;

    return {
      messageReceived: {
        blockNumber: Number(messageReceived.slot),
        transactionHash: messageReceived.signature,
        transactionIndex: 0,
        logIndex: 0,
        caller: messageReceived.caller,
        sourceDomain: messageReceived.sourceDomain,
        nonce: messageReceived.nonce,
        sender: messageReceived.sender,
        finalityThresholdExecuted: messageReceived.finalityThresholdExecuted,
        messageBody: messageReceived.messageBody,
      },
      mintAndWithdraw: {
        blockNumber: Number(mintAndWithdraw.slot),
        transactionHash: mintAndWithdraw.signature,
        transactionIndex: 0,
        logIndex: 0,
        mintRecipient: mintAndWithdraw.mintRecipient,
        amount: mintAndWithdraw.amount,
        mintToken: mintAndWithdraw.mintToken,
        feeCollected: mintAndWithdraw.feeCollected,
      },
    };
  }
}
