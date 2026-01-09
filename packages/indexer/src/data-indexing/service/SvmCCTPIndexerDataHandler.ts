import { Logger } from "winston";
import { ethers } from "ethers";
import * as across from "@across-protocol/sdk";
import {
  MessageTransmitterV2Client,
  TokenMessengerMinterV2Idl,
  MessageTransmitterV2Idl,
} from "@across-protocol/contracts";
import { SponsoredCctpSrcPeripheryIdl } from "@across-protocol/contracts-beta";
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
  getCctpDestinationChainFromDomain,
} from "../adapter/cctp-v2/service";
import { formatFromAddressToChainFormat } from "../../utils/adressUtils";
import {
  SolanaDepositForBurnEvent,
  SolanaMessageSentEvent,
  SolanaMessageReceivedEvent,
  SolanaMintAndWithdrawEvent,
  SolanaSponsoredDepositForBurnEvent,
  SponsoredDepositForBurnWithBlock,
} from "../adapter/cctp-v2/model";
import { getSponsoredCCTPSrcPeripheryAddress } from "../../utils";
import { entities, SaveQueryResult } from "@repo/indexer-database";

export type SolanaBurnEventsPair = {
  depositForBurn: SolanaDepositForBurnEvent;
  messageSent: SolanaMessageSentEvent;
};

export type SolanaMintEventsPair = {
  messageReceived: SolanaMessageReceivedEvent;
  mintAndWithdraw: SolanaMintAndWithdrawEvent;
};

// Type definition for a Solana Transaction fetched via the provider
// Infers the return type of the send() method of the getTransaction builder
type Transaction = NonNullable<
  Awaited<ReturnType<ReturnType<SvmProvider["getTransaction"]>["send"]>>
>;

export type FetchEventsResult = {
  burnEvents: SolanaBurnEventsPair[];
  sponsoredBurnEvents: SolanaSponsoredDepositForBurnEvent[];
  mintEvents: SolanaMintEventsPair[];
  slotTimes: Record<number, number>;
};

export type StoreEventsResult = {
  savedBurnEvents: {
    depositForBurnEvent: SaveQueryResult<entities.DepositForBurn>;
    messageSentEvent: SaveQueryResult<entities.MessageSent>;
  }[];
  savedMintEvents: {
    messageReceivedEvent: SaveQueryResult<entities.MessageReceived>;
    mintAndWithdrawEvent: SaveQueryResult<entities.MintAndWithdraw>;
  }[];
  savedSponsoredBurnEvents: SaveQueryResult<entities.SponsoredDepositForBurn>[];
};
// Solana CCTP V2 program addresses
const MESSAGE_TRANSMITTER_V2_ADDRESS =
  "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC";
const TOKEN_MESSENGER_MINTER_V2_ADDRESS =
  "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe";

const SWAP_API_CALLDATA_MARKER = "73c0de";
// Solana public keys of the Across finalizers that call receiveMessage
const WHITELISTED_FINALIZERS = [
  "FmMK62wrtWVb5SVoTZftSCGw3nEDA79hDbZNTRnC1R6t",
  "5v4SXbcAKKo3YbPBXU9K7zNBMgJ2RQFsvQmg2RAFZT6t",
];

export class SvmCCTPIndexerDataHandler implements IndexerDataHandler {
  private isInitialized: boolean;
  private tokenMessengerClient: across.arch.svm.SvmCpiEventsClient | undefined;
  private messageTransmitterClient:
    | across.arch.svm.SvmCpiEventsClient
    | undefined;
  private sponsoredCctpSrcPeripheryClient:
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

      // Initialize client for SponsoredCctpSrcPeriphery (for sponsored burn events)
      const peripheryAddress = getSponsoredCCTPSrcPeripheryAddress(
        this.chainId,
      );
      if (peripheryAddress) {
        this.sponsoredCctpSrcPeripheryClient =
          await across.arch.svm.SvmCpiEventsClient.createFor(
            this.provider,
            peripheryAddress,
            SponsoredCctpSrcPeripheryIdl,
          );
      }
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

    const fetchResults = await this.fetchEventsByRange(blockRange);
    const timeToFetchEvents = performance.now();

    const storedEvents = await this.storeEvents(
      fetchResults,
      lastFinalisedBlock,
    );
    const countStoredEvents = countValues(storedEvents);
    if (countStoredEvents > 0) {
      this.logger.debug({
        at: "Indexer#SvmCCTPIndexerDataHandler#processBlockRange",
        message: `Stored ${countStoredEvents} events for ${this.getDataIdentifier()}`,
        storedEvents: summaryStoredEvents(storedEvents),
      });
    }
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
      timeToFetchEvents: timeToFetchEvents - startPerfTime,
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

    if (
      !this.tokenMessengerClient ||
      !this.messageTransmitterClient ||
      !this.sponsoredCctpSrcPeripheryClient
    ) {
      throw new Error(
        `CCTP clients not initialized: TokenMessengerClient=${!!this.tokenMessengerClient}, MessageTransmitterClient=${!!this.messageTransmitterClient}, SponsoredCctpSrcPeripheryClient=${!!this.sponsoredCctpSrcPeripheryClient}`,
      );
    }

    const fromBlock = BigInt(blockRange.from);
    const toBlock = BigInt(blockRange.to);

    // Kick off all initial queries concurrently
    const depositForBurnPromise = this.tokenMessengerClient.queryEvents(
      "DepositForBurn" as any,
      fromBlock,
      toBlock,
    );

    const sponsoredBurnPromise =
      this.sponsoredCctpSrcPeripheryClient.queryEvents(
        "SponsoredDepositForBurn" as any,
        fromBlock,
        toBlock,
      );

    const receiveMessagePromise = this.messageTransmitterClient.queryEvents(
      "MessageReceived" as any,
      fromBlock,
      toBlock,
    );

    const mintAndWithdrawPromise = this.tokenMessengerClient.queryEvents(
      "MintAndWithdraw" as any,
      fromBlock,
      toBlock,
    );

    // Process Burn and Sponsored Events Pipeline
    // They are processed together because Sponsored events depend on the DepositForBurn events for address transformation
    const burnEventsPipeline = Promise.all([
      depositForBurnPromise,
      sponsoredBurnPromise,
    ]).then(async ([events, sponsoredEvents]) => {
      const depositForBurnEvents = events as across.arch.svm.EventWithData[];
      const allSponsoredBurnEvents =
        sponsoredEvents as (SolanaSponsoredDepositForBurnEvent &
          across.arch.svm.EventWithData)[];

      // Filter for Swap API transactions (check transaction logs for marker)
      const filteredDepositForBurnEvents =
        await this.filterTransactionsFromSwapApi(
          depositForBurnEvents as SolanaDepositForBurnEvent[],
        );

      // Fetch transactions for all events that need them (filtered DepositForBurn events)
      const transactions = await this.getTransactionsForSignatures(
        filteredDepositForBurnEvents.map((e) => e.signature),
      );

      // Look for MessageSent account in the transaction
      const matchedBurnEvents = await this.matchDepositForBurnWithMessageSent(
        filteredDepositForBurnEvents,
        transactions,
      );

      // Match sponsored events with depositForBurn events by transaction signature
      const matchedSponsoredBurnEvents =
        this.matchSponsoredDepositForBurnWithDepositForBurn(
          allSponsoredBurnEvents,
          filteredDepositForBurnEvents,
        );

      return {
        rawDepositForBurnEvents: depositForBurnEvents,
        matchedBurnEvents,
        matchedSponsoredBurnEvents,
      };
    });

    // Process Mint Events Pipeline
    const mintEventsPipeline = Promise.all([
      receiveMessagePromise,
      mintAndWithdrawPromise,
    ]).then(async ([receiveEvents, mintAndWithdrawEvents]) => {
      const receiveMessageEvents =
        receiveEvents as across.arch.svm.EventWithData[];
      const mintAndWithdrawEventsTyped =
        mintAndWithdrawEvents as across.arch.svm.EventWithData[];

      // Filter for Across finalizer transactions
      const filteredReceiveMessageEvents =
        await this.filterTransactionsFromAcrossFinalizer(receiveMessageEvents);

      // Extract and pair MessageReceived with MintAndWithdraw events
      const matchedMintEvents =
        await this.matchMessageReceivedWithMintAndWithdraw(
          filteredReceiveMessageEvents,
          mintAndWithdrawEventsTyped,
        );

      return {
        receiveMessageEvents,
        matchedMintEvents,
      };
    });

    // Await all pipelines
    const [
      {
        rawDepositForBurnEvents,
        matchedBurnEvents,
        matchedSponsoredBurnEvents,
      },
      { receiveMessageEvents, matchedMintEvents },
    ] = await Promise.all([burnEventsPipeline, mintEventsPipeline]);

    // Build slotTimes from all events
    const slotTimes = [
      ...rawDepositForBurnEvents,
      ...receiveMessageEvents,
      ...matchedSponsoredBurnEvents,
    ].reduce(
      (acc, event) => {
        if (event.blockTime !== null) {
          acc[Number(event.slot)] = Number(event.blockTime);
        }
        return acc;
      },
      {} as Record<number, number>,
    );

    this.runChecks(matchedBurnEvents, matchedMintEvents);

    if (matchedBurnEvents.length > 0) {
      this.logger.debug({
        at: "SvmCCTPIndexerDataHandler#fetchEventsByRange",
        message: `Found ${matchedBurnEvents.length} burn events from Solana on chain ${this.chainId}`,
      });
    }

    if (matchedMintEvents.length > 0) {
      this.logger.debug({
        at: "SvmCCTPIndexerDataHandler#fetchEventsByRange",
        message: `Found ${matchedMintEvents.length} mint events from Across Finalizer on chain ${this.chainId}`,
      });
    }

    if (matchedSponsoredBurnEvents.length > 0) {
      this.logger.debug({
        at: "SvmCCTPIndexerDataHandler#fetchEventsByRange",
        message: `Found ${matchedSponsoredBurnEvents.length} sponsored burn events on chain ${this.chainId}`,
      });
    }

    return {
      burnEvents: matchedBurnEvents,
      sponsoredBurnEvents: matchedSponsoredBurnEvents,
      mintEvents: matchedMintEvents,
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
   * Helper function to transform an address to the format expected by the destination chain.
   * Based on the chain ID, specific formatting logic is applied.
   *
   * @param address The address string to transform.
   * @param chainId The chain ID of the destination chain.
   * @returns The transformed address string.
   */
  private transformAddress(address: string, chainId: number): string {
    const addressType = across.utils.toAddressType(address, chainId);
    return formatFromAddressToChainFormat(addressType, chainId);
  }

  /**
   * Fetches transactions for a list of signatures in batches.
   * Utilizes the provider to fetch transaction details including logs and account keys.
   *
   * @param signatures Array of transaction signatures to fetch.
   * @returns A Map where keys are signatures and values are the fetched transaction objects.
   */
  private async getTransactionsForSignatures(signatures: string[]) {
    const transactions = new Map<string, Transaction>();
    const uniqueSignatures = [...new Set(signatures)];

    await across.utils.forEachAsync(uniqueSignatures, async (sig) => {
      try {
        const txn = await this.provider
          .getTransaction(signature(sig), {
            maxSupportedTransactionVersion: 0,
          })
          .send();
        if (txn) {
          transactions.set(sig, txn);
        }
      } catch (error) {
        this.logger.error({
          at: "SvmCCTPIndexerDataHandler#getTransactionsForSignatures",
          message: "Failed to fetch transaction",
          signature: sig,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return transactions;
  }

  /**
   * Fetches MessageSent data and pairs with DepositForBurn events
   * In Solana, MessageSent data is stored in an account.
   */
  private async matchDepositForBurnWithMessageSent(
    depositForBurnEvents: SolanaDepositForBurnEvent[],
    transactions: Map<string, Transaction>,
  ): Promise<SolanaBurnEventsPair[]> {
    const burnEvents: SolanaBurnEventsPair[] = [];

    await across.utils.forEachAsync(depositForBurnEvents, async (deposit) => {
      try {
        const txn = transactions.get(deposit.signature);

        if (!txn) {
          this.logger.warn({
            at: "SvmCCTPIndexerDataHandler#matchDepositForBurnWithMessageSent",
            message: "Transaction not found for signature",
            signature: deposit.signature,
          });
          return;
        }

        // Extract the MessageSent account address from the transaction
        // The MessageSent account is the second signer (index 1) in the transaction
        // First signer (index 0) is the payer, second signer is the message_sent_event_data account
        const messageSentAccountAddress =
          txn?.transaction?.message?.accountKeys?.[1];

        if (!messageSentAccountAddress) {
          this.logger.warn({
            at: "SvmCCTPIndexerDataHandler#matchDepositForBurnWithMessageSent",
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
            at: "SvmCCTPIndexerDataHandler#matchDepositForBurnWithMessageSent",
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

        const pair: SolanaBurnEventsPair = {
          depositForBurn: deposit,
          messageSent,
        };

        burnEvents.push(pair);
      } catch (error) {
        this.logger.error({
          at: "SvmCCTPIndexerDataHandler#matchDepositForBurnWithMessageSent",
          message: "Failed to process deposit event for MessageSent matching",
          signature: deposit.signature,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return burnEvents;
  }

  /**
   * Matches SponsoredDepositForBurn events with their corresponding DepositForBurn events.
   * This matching is necessary to:
   * 1. Retrieve the `destinationChainId` from the DepositForBurn event (which is required for address transformation).
   * 2. Transform the `finalRecipient` and `finalToken` addresses into the correct format for the destination chain.
   *
   * @param allSponsoredBurnEvents The list of raw SponsoredDepositForBurn events fetched from the chain.
   * @param depositForBurnEvents The list of already processed DepositForBurn events.
   * @returns A list of fully processed and transformed SolanaSponsoredDepositForBurnEvent objects.
   */
  private matchSponsoredDepositForBurnWithDepositForBurn(
    allSponsoredBurnEvents: (SolanaSponsoredDepositForBurnEvent &
      across.arch.svm.EventWithData)[],
    depositForBurnEvents: SolanaDepositForBurnEvent[],
  ): SolanaSponsoredDepositForBurnEvent[] {
    // Match sponsored events with depositForBurn events by transaction signature
    // We filter allSponsoredBurnEvents to keep only those that match a transaction in filteredDepositForBurnEvents
    // and transform the finalRecipient using the destination chain ID.
    const depositForBurnBySignature = new Map<
      string,
      SolanaDepositForBurnEvent
    >();
    for (const deposit of depositForBurnEvents) {
      depositForBurnBySignature.set(deposit.signature, deposit);
    }

    const sponsoredBurnEvents: SolanaSponsoredDepositForBurnEvent[] = [];

    for (const sponsoredEvent of allSponsoredBurnEvents) {
      const depositEvent = depositForBurnBySignature.get(
        sponsoredEvent.signature,
      );
      if (depositEvent) {
        // Found the matching DepositForBurn event
        const destinationChainId = getCctpDestinationChainFromDomain(
          depositEvent.data.destinationDomain,
        );

        // Transform finalRecipient using the destination chain ID
        // The event returns finalRecipient as a base58 string (Solana PublicKey)
        // We need to convert it to the format expected by the destination chain
        const transformedFinalRecipient = this.transformAddress(
          sponsoredEvent.data?.finalRecipient,
          destinationChainId,
        );
        const transformedFinalToken = this.transformAddress(
          sponsoredEvent.data?.finalToken,
          destinationChainId,
        );
        sponsoredEvent.data.finalRecipient = transformedFinalRecipient;
        sponsoredEvent.data.finalToken = transformedFinalToken;

        sponsoredBurnEvents.push({
          ...sponsoredEvent,
        });
      }
    }

    return sponsoredBurnEvents;
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
    mintAndWithdrawEvents: across.arch.svm.EventWithData[],
  ): Promise<SolanaMintEventsPair[]> {
    const mintEventsPairs: SolanaMintEventsPair[] = [];

    // Create a Set of receiveMessage signatures to filter mint events by
    const receiveMessageSignatures = new Set(
      receiveMessageEvents.map((e) => e.signature),
    );

    // Keep onl
    const mintEventsBySignature = new Map<
      string,
      across.arch.svm.EventWithData
    >();
    for (const mintEvent of mintAndWithdrawEvents) {
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
    const { burnEvents, sponsoredBurnEvents, mintEvents, slotTimes } = events;

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
    const chainAgnosticSponsoredBurnEvents = sponsoredBurnEvents.map((event) =>
      this.convertSponsoredDepositForBurnToChainAgnostic(event),
    );

    const [savedBurnEvents, savedMintEvents, savedSponsoredBurnEvents] =
      await Promise.all([
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
        this.cctpRepository.formatAndSaveSponsoredBurnEvents(
          chainAgnosticSponsoredBurnEvents,
          lastFinalisedBlock,
          this.chainId,
          blockDates,
        ),
      ]);

    return {
      savedBurnEvents,
      savedMintEvents,
      savedSponsoredBurnEvents,
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
        hookData: ethers.utils.hexlify(depositForBurn.data.hookData),
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

  private convertSponsoredDepositForBurnToChainAgnostic(
    sponsoredDepositForBurn: SolanaSponsoredDepositForBurnEvent,
  ): SponsoredDepositForBurnWithBlock {
    return {
      blockNumber: Number(sponsoredDepositForBurn.slot),
      transactionHash: sponsoredDepositForBurn.signature,
      transactionIndex: 0,
      logIndex: 0,
      quoteNonce: ethers.utils.hexlify(sponsoredDepositForBurn.data.quoteNonce),
      originSender: sponsoredDepositForBurn.data.originSender,
      finalRecipient: sponsoredDepositForBurn.data.finalRecipient,
      quoteDeadline: new Date(
        Number(sponsoredDepositForBurn.data.quoteDeadline) * 1000,
      ),
      maxBpsToSponsor: sponsoredDepositForBurn.data.maxBpsToSponsor,
      maxUserSlippageBps: sponsoredDepositForBurn.data.maxUserSlippageBps,
      finalToken: sponsoredDepositForBurn.data.finalToken.toString(),
      signature: ethers.utils.hexlify(sponsoredDepositForBurn.data.signature),
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

function countValues(obj: object): number {
  return Object.values(obj).reduce(
    (acc, val) => (Array.isArray(val) ? acc + val.length : acc),
    0,
  );
}

function summaryStoredEvents(storedEvents: StoreEventsResult) {
  const simplifyEntity = (entity: {
    id: number;
    chainId: string;
    blockNumber: number;
    transactionHash: string;
  }) => {
    return {
      id: entity.id,
      chainId: entity.chainId,
      blockNumber: entity.blockNumber,
      transactionHash: entity.transactionHash,
    };
  };

  return {
    savedBurnEvents: storedEvents.savedBurnEvents.map((pair) => ({
      depositForBurn: simplifyEntity(pair.depositForBurnEvent.data),
      messageSent: simplifyEntity(pair.messageSentEvent.data),
    })),
    savedMintEvents: storedEvents.savedMintEvents.map((pair) => ({
      messageReceived: simplifyEntity(pair.messageReceivedEvent.data),
      mintAndWithdraw: simplifyEntity(pair.mintAndWithdrawEvent.data),
    })),
    savedSponsoredBurnEvents: storedEvents.savedSponsoredBurnEvents.map((e) =>
      simplifyEntity(e.data),
    ),
  };
}
