import { Logger } from "winston";
import { ethers, providers, Transaction } from "ethers";
import * as across from "@across-protocol/sdk";
import { CHAIN_IDs, TEST_NETWORKS } from "@across-protocol/constants";
import { formatFromAddressToChainFormat } from "../../utils";
import {
  BlockRange,
  SimpleTransferFlowCompletedLog,
  ArbitraryActionsExecutedLog,
  FallbackHyperEVMFlowCompletedLog,
  SponsoredAccountActivationLog,
  SwapFlowInitializedLog,
  SwapFlowFinalizedLog,
  SPONSORED_ACCOUNT_ACTIVATION_ABI,
  SWAP_FLOW_FINALIZED_ABI,
} from "../model";
import { IndexerDataHandler } from "./IndexerDataHandler";
import { EventDecoder } from "../../web3/EventDecoder";
import {
  MESSAGE_TRANSMITTER_V2_ABI,
  TOKEN_MESSENGER_V2_ABI,
} from "../adapter/cctp-v2/abis";
import {
  DepositForBurnEvent,
  MessageReceivedEvent,
  MessageSentLog,
  MintAndWithdrawLog,
  DepositForBurnWithBlock,
  MessageSentWithBlock,
  MessageReceivedWithBlock,
  MintAndWithdrawWithBlock,
  SponsoredDepositForBurnLog,
  SponsoredDepositForBurnWithBlock,
} from "../adapter/cctp-v2/model";
import {
  CCTPRepository,
  BurnEventsPair,
  MintEventsPair,
} from "../../database/CctpRepository";
import {
  getIndexingStartBlockNumber,
  decodeMessage,
  getCctpDestinationChainFromDomain,
  isHypercoreWithdraw,
} from "../adapter/cctp-v2/service";
import { entities, SaveQueryResult } from "@repo/indexer-database";
import {
  formatFallbackHyperEVMFlowCompletedEvent,
  formatSimpleTransferFlowCompletedEvent,
  formatSponsoredAccountActivationEvent,
  formatSwapFlowInitializedEvent,
  formatSwapFlowFinalizedEvent,
} from "./hyperEvmExecutor";
import {
  formatAndSaveEvents,
  getEventsFromTransactionReceipts,
} from "./eventProcessing";

export type EvmBurnEventsPair = {
  depositForBurn: DepositForBurnEvent;
  messageSent: MessageSentLog;
};
export type EvmMintEventsPair = {
  messageReceived: MessageReceivedEvent;
  mintAndWithdraw: MintAndWithdrawLog;
};
export type FetchEventsResult = {
  burnEvents: EvmBurnEventsPair[];
  mintEvents: EvmMintEventsPair[];
  sponsoredBurnEvents: SponsoredDepositForBurnLog[];
  simpleTransferFlowCompletedEvents: SimpleTransferFlowCompletedLog[];
  arbitraryActionsExecutedEvents: ArbitraryActionsExecutedLog[];
  fallbackHyperEVMFlowCompletedEvents: FallbackHyperEVMFlowCompletedLog[];
  sponsoredAccountActivationEvents: SponsoredAccountActivationLog[];
  swapFlowInitializedEvents: SwapFlowInitializedLog[];
  swapFlowFinalizedEvents: SwapFlowFinalizedLog[];
  blocks: Record<string, providers.Block>;
  transactionReceipts: Record<string, providers.TransactionReceipt>;
  transactions: Record<string, Transaction>;
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
  savedSimpleTransferFlowCompletedEvents: SaveQueryResult<entities.SimpleTransferFlowCompleted>[];
  savedArbitraryActionsExecutedEvents: SaveQueryResult<entities.ArbitraryActionsExecuted>[];
  savedFallbackHyperEVMFlowCompletedEvents: SaveQueryResult<entities.FallbackHyperEVMFlowCompleted>[];
  savedSponsoredAccountActivationEvents: SaveQueryResult<entities.SponsoredAccountActivation>[];
  savedSwapFlowInitializedEvents: SaveQueryResult<entities.SwapFlowInitialized>[];
  savedSwapFlowFinalizedEvents: SaveQueryResult<entities.SwapFlowFinalized>[];
};

// Taken from https://developers.circle.com/cctp/evm-smart-contracts
const TOKEN_MESSENGER_ADDRESS_MAINNET: string =
  "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const TOKEN_MESSENGER_ADDRESS_TESTNET: string =
  "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";

// Taken from https://developers.circle.com/cctp/evm-smart-contracts
const MESSAGE_TRANSMITTER_ADDRESS_MAINNET: string =
  "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
const MESSAGE_TRANSMITTER_ADDRESS_TESTNET: string =
  "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";

// TODO: Update this address once the contract is deployed
export const SPONSORED_CCTP_DST_PERIPHERY_ADDRESS: { [key: number]: string } = {
  // Taken from https://hyperevmscan.io/address/0x1c709Fd0Db6A6B877Ddb19ae3D485B7b4ADD879f#code
  [CHAIN_IDs.HYPEREVM]: "0x1c709Fd0Db6A6B877Ddb19ae3D485B7b4ADD879f",
};

// TODO: Update this address once the contract is deployed
const SPONSORED_CCTP_SRC_PERIPHERY_ADDRESS: { [key: number]: string } = {
  [CHAIN_IDs.ARBITRUM_SEPOLIA]: "0x79176E2E91c77b57AC11c6fe2d2Ab2203D87AF85",
  // Taken from: https://basescan.org/address/0xa7a8d1efc1ee3e69999d370380949092251a5c20
  [CHAIN_IDs.BASE]: "0xA7A8d1efC1EE3E69999D370380949092251a5c20",
  // Taken from: https://arbiscan.io/address/0xce1ffe01ebb4f8521c12e74363a396ee3d337e1b
  [CHAIN_IDs.ARBITRUM]: "0xce1FFE01eBB4f8521C12e74363A396ee3d337E1B",
};

const SWAP_API_CALLDATA_MARKER = "73c0de";
const WHITELISTED_FINALIZERS = [
  "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
  "0x72adB07A487f38321b6665c02D289C413610B081",
  "0x49066b9c4a68e0942f77989e78d9e27f78a67ce7b165cafd101a477a148058fd",
];

// Convert whitelisted finalizers to bytes32 format for comparison with destinationCaller
const WHITELISTED_FINALIZERS_BYTES32 = WHITELISTED_FINALIZERS.map((address) =>
  ethers.utils.hexZeroPad(address.toLowerCase(), 32).toLowerCase(),
);

export class CCTPIndexerDataHandler implements IndexerDataHandler {
  private isInitialized: boolean;

  constructor(
    private logger: Logger,
    private chainId: number,
    private provider: across.providers.RetryProvider,
    private cctpRepository: CCTPRepository,
  ) {
    this.isInitialized = false;
  }

  private initialize() {}

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
      at: "Indexer#CCTPIndexerDataHandler#processBlockRange",
      message: `Processing block range ${this.getDataIdentifier()}`,
      blockRange,
      lastFinalisedBlock,
      isBackfilling,
    });

    if (!this.isInitialized) {
      this.initialize();
      this.isInitialized = true;
    }

    const startPerfTime = performance.now();

    const events = await this.fetchEventsByRange(blockRange);
    const storedEvents = await this.storeEvents(events, lastFinalisedBlock);
    const timeToStoreEvents = performance.now();

    const sponsoredCCTPDstPeripheryAddress =
      SPONSORED_CCTP_DST_PERIPHERY_ADDRESS[this.chainId];

    if (!sponsoredCCTPDstPeripheryAddress) {
      this.logger.debug({
        at: "Indexer#CCTPIndexerDataHandler#processBlockRange",
        message: `No sponsored CCTP Dst Periphery address configured for chain ${this.chainId}, delete events based on chain id only`,
        chainId: this.chainId,
      });
    }

    const deletedEvents = await this.cctpRepository.deleteUnfinalisedCCTPEvents(
      this.chainId,
      lastFinalisedBlock,
      sponsoredCCTPDstPeripheryAddress,
    );
    const timeToDeleteEvents = performance.now();
    await this.processEvents(storedEvents, deletedEvents.messageReceivedEvents);
    const finalPerfTime = performance.now();

    this.logger.debug({
      at: "Indexer#CCTPIndexerDataHandler#processBlockRange",
      message: "System Time Log for CCTPIndexerDataHandler#processBlockRange",
      spokeChainId: this.chainId,
      blockRange: blockRange,
      finalTime: finalPerfTime - startPerfTime,
      timeToStoreEvents: timeToStoreEvents - startPerfTime,
      timeToDeleteEvents: timeToDeleteEvents - timeToStoreEvents,
    });
  }

  private async fetchEventsByRange(
    blockRange: BlockRange,
  ): Promise<FetchEventsResult> {
    const sponsoredCCTPSrcPeripheryAddress =
      SPONSORED_CCTP_SRC_PERIPHERY_ADDRESS[this.chainId];
    const sponsoredCCTPDstPeripheryAddress =
      SPONSORED_CCTP_DST_PERIPHERY_ADDRESS[this.chainId];
    const tokenMessengerAddress =
      this.chainId in TEST_NETWORKS
        ? TOKEN_MESSENGER_ADDRESS_TESTNET
        : TOKEN_MESSENGER_ADDRESS_MAINNET;
    const messageTransmitterAddress =
      this.chainId in TEST_NETWORKS
        ? MESSAGE_TRANSMITTER_ADDRESS_TESTNET
        : MESSAGE_TRANSMITTER_ADDRESS_MAINNET;

    const tokenMessengerContract = new ethers.Contract(
      tokenMessengerAddress,
      TOKEN_MESSENGER_V2_ABI,
      this.provider,
    );
    const messageTransmitterContract = new ethers.Contract(
      messageTransmitterAddress,
      MESSAGE_TRANSMITTER_V2_ABI,
      this.provider,
    );
    const [depositForBurnEvents, messageReceivedEvents] = await Promise.all([
      tokenMessengerContract.queryFilter(
        "DepositForBurn",
        blockRange.from,
        blockRange.to,
      ) as Promise<DepositForBurnEvent[]>,
      messageTransmitterContract.queryFilter(
        "MessageReceived",
        blockRange.from,
        blockRange.to,
      ) as Promise<MessageReceivedEvent[]>,
    ]);
    const depositForBurnTransactions = await this.getTransactions([
      ...new Set(depositForBurnEvents.map((event) => event.transactionHash)),
    ]);
    const filteredDepositForBurnEvents =
      await this.filterTransactionsFromSwapApi(
        depositForBurnTransactions,
        depositForBurnEvents,
      );

    const filteredMessageReceivedEvents = this.filterMintTransactions(
      messageReceivedEvents,
    );

    const transactionReceipts = await this.getTransactionsReceipts([
      ...new Set([
        ...filteredDepositForBurnEvents.map((event) => event.transactionHash),
        ...filteredMessageReceivedEvents.map((event) => event.transactionHash),
      ]),
    ]);
    // Save the block hashes of all the burn and mint transactions
    let blockHashes = new Set([
      ...Object.values(transactionReceipts).map((event) => event.blockHash),
    ]);

    const filteredDepositForBurnTxReceipts =
      this.getTransactionReceiptsByTransactionHashes(transactionReceipts, [
        ...new Set(
          filteredDepositForBurnEvents.map((event) => event.transactionHash),
        ),
      ]);

    const filteredMessageReceivedTxReceipts =
      this.getTransactionReceiptsByTransactionHashes(transactionReceipts, [
        ...new Set(
          filteredMessageReceivedEvents.map((event) => event.transactionHash),
        ),
      ]);

    const messageSentEvents = getEventsFromTransactionReceipts(
      filteredDepositForBurnTxReceipts,
      messageTransmitterAddress,
      EventDecoder.decodeCCTPMessageSentEvents,
    );

    const mintAndWithdrawEvents = getEventsFromTransactionReceipts(
      filteredMessageReceivedTxReceipts,
      tokenMessengerAddress,
      EventDecoder.decodeCCTPMintAndWithdrawEvents,
    );

    const burnEvents = await this.matchDepositForBurnWithMessageSentEvents(
      filteredDepositForBurnEvents,
      messageSentEvents,
    );

    const mintEvents = await this.matchMessageReceivedWithMintAndWithdrawEvents(
      filteredMessageReceivedEvents,
      mintAndWithdrawEvents,
    );

    let sponsoredBurnEvents: SponsoredDepositForBurnLog[] = [];
    if (sponsoredCCTPSrcPeripheryAddress) {
      sponsoredBurnEvents =
        this.getSponsoredDepositForBurnEventsFromTransactionReceipts(
          // The sponsored deposit for burn events are emitted in the same tx as deposit for burn events
          filteredDepositForBurnTxReceipts,
          sponsoredCCTPSrcPeripheryAddress,
          filteredDepositForBurnEvents,
        );
    } else {
      this.logger.debug({
        at: "CCTPIndexerDataHandler#fetchEventsByRange",
        message: `Sponsored CCTP Src Periphery address not configured for chain ${this.chainId}, skipping fetching SponsoredDepositForBurn events`,
      });
    }

    let simpleTransferFlowCompletedEvents: SimpleTransferFlowCompletedLog[] =
      [];
    let arbitraryActionsExecutedEvents: ArbitraryActionsExecutedLog[] = [];
    let fallbackHyperEVMFlowCompletedEvents: FallbackHyperEVMFlowCompletedLog[] =
      [];
    let sponsoredAccountActivationEvents: SponsoredAccountActivationLog[] = [];
    let swapFlowInitializedEvents: SwapFlowInitializedLog[] = [];
    let swapFlowFinalizedEvents: SwapFlowFinalizedLog[] = [];
    if (sponsoredCCTPDstPeripheryAddress) {
      simpleTransferFlowCompletedEvents = getEventsFromTransactionReceipts(
        filteredMessageReceivedTxReceipts,
        sponsoredCCTPDstPeripheryAddress,
        EventDecoder.decodeSimpleTransferFlowCompletedEvents,
      );

      arbitraryActionsExecutedEvents = getEventsFromTransactionReceipts(
        filteredMessageReceivedTxReceipts,
        sponsoredCCTPDstPeripheryAddress,
        EventDecoder.decodeArbitraryActionsExecutedEvents,
      );

      fallbackHyperEVMFlowCompletedEvents = getEventsFromTransactionReceipts(
        filteredMessageReceivedTxReceipts,
        sponsoredCCTPDstPeripheryAddress,
        EventDecoder.decodeFallbackHyperEVMFlowCompletedEvents,
      );
      swapFlowInitializedEvents = getEventsFromTransactionReceipts(
        filteredMessageReceivedTxReceipts,
        sponsoredCCTPDstPeripheryAddress,
        EventDecoder.decodeSwapFlowInitializedEvents,
      );

      const sponsoredCCTPDstPeripheryContract = new ethers.Contract(
        sponsoredCCTPDstPeripheryAddress,
        [...SPONSORED_ACCOUNT_ACTIVATION_ABI, ...SWAP_FLOW_FINALIZED_ABI],
        this.provider,
      );

      [sponsoredAccountActivationEvents, swapFlowFinalizedEvents] =
        await Promise.all([
          sponsoredCCTPDstPeripheryContract.queryFilter(
            "SponsoredAccountActivation",
            blockRange.from,
            blockRange.to,
          ) as unknown as Promise<SponsoredAccountActivationLog[]>,
          sponsoredCCTPDstPeripheryContract.queryFilter(
            "SwapFlowFinalized",
            blockRange.from,
            blockRange.to,
          ) as unknown as Promise<SwapFlowFinalizedLog[]>,
        ]);

      // Append the block hashes of the additionally fetched events (those that are not in existing tx receipts)
      sponsoredAccountActivationEvents.forEach((event) =>
        blockHashes.add(event.blockHash),
      );
      swapFlowFinalizedEvents.forEach((event) =>
        blockHashes.add(event.blockHash),
      );
    }

    this.runChecks(burnEvents, mintEvents);

    if (burnEvents.length > 0) {
      this.logger.debug({
        at: "CCTPIndexerDataHandler#fetchEventsByRange",
        message: `Found ${burnEvents.length} burn events from Swap API on chain ${this.chainId}`,
      });
    }
    if (mintEvents.length > 0) {
      this.logger.debug({
        at: "CCTPIndexerDataHandler#fetchEventsByRange",
        message: `Found ${mintEvents.length} mint events from Across Finalizer on chain ${this.chainId}`,
      });
    }

    // Fetch all blocks in a single RPC call
    const blocks = await this.getBlocks([...blockHashes]);

    return {
      burnEvents,
      mintEvents,
      sponsoredBurnEvents,
      simpleTransferFlowCompletedEvents,
      arbitraryActionsExecutedEvents,
      fallbackHyperEVMFlowCompletedEvents,
      sponsoredAccountActivationEvents,
      swapFlowInitializedEvents,
      swapFlowFinalizedEvents,
      blocks,
      transactionReceipts,
      transactions: depositForBurnTransactions,
    };
  }

  private getTransactionReceiptsByTransactionHashes(
    transactionReceipts: Record<string, providers.TransactionReceipt>,
    transactionHashes: string[],
  ) {
    return Object.entries(transactionReceipts).reduce(
      (acc, [transactionHash, transactionReceipt]) => {
        if (transactionHashes.includes(transactionHash)) {
          acc[transactionHash] = transactionReceipt;
        }
        return acc;
      },
      {} as Record<string, providers.TransactionReceipt>,
    );
  }

  private async filterTransactionsFromSwapApi(
    transactions: Record<string, Transaction>,
    depositForBurnEvents: DepositForBurnEvent[],
  ) {
    const transactionHashes = Object.values(transactions)
      .filter((transaction) => {
        return transaction.data.includes(SWAP_API_CALLDATA_MARKER);
      })
      .map((transaction) => transaction.hash);

    return depositForBurnEvents.filter((event) => {
      // Filter by transaction hash (Swap API marker)
      if (!transactionHashes.includes(event.transactionHash)) {
        return false;
      }
      // Filter also by destinationCaller.
      // The Swap API marker alone is insufficient since "73c0de" can appear
      // in the calldata of transactions unrelated to Across.
      const destinationCallerLower = event.args.destinationCaller.toLowerCase();
      return WHITELISTED_FINALIZERS_BYTES32.includes(destinationCallerLower);
    });
  }

  private filterMintTransactions(
    messageReceivedEvents: MessageReceivedEvent[],
  ) {
    return messageReceivedEvents.filter((event) => {
      if (WHITELISTED_FINALIZERS.includes(event.args.caller)) {
        return true;
      }
      const result = isHypercoreWithdraw(event.args.messageBody, {
        logger: this.logger,
        chainId: this.chainId,
        transactionHash: event.transactionHash,
      });
      return result.isValid;
    });
  }

  private runChecks(
    burnEvents: EvmBurnEventsPair[],
    mintEvents: EvmMintEventsPair[],
  ) {
    for (const burnEventsPair of burnEvents) {
      if (!burnEventsPair.depositForBurn || !burnEventsPair.messageSent) {
        this.logger.error({
          at: "CCTPIndexerDataHandler#runChecks",
          message: `Found incomplete pair of burn events for tx hash`,
          notificationPath: "across-indexer-error",
          burnEvents,
        });
      }
    }
    for (const mintEventsPair of mintEvents) {
      if (!mintEventsPair.messageReceived || !mintEventsPair.mintAndWithdraw) {
        this.logger.error({
          at: "CCTPIndexerDataHandler#runChecks",
          message: `Found incomplete pair of mint events for tx hash`,
          notificationPath: "across-indexer-error",
          mintEvents,
        });
      }
    }
  }

  private getSponsoredDepositForBurnEventsFromTransactionReceipts(
    transactionReceipts: Record<string, ethers.providers.TransactionReceipt>,
    sponsoredCCTPSrcPeripheryAddress: string,
    depositForBurnEvents: DepositForBurnEvent[],
  ) {
    const events: SponsoredDepositForBurnLog[] = [];
    // DepositForBurn events and SponsoredDepositForBurn events are emitted in the same transaction
    const depositForBurnEventsByTxHash = depositForBurnEvents.reduce(
      (acc, event) => {
        if (!acc[event.transactionHash]) {
          acc[event.transactionHash] = [];
        }
        acc[event.transactionHash]!.push(event);
        return acc;
      },
      {} as Record<string, DepositForBurnEvent[]>,
    );

    for (const txHash of Object.keys(transactionReceipts)) {
      const transactionReceipt = transactionReceipts[
        txHash
      ] as providers.TransactionReceipt;
      const sponsoredDepositForBurnEvents: SponsoredDepositForBurnLog[] =
        EventDecoder.decodeCCTPSponsoredDepositForBurnEvents(
          transactionReceipt,
          sponsoredCCTPSrcPeripheryAddress,
        );

      if (sponsoredDepositForBurnEvents.length > 0) {
        const depositForBurnEvents = (
          depositForBurnEventsByTxHash[txHash] || []
        ).sort((a, b) => a.logIndex - b.logIndex);
        for (const sponsoredDepositForBurnEvent of sponsoredDepositForBurnEvents) {
          // If a SponsoredDepositForBurn event is found, we need to find the corresponding DepositForBurn event to get the destination chain id
          // The correct DepositForBurn event that matches a SponsoredDepositForBurn event is the one with the highest log index that is still lower than the SponsoredDepositForBurn event's log index
          const matchingDepositForBurnEvent = depositForBurnEvents.find(
            (depositForBurnEvent) =>
              depositForBurnEvent.logIndex <
              sponsoredDepositForBurnEvent.logIndex,
          );

          if (matchingDepositForBurnEvent) {
            const destinationChainId = getCctpDestinationChainFromDomain(
              matchingDepositForBurnEvent.args.destinationDomain,
            );

            events.push({
              ...sponsoredDepositForBurnEvent,
              destinationChainId,
            });
          }
        }
      }
    }

    return events;
  }

  private async getTransactionsReceipts(uniqueTransactionHashes: string[]) {
    const transactionReceipts = await Promise.all(
      uniqueTransactionHashes.map(async (txHash) => {
        return this.provider.getTransactionReceipt(txHash);
      }),
    );
    const transactionReceiptsMap = transactionReceipts.reduce(
      (acc, receipt) => {
        acc[receipt.transactionHash] = receipt;
        return acc;
      },
      {} as Record<string, providers.TransactionReceipt>,
    );
    return transactionReceiptsMap;
  }

  private async getTransactions(uniqueTransactionHashes: string[]) {
    const transactions = await Promise.all(
      uniqueTransactionHashes.map(async (txHash) => {
        return this.provider.getTransaction(txHash);
      }),
    );
    const transactionReceiptsMap = transactions.reduce(
      (acc, transaction) => {
        acc[transaction.hash] = transaction;
        return acc;
      },
      {} as Record<string, Transaction>,
    );
    return transactionReceiptsMap;
  }

  private async getBlocks(blockHashes: string[]) {
    const blocks = await Promise.all(
      blockHashes.map(async (blockHash) => {
        return this.provider.getBlock(blockHash);
      }),
    );
    return blocks.reduce(
      (acc, block) => {
        acc[block.hash] = block;
        return acc;
      },
      {} as Record<string, providers.Block>,
    );
  }

  private async storeEvents(
    events: FetchEventsResult,
    lastFinalisedBlock: number,
  ): Promise<StoreEventsResult> {
    const {
      burnEvents,
      mintEvents,
      sponsoredBurnEvents,
      simpleTransferFlowCompletedEvents,
      arbitraryActionsExecutedEvents,
      fallbackHyperEVMFlowCompletedEvents,
      sponsoredAccountActivationEvents,
      swapFlowInitializedEvents,
      blocks,
    } = events;
    const blocksTimestamps = this.getBlocksTimestamps(blocks);

    // Convert EVM events to chain-agnostic format
    const chainAgnosticBurnEvents = burnEvents.map((pair) =>
      this.convertBurnEventsPairToChainAgnostic(pair),
    );

    const chainAgnosticMintEvents = mintEvents.map((pair) =>
      this.convertMintEventsPairToChainAgnostic(pair),
    );

    const chainAgnosticSponsoredBurnEvents = sponsoredBurnEvents.map((event) =>
      this.convertSponsoredDepositForBurnToChainAgnostic(event),
    );
    const primaryKeyColumns = [
      "chainId",
      "blockNumber",
      "transactionHash",
      "logIndex",
    ];
    const [
      savedBurnEvents,
      savedMintEvents,
      savedSponsoredBurnEvents,
      savedSimpleTransferFlowCompletedEvents,
      savedArbitraryActionsExecutedEvents,
      savedFallbackHyperEVMFlowCompletedEvents,
      savedSponsoredAccountActivationEvents,
      savedSwapFlowInitializedEvents,
      savedSwapFlowFinalizedEvents,
    ] = await Promise.all([
      this.cctpRepository.formatAndSaveBurnEvents(
        chainAgnosticBurnEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
      ),
      this.cctpRepository.formatAndSaveMintEvents(
        chainAgnosticMintEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
      ),
      this.cctpRepository.formatAndSaveSponsoredBurnEvents(
        chainAgnosticSponsoredBurnEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
      ),
      formatAndSaveEvents(
        this.cctpRepository,
        simpleTransferFlowCompletedEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
        formatSimpleTransferFlowCompletedEvent,
        entities.SimpleTransferFlowCompleted,
        primaryKeyColumns as (keyof entities.SimpleTransferFlowCompleted)[],
      ),
      this.cctpRepository.formatAndSaveArbitraryActionsExecutedEvents(
        arbitraryActionsExecutedEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
      ),
      formatAndSaveEvents(
        this.cctpRepository,
        fallbackHyperEVMFlowCompletedEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
        formatFallbackHyperEVMFlowCompletedEvent,
        entities.FallbackHyperEVMFlowCompleted,
        primaryKeyColumns as (keyof entities.FallbackHyperEVMFlowCompleted)[],
      ),
      formatAndSaveEvents(
        this.cctpRepository,
        sponsoredAccountActivationEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
        formatSponsoredAccountActivationEvent,
        entities.SponsoredAccountActivation,
        primaryKeyColumns as (keyof entities.SponsoredAccountActivation)[],
      ),
      formatAndSaveEvents(
        this.cctpRepository,
        swapFlowInitializedEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
        formatSwapFlowInitializedEvent,
        entities.SwapFlowInitialized,
        primaryKeyColumns as (keyof entities.SwapFlowInitialized)[],
      ),
      formatAndSaveEvents(
        this.cctpRepository,
        events.swapFlowFinalizedEvents,
        lastFinalisedBlock,
        this.chainId,
        blocksTimestamps,
        formatSwapFlowFinalizedEvent,
        entities.SwapFlowFinalized,
        primaryKeyColumns as (keyof entities.SwapFlowFinalized)[],
      ),
    ]);

    return {
      savedBurnEvents,
      savedMintEvents,
      savedSponsoredBurnEvents,
      savedSimpleTransferFlowCompletedEvents,
      savedArbitraryActionsExecutedEvents,
      savedFallbackHyperEVMFlowCompletedEvents,
      savedSponsoredAccountActivationEvents,
      savedSwapFlowInitializedEvents,
      savedSwapFlowFinalizedEvents,
    };
  }

  // TODO: Refactor into an aggregator/processor class
  private async processEvents(
    storedEvents: StoreEventsResult,
    deletedMessageReceivedEvents: entities.MessageReceived[],
  ) {
    // Delete HyperCore CCTP withdrawals related to deleted MessageReceived events
    await this.cctpRepository.deleteHypercoreCctpWithdrawalsForMessageReceived(
      deletedMessageReceivedEvents,
    );

    // Save HyperCore CCTP withdrawals
    const { savedMintEvents } = storedEvents;
    const savedHypercoreCctpWithdrawals =
      await this.cctpRepository.formatAndSaveHypercoreCctpWithdrawals(
        savedMintEvents,
        this.chainId,
      );

    this.logger.debug({
      at: "CCTPIndexerDataHandler#processEvents",
      message: `Processed ${savedHypercoreCctpWithdrawals.length} HyperCore CCTP withdrawals`,
      chainId: this.chainId,
    });
  }

  private getBlocksTimestamps(
    blocks: Record<string, providers.Block>,
  ): Record<string, Date> {
    return Object.entries(blocks).reduce(
      (acc, [blockHash, block]) => {
        acc[block.number] = new Date(block.timestamp * 1000);
        return acc;
      },
      {} as Record<string, Date>,
    );
  }

  private convertSponsoredDepositForBurnToChainAgnostic(
    event: SponsoredDepositForBurnLog,
  ): SponsoredDepositForBurnWithBlock {
    return {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      transactionIndex: event.transactionIndex,
      logIndex: event.logIndex,
      nonce: event.args.nonce,
      originSender: event.args.originSender,
      finalRecipient: event.destinationChainId
        ? formatFromAddressToChainFormat(
            across.utils.toAddressType(
              event.args.finalRecipient,
              event.destinationChainId,
            ),
            event.destinationChainId,
          )
        : event.args.finalRecipient,
      quoteDeadline: new Date(event.args.quoteDeadline.toNumber() * 1000),
      maxBpsToSponsor: event.args.maxBpsToSponsor.toString(),
      maxUserSlippageBps: event.args.maxUserSlippageBps.toString(),
      finalToken: event.args.finalToken,
      signature: event.args.signature,
    };
  }

  private convertDepositForBurnToChainAgnostic(
    event: DepositForBurnEvent,
  ): DepositForBurnWithBlock {
    return {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      transactionIndex: event.transactionIndex,
      logIndex: event.logIndex,
      burnToken: event.args.burnToken,
      amount: event.args.amount.toString(),
      depositor: event.args.depositor,
      mintRecipient: event.args.mintRecipient,
      destinationDomain: event.args.destinationDomain,
      destinationTokenMessenger: event.args.destinationTokenMessenger,
      destinationCaller: event.args.destinationCaller,
      maxFee: event.args.maxFee.toString(),
      minFinalityThreshold: event.args.minFinalityThreshold,
      hookData: event.args.hookData,
    };
  }

  private convertMessageSentToChainAgnostic(
    event: MessageSentLog,
  ): MessageSentWithBlock {
    const messageBytes = ethers.utils.arrayify(event.args.message);
    const decodedMessage = decodeMessage(messageBytes);
    return {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      transactionIndex: event.transactionIndex,
      logIndex: event.logIndex,
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
    };
  }

  private convertBurnEventsPairToChainAgnostic(
    pair: EvmBurnEventsPair,
  ): BurnEventsPair {
    return {
      depositForBurn: this.convertDepositForBurnToChainAgnostic(
        pair.depositForBurn,
      ),
      messageSent: this.convertMessageSentToChainAgnostic(pair.messageSent),
    };
  }

  private convertMessageReceivedToChainAgnostic(
    event: MessageReceivedEvent,
  ): MessageReceivedWithBlock {
    return {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      transactionIndex: event.transactionIndex,
      logIndex: event.logIndex,
      caller: event.args.caller,
      sourceDomain: event.args.sourceDomain,
      nonce: event.args.nonce,
      sender: event.args.sender,
      finalityThresholdExecuted: event.args.finalityThresholdExecuted,
      messageBody: event.args.messageBody,
    };
  }

  private convertMintAndWithdrawToChainAgnostic(
    event: MintAndWithdrawLog,
  ): MintAndWithdrawWithBlock {
    return {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      transactionIndex: event.transactionIndex,
      logIndex: event.logIndex,
      mintRecipient: event.args.mintRecipient,
      amount: event.args.amount.toString(),
      mintToken: event.args.mintToken,
      feeCollected: event.args.feeCollected.toString(),
    };
  }

  private convertMintEventsPairToChainAgnostic(
    pair: EvmMintEventsPair,
  ): MintEventsPair {
    return {
      messageReceived: this.convertMessageReceivedToChainAgnostic(
        pair.messageReceived,
      ),
      mintAndWithdraw: this.convertMintAndWithdrawToChainAgnostic(
        pair.mintAndWithdraw,
      ),
    };
  }

  private async matchDepositForBurnWithMessageSentEvents(
    depositForBurnEvents: DepositForBurnEvent[],
    messageSentEvents: MessageSentLog[],
  ) {
    const depositForBurnEventsMap = depositForBurnEvents.reduce(
      (acc, event) => {
        acc[event.transactionHash] = [
          ...(acc[event.transactionHash] || []),
          event,
        ];
        return acc;
      },
      {} as Record<string, DepositForBurnEvent[]>,
    );
    const messageSentEventsMap = messageSentEvents.reduce(
      (acc, event) => {
        acc[event.transactionHash] = [
          ...(acc[event.transactionHash] || []),
          event,
        ];
        return acc;
      },
      {} as Record<string, MessageSentLog[]>,
    );
    const transactionHashes = Object.keys(depositForBurnEventsMap);
    const burnEvents = transactionHashes.reduce(
      (acc, txHash) => {
        const sortedDepositForBurn = (
          depositForBurnEventsMap[txHash] as DepositForBurnEvent[]
        ).sort((a, b) => a.logIndex - b.logIndex);
        const sortedMessageSent = (
          messageSentEventsMap[txHash] as MessageSentLog[]
        ).sort((a, b) => a.logIndex - b.logIndex);
        const matchedPairs: EvmBurnEventsPair[] = [];
        const matchedMessageSentLogIndexes = new Set<number>();

        sortedDepositForBurn.forEach((depositForBurn) => {
          const matchedMessageSent = sortedMessageSent.find(
            (messageSent) =>
              messageSent.logIndex < depositForBurn.logIndex &&
              !matchedMessageSentLogIndexes.has(messageSent.logIndex),
          );

          if (matchedMessageSent) {
            matchedPairs.push({
              depositForBurn,
              messageSent: matchedMessageSent,
            });
            matchedMessageSentLogIndexes.add(matchedMessageSent.logIndex);
          }
        });
        acc[txHash] = matchedPairs;
        return acc;
      },
      {} as Record<string, EvmBurnEventsPair[]>,
    );
    return Object.values(burnEvents).flat();
  }

  private async matchMessageReceivedWithMintAndWithdrawEvents(
    messageReceivedEvents: MessageReceivedEvent[],
    mintAndWithdrawEvents: MintAndWithdrawLog[],
  ) {
    const messageReceivedEventsMap = messageReceivedEvents.reduce(
      (acc, event) => {
        acc[event.transactionHash] = [
          ...(acc[event.transactionHash] || []),
          event,
        ];
        return acc;
      },
      {} as Record<string, MessageReceivedEvent[]>,
    );
    const mintAndWithdrawEventsMap = mintAndWithdrawEvents.reduce(
      (acc, event) => {
        acc[event.transactionHash] = [
          ...(acc[event.transactionHash] || []),
          event,
        ];
        return acc;
      },
      {} as Record<string, MintAndWithdrawLog[]>,
    );
    const transactionHashes = Object.keys(messageReceivedEventsMap);
    const mintEvents = transactionHashes.reduce(
      (acc, txHash) => {
        const sortedMessageReceived = (
          messageReceivedEventsMap[txHash] as MessageReceivedEvent[]
        ).sort((a, b) => a.logIndex - b.logIndex);
        const sortedMintAndWithdraw = (
          mintAndWithdrawEventsMap[txHash] as MintAndWithdrawLog[]
        ).sort((a, b) => a.logIndex - b.logIndex);
        const matchedPairs: EvmMintEventsPair[] = [];
        const matchedMintAndWithdrawLogIndexes = new Set<number>();

        sortedMessageReceived.forEach((messageReceived) => {
          const matchedMintAndWithdraw = sortedMintAndWithdraw.find(
            (mintAndWithdraw) =>
              mintAndWithdraw.logIndex < messageReceived.logIndex &&
              !matchedMintAndWithdrawLogIndexes.has(mintAndWithdraw.logIndex),
          );

          if (matchedMintAndWithdraw) {
            matchedPairs.push({
              messageReceived,
              mintAndWithdraw: matchedMintAndWithdraw,
            });
            matchedMintAndWithdrawLogIndexes.add(
              matchedMintAndWithdraw.logIndex,
            );
          }
        });
        acc[txHash] = matchedPairs;
        return acc;
      },
      {} as Record<string, EvmMintEventsPair[]>,
    );
    return Object.values(mintEvents).flat();
  }
}
