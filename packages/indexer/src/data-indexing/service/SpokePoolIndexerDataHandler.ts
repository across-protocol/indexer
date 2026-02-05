import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import {
  getDeployedAddress,
  getDeployedBlockNumber,
} from "@across-protocol/contracts";
import { CHAIN_IDs } from "@across-protocol/constants";
import { ethers, providers } from "ethers";
import {
  entities,
  utils as indexerDatabaseUtils,
  SaveQueryResultType,
} from "@repo/indexer-database";
import { BlockRange } from "../model";
import {
  IndexerDataHandler,
  ProcessBlockRangeRequest,
} from "./IndexerDataHandler";

import * as utils from "../../utils";
import {
  SpokePoolRepository,
  StoreEventsResult,
} from "../../database/SpokePoolRepository";
import { CallsFailedRepository } from "../../database/CallsFailedRepository";
import { HyperliquidDepositHandlerRepository } from "../../database/HyperliquidDepositHandlerRepository";
import { SwapBeforeBridgeRepository } from "../../database/SwapBeforeBridgeRepository";
import { SwapMetadataRepository } from "../../database/SwapMetadataRepository";
import { SpokePoolProcessor } from "../../services/spokePoolProcessor";
import { IndexerQueues, IndexerQueuesService } from "../../messaging/service";
import { IntegratorIdMessage } from "../../messaging/IntegratorIdWorker";
import { getMaxBlockLookBack } from "../../web3/constants";
import { PriceMessage } from "../../messaging/priceWorker";
import { EventDecoder } from "../../web3/EventDecoder";
import { matchFillEventsWithTargetChainActions } from "../../utils/targetChainActionsUtils";

export type FetchEventsResult = {
  v3FundsDepositedEvents: utils.V3FundsDepositedWithIntegradorId[];
  filledV3RelayEvents: across.interfaces.FillWithBlock[];
  requestedV3SlowFillEvents: across.interfaces.SlowFillRequestWithBlock[];
  requestedSpeedUpV3Events: {
    [depositorAddress: string]: {
      [depositId: string]: across.interfaces.SpeedUpWithBlock[];
    };
  };
  relayedRootBundleEvents: across.interfaces.RootBundleRelayWithBlock[];
  executedRelayerRefundRootEvents: (across.interfaces.RelayerRefundExecutionWithBlock & {
    caller?: string;
    deferredRefunds: boolean;
  })[]; // TODO: Add missing properties to SDK types
  tokensBridgedEvents: (across.interfaces.TokensBridged & {
    caller?: string;
  })[]; // TODO: Add missing properties to SDK types
  claimedRelayerRefunds: across.interfaces.ClaimedRelayerRefundWithBlock[];
  blockTimes: Record<number, number>;
};

export type DepositSwapPair = {
  deposit: entities.V3FundsDeposited;
  swapBeforeBridge: entities.SwapBeforeBridge;
};

export type FillCallsFailedPair = {
  fill: entities.FilledV3Relay;
  callsFailed: entities.CallsFailed;
};

export type FillSwapMetadataPair = {
  fill: entities.FilledV3Relay;
  swapMetadata: entities.SwapMetadata;
};

export class SpokePoolIndexerDataHandler implements IndexerDataHandler {
  private isInitialized: boolean;
  private configStoreClient: across.clients.AcrossConfigStoreClient;
  private hubPoolClient: across.clients.HubPoolClient;

  constructor(
    private logger: Logger,
    private chainId: number,
    private hubPoolChainId: number,
    private provider: across.providers.RetryProvider,
    private configStoreFactory: utils.ConfigStoreClientFactory,
    private hubPoolFactory: utils.HubPoolClientFactory,
    private spokePoolFactory: utils.SpokePoolClientFactory,
    private spokePoolClientRepository: SpokePoolRepository,
    private swapBeforeBridgeRepository: SwapBeforeBridgeRepository,
    private callsFailedRepository: CallsFailedRepository,
    private swapMetadataRepository: SwapMetadataRepository,
    private hyperliquidDepositHandlerRepository: HyperliquidDepositHandlerRepository,
    private spokePoolProcessor: SpokePoolProcessor,
    private indexerQueuesService: IndexerQueuesService,
  ) {
    this.isInitialized = false;
  }

  private initialize() {
    this.configStoreClient = this.configStoreFactory.get(this.hubPoolChainId);
    this.hubPoolClient = this.hubPoolFactory.get(
      this.hubPoolChainId,
      undefined,
      undefined,
      {
        configStoreClient: this.configStoreClient,
      },
    );
  }

  public getDataIdentifier() {
    return `${getDeployedAddress("SpokePool", this.chainId)}:${this.chainId}`;
  }
  public getStartIndexingBlockNumber() {
    return getDeployedBlockNumber("SpokePool", this.chainId);
  }

  public async processBlockRange(request: ProcessBlockRangeRequest) {
    const { blockRange, lastFinalisedBlock, isBackfilling = false } = request;
    this.logger.debug({
      at: "Indexer#SpokePoolIndexerDataHandler#processBlockRange",
      message: `Processing block range ${this.getDataIdentifier()}`,
      blockRange,
      lastFinalisedBlock,
      isBackfilling,
    });

    if (!this.isInitialized) {
      this.initialize();
      this.isInitialized = true;
    }

    //FIXME: Remove performance timing
    const startPerfTime = performance.now();

    const events = await this.fetchEventsByRange(blockRange, isBackfilling);
    const requestedSpeedUpV3EventsCount = Object.values(
      events.requestedSpeedUpV3Events,
    ).reduce((acc, speedUps) => {
      return acc + Object.values(speedUps).length;
    }, 0);

    //FIXME: Remove performance timing
    const timeToFetchEvents = performance.now();

    this.logger.debug({
      at: "Indexer#SpokePoolIndexerDataHandler#processBlockRange",
      message: `Found events for ${this.getDataIdentifier()}`,
      events: {
        v3FundsDepositedEvents: events.v3FundsDepositedEvents.length,
        filledV3RelayEvents: events.filledV3RelayEvents.length,
        requestedV3SlowFillEvents: events.requestedV3SlowFillEvents.length,
        requestedSpeedUpV3Events: requestedSpeedUpV3EventsCount,
        relayedRootBundleEvents: events.relayedRootBundleEvents.length,
        executedRelayerRefundRootEvents:
          events.executedRelayerRefundRootEvents.length,
        tokensBridgedEvents: events.tokensBridgedEvents.length,
        claimedRelayerRefunds: events.claimedRelayerRefunds.length,
      },
      blockRange,
    });
    const storedEvents = await this.storeEvents(events, lastFinalisedBlock);
    const storedDeposits = storedEvents.deposits.map((d) => d.data);
    const storedFills = storedEvents.fills.map((f) => f.data);

    // Fetch transaction receipts to extract gas consumption data and associated events:
    // - Deposits: SwapBeforeBridge
    // - Fills: CallsFailed, SwapMetadata, UserAccountActivated
    const transactionReceipts = await this.getTransactionReceiptsForEvents([
      ...storedDeposits,
      ...storedFills,
    ]);

    const depositSwapPairs = await this.matchDepositEventsWithSwapEvents(
      storedDeposits,
      transactionReceipts,
      lastFinalisedBlock,
    );

    const fillCallsFailedPairs =
      await this.matchFillEventsWithCallsFailedEvents(
        storedFills,
        transactionReceipts,
        lastFinalisedBlock,
      );

    const fillSwapMetadataPairs =
      await this.matchFillEventsWithSwapMetadataEvents(
        storedFills,
        transactionReceipts,
        lastFinalisedBlock,
      );

    await this.extractAndSaveUserAccountActivatedEvents(
      storedFills,
      transactionReceipts,
      lastFinalisedBlock,
      events.blockTimes,
    );

    // Match fill events with target chain action events
    const fillTargetChainActionPairs = matchFillEventsWithTargetChainActions(
      storedFills,
      transactionReceipts,
    );

    if (fillTargetChainActionPairs.length > 0) {
      this.logger.debug({
        at: "Indexer#SpokePoolIndexerDataHandler#processBlockRange",
        message:
          "Found fill transactions with target chain action destinations",
        count: fillTargetChainActionPairs.length,
        pairs: fillTargetChainActionPairs.map((pair) => ({
          fillEventId: pair.fill.id,
          transactionHash: pair.fill.transactionHash,
          destinationChainId: pair.fill.destinationChainId,
          outputAmount: pair.fill.outputAmount,
          actionsTargetChainId: pair.actionsTargetChainId,
        })),
      });
    }

    //FIXME: Remove performance timing
    const timeToStoreEvents = performance.now();

    // Delete unfinalised events
    const [deletedDeposits, _, __] = await Promise.all([
      this.spokePoolClientRepository.deleteUnfinalisedDepositEvents(
        this.chainId,
        lastFinalisedBlock,
      ),
      this.swapBeforeBridgeRepository.deleteUnfinalisedSwapEvents(
        this.chainId,
        lastFinalisedBlock,
      ),
      this.hyperliquidDepositHandlerRepository.deleteUnfinalisedUserAccountActivatedEvents(
        this.chainId,
        lastFinalisedBlock,
      ),
    ]);
    const timeToDeleteDeposits = performance.now();
    const newInsertedDeposits = indexerDatabaseUtils.filterSaveQueryResults(
      storedEvents.deposits,
      SaveQueryResultType.Inserted,
    );
    await this.updateNewDepositsWithIntegratorId(newInsertedDeposits);

    //FIXME: Remove performance timing
    const timeToUpdateDepositIds = performance.now();
    const fillsGasFee = await this.getFillsGasFee(transactionReceipts);
    await this.spokePoolProcessor.process(
      storedEvents,
      deletedDeposits,
      depositSwapPairs,
      fillCallsFailedPairs,
      fillSwapMetadataPairs,
      fillTargetChainActionPairs,
      fillsGasFee,
    );

    //FIXME: Remove performance timing
    const timeToProcessDeposits = performance.now();

    // this.profileStoreEvents(storedEvents);

    // publish new relays to workers to fill in prices
    await this.publishNewRelays(storedEvents);
    await this.publishSwaps(depositSwapPairs);

    //FIXME: Remove performance timing
    const finalPerfTime = performance.now();

    this.logger.debug({
      at: "Indexer#SpokePoolIndexerDataHandler#processBlockRange",
      message:
        "System Time Log for SpokePoolIndexerDataHandler#processBlockRange",
      spokeChainId: this.chainId,
      blockRange: blockRange,
      timeToFetchEvents: timeToFetchEvents - startPerfTime,
      timeToStoreEvents: timeToStoreEvents - timeToFetchEvents,
      timeToDeleteDeposits: timeToDeleteDeposits - timeToStoreEvents,
      timeToUpdateDepositIds: timeToUpdateDepositIds - timeToDeleteDeposits,
      timeToProcessDeposits: timeToProcessDeposits - timeToUpdateDepositIds,
      timeToProcessAnciliaryEvents: finalPerfTime - timeToProcessDeposits,
      finalTime: finalPerfTime - startPerfTime,
    });
  }

  /**
   * Function that matches the new deposit events with swap events
   * 1. for all new deposits transactions, fetch the transaction receipt
   * 2. for each tx receipt, get SwapBeforeBridge events
   * 3. insert the swap events into the database
   * 4. group the deposit events and swap events by the transaction hash
   */
  private async matchDepositEventsWithSwapEvents(
    deposits: entities.V3FundsDeposited[],
    transactionReceipts: Record<string, providers.TransactionReceipt>,
    lastFinalisedBlock: number,
  ) {
    const transactionReceiptsList = Object.values(transactionReceipts);
    const swapBeforeBridgeEvents = transactionReceiptsList
      .map((transactionReceipt) => [
        ...EventDecoder.decodeSwapBeforeBridgeEvents(transactionReceipt),
        ...EventDecoder.decodeSpokePoolPeripherySwapBeforeBridgeEvents(
          transactionReceipt,
        ),
      ])
      .flat();
    /**
     * this calls `saveAndHandleFinalisation()` from the `BlockchainEventRepository`. Not sure if this is the best way to do it
     * because if the event is already in the database, it will not be returned (result: 'nothing').
     */
    const saveResult =
      await this.swapBeforeBridgeRepository.formatAndSaveSwapBeforeBridgeEvents(
        swapBeforeBridgeEvents,
        this.chainId,
        lastFinalisedBlock,
      );
    const insertedSwapBeforeBridgeEvents =
      indexerDatabaseUtils.filterSaveQueryResults(
        saveResult,
        SaveQueryResultType.Inserted,
      );
    const depositsAndSwapsByTxHash = insertedSwapBeforeBridgeEvents.reduce(
      (acc, swapBeforeBridge) => {
        acc[swapBeforeBridge.transactionHash] = {
          deposits: deposits.filter(
            (d) =>
              d.transactionHash.toLowerCase() ===
              swapBeforeBridge.transactionHash.toLowerCase(),
          ),
          swapBeforeBridges: insertedSwapBeforeBridgeEvents.filter(
            (s) =>
              s.transactionHash.toLowerCase() ===
              swapBeforeBridge.transactionHash.toLowerCase(),
          ),
        };
        return acc;
      },
      {} as Record<
        string,
        {
          deposits: entities.V3FundsDeposited[];
          swapBeforeBridges: entities.SwapBeforeBridge[];
        }
      >,
    );

    // match the deposit with the swap before
    const depositSwapMap = Object.values(depositsAndSwapsByTxHash)
      .map((depositAndSwap) => {
        const { deposits, swapBeforeBridges } = depositAndSwap;
        const sortedDeposits = deposits.sort((a, b) => a.logIndex - b.logIndex);
        const sortedSwapBeforeBridges = swapBeforeBridges.sort(
          (a, b) => a.logIndex - b.logIndex,
        );
        const matchedPairs: DepositSwapPair[] = [];
        const usedSwaps = new Set<number>(); // Track used swaps by their log index

        sortedDeposits.forEach((deposit) => {
          const matchingSwap = sortedSwapBeforeBridges.find(
            (swap) =>
              swap.logIndex < deposit.logIndex && !usedSwaps.has(swap.logIndex),
          );
          if (matchingSwap) {
            matchedPairs.push({ deposit, swapBeforeBridge: matchingSwap });
            usedSwaps.add(matchingSwap.logIndex); // Mark this swap as used
          }
        });

        return matchedPairs;
      })
      .flat();
    return depositSwapMap;
  }

  /**
   * Function that matches the new FilledRelay events with CallsFailed events
   * 1. for each tx receipt, get CallsFailed events
   * 2. insert the CallsFailed events into the database
   * 3. group the FilledRelay and CallsFailed events by transaction hash
   */
  private async matchFillEventsWithCallsFailedEvents(
    fills: entities.FilledV3Relay[],
    transactionReceipts: Record<string, providers.TransactionReceipt>,
    lastFinalisedBlock: number,
  ) {
    const transactionReceiptsList = Object.values(transactionReceipts);
    const callsFailedEvents = transactionReceiptsList
      .map((transactionReceipt) =>
        EventDecoder.decodeCallsFailedEvents(transactionReceipt),
      )
      .flat();
    const saveResult =
      await this.callsFailedRepository.formatAndSaveCallsFailedEvents(
        callsFailedEvents,
        this.chainId,
        lastFinalisedBlock,
      );
    const insertedCallsFailedEvents =
      indexerDatabaseUtils.filterSaveQueryResults(
        saveResult,
        SaveQueryResultType.Inserted,
      );
    const fillsAndCallsFailedByTxHash = insertedCallsFailedEvents.reduce(
      (acc, callsFailed) => {
        acc[callsFailed.transactionHash] = {
          fills: fills.filter(
            (f) =>
              f.transactionHash.toLowerCase() ===
              callsFailed.transactionHash.toLowerCase(),
          ),
          callsFailedEvents: insertedCallsFailedEvents.filter(
            (c) =>
              c.transactionHash.toLowerCase() ===
              callsFailed.transactionHash.toLowerCase(),
          ),
        };
        return acc;
      },
      {} as Record<
        string,
        {
          fills: entities.FilledV3Relay[];
          callsFailedEvents: entities.CallsFailed[];
        }
      >,
    );

    // match the fill with the CallsFailed event
    const fillCallsFailedMap = Object.values(fillsAndCallsFailedByTxHash)
      .map((fillAndCallsFailed) => {
        const { fills, callsFailedEvents } = fillAndCallsFailed;
        // Only consider fills that include actions
        const fillsWithActions = fills.filter(
          (fill) =>
            !across.utils.isFillOrSlowFillRequestMessageEmpty(
              fill.updatedMessage,
            ),
        );
        const sortedFills = fillsWithActions.sort(
          (a, b) => a.logIndex - b.logIndex,
        );
        const sortedCallsFailedEvents = callsFailedEvents.sort(
          (a, b) => a.logIndex - b.logIndex,
        );
        const matchedPairs: FillCallsFailedPair[] = [];
        const usedCallsFailed = new Set<number>(); // Track used CallsFailed by their log index

        sortedFills.forEach((fill) => {
          const matchingCallsFailed = sortedCallsFailedEvents.find(
            (callsFailed) =>
              callsFailed.logIndex > fill.logIndex &&
              !usedCallsFailed.has(callsFailed.logIndex),
          );
          if (matchingCallsFailed) {
            matchedPairs.push({ fill, callsFailed: matchingCallsFailed });
            usedCallsFailed.add(matchingCallsFailed.logIndex); // Mark this CallsFailed as used
          }
        });

        return matchedPairs;
      })
      .flat();
    return fillCallsFailedMap;
  }

  private async matchFillEventsWithSwapMetadataEvents(
    fills: entities.FilledV3Relay[],
    transactionReceipts: Record<string, providers.TransactionReceipt>,
    lastFinalisedBlock: number,
  ) {
    const transactionReceiptsList = Object.values(transactionReceipts);
    const swapMetadataEvents = transactionReceiptsList
      .map((transactionReceipt) =>
        EventDecoder.decodeSwapMetadataEvents(transactionReceipt),
      )
      .flat();

    const saveResult =
      await this.swapMetadataRepository.formatAndSaveSwapMetadataEvents(
        swapMetadataEvents,
        this.chainId,
        lastFinalisedBlock,
      );

    const savedSwapMetadataEvents = saveResult
      .map((result) => result.data)
      .filter((data) => data !== undefined);

    const fillsAndSwapMetadataByTxHash = savedSwapMetadataEvents.reduce(
      (acc, swapMetadata) => {
        acc[swapMetadata.transactionHash] = {
          fills: fills.filter(
            (f) =>
              f.transactionHash.toLowerCase() ===
              swapMetadata.transactionHash.toLowerCase(),
          ),
          swapMetadataEvents: savedSwapMetadataEvents.filter(
            (s) =>
              s.transactionHash.toLowerCase() ===
              swapMetadata.transactionHash.toLowerCase(),
          ),
        };
        return acc;
      },
      {} as Record<
        string,
        {
          fills: entities.FilledV3Relay[];
          swapMetadataEvents: entities.SwapMetadata[];
        }
      >,
    );

    // match the fill with the SwapMetadata event
    const fillSwapMetadataMap = (
      Object.values(fillsAndSwapMetadataByTxHash) as {
        fills: entities.FilledV3Relay[];
        swapMetadataEvents: entities.SwapMetadata[];
      }[]
    )
      .map((fillAndSwapMetadata) => {
        const { fills, swapMetadataEvents } = fillAndSwapMetadata;
        const sortedFills = fills.sort(
          (a: entities.FilledV3Relay, b: entities.FilledV3Relay) =>
            a.logIndex - b.logIndex,
        );
        const sortedSwapMetadataEvents = swapMetadataEvents.sort(
          (a: entities.SwapMetadata, b: entities.SwapMetadata) =>
            a.logIndex - b.logIndex,
        );
        const matchedPairs: FillSwapMetadataPair[] = [];
        const usedSwapMetadata = new Set<number>(); // Track used SwapMetadata by their log index

        sortedFills.forEach((fill: entities.FilledV3Relay) => {
          // Find all SwapMetadata events that come after this fill
          const matchingSwapMetadataEvents = sortedSwapMetadataEvents.filter(
            (swapMetadata: entities.SwapMetadata) =>
              swapMetadata.logIndex > fill.logIndex &&
              !usedSwapMetadata.has(swapMetadata.logIndex),
          );

          // Match each SwapMetadata with this fill
          matchingSwapMetadataEvents.forEach((swapMetadata) => {
            matchedPairs.push({ fill, swapMetadata });
            usedSwapMetadata.add(swapMetadata.logIndex); // Mark this SwapMetadata as used
          });
        });

        return matchedPairs;
      })
      .flat();
    return fillSwapMetadataMap;
  }

  private async extractAndSaveUserAccountActivatedEvents(
    fills: entities.FilledV3Relay[],
    transactionReceipts: Record<string, providers.TransactionReceipt>,
    lastFinalisedBlock: number,
    blockTimes: Record<number, number>,
  ) {
    // Only process UserAccountActivated events on HyperEVM chain
    if (this.chainId !== CHAIN_IDs.HYPEREVM) {
      return;
    }

    const fillTxnReceipts = fills
      .map((fill) => transactionReceipts[fill.transactionHash.toLowerCase()])
      .filter((receipt) => receipt !== undefined);

    const userAccountActivatedEvents = fillTxnReceipts
      .map((receipt) => EventDecoder.decodeUserAccountActivatedEvents(receipt))
      .flat();

    await this.hyperliquidDepositHandlerRepository.formatAndSaveUserAccountActivatedEvents(
      userAccountActivatedEvents,
      this.chainId,
      lastFinalisedBlock,
      blockTimes,
    );
  }

  /**
   * Fetches the transaction receipts for the given events and returns a map of transaction hash to transaction receipt.
   * The transaction hash key is lowercased.
   */
  private async getTransactionReceiptsForEvents(
    events: (entities.V3FundsDeposited | entities.FilledV3Relay)[],
  ) {
    // avoid fetching the same transaction receipt multiple times
    const uniqueTxHashes = [
      ...new Set(events.map((e) => e.transactionHash.toLowerCase())),
    ];
    const transactionReceipts = await across.utils.mapAsync(
      uniqueTxHashes,
      async (txHash) => {
        const receipt = await this.provider.getTransactionReceipt(txHash);
        if (!receipt) {
          this.logger.warn({
            at: "SpokePoolIndexerDataHandler#matchDepositEventsWithSwapEvents",
            message: `Transaction receipt not found`,
            txHash,
            chainId: this.chainId,
          });
        }
        return receipt;
      },
    );
    const validTransactionReceipts = transactionReceipts.filter(
      (receipt) => !!receipt,
    );
    const transactionReceiptsByTxHash = validTransactionReceipts.reduce(
      (acc, receipt) => {
        acc[receipt.transactionHash.toLowerCase()] = receipt;
        return acc;
      },
      {} as Record<string, providers.TransactionReceipt>,
    );

    return transactionReceiptsByTxHash;
  }

  /**
   * Log the time that it took to store the events from the moment they were emitted onchain
   * @param events
   */
  private profileStoreEvents(events: StoreEventsResult) {
    const insertedDeposits = indexerDatabaseUtils.filterSaveQueryResults(
      events.deposits,
      SaveQueryResultType.Inserted,
    );

    // Log the time difference for each deposit event for profiling in datadog
    insertedDeposits.forEach((event) => {
      if (event.blockTimestamp === undefined) return;
      const timeDifference =
        event.createdAt.getTime() - event.blockTimestamp.getTime();
      this.logger.debug({
        at: "SpokePoolIndexerDataHandler#profileStoreEvents",
        message: "V3FundsDeposited event profile",
        depositId: event.depositId,
        originChainId: event.originChainId,
        timeDifference,
        createdAt: event.createdAt,
        blockTimestamp: event.blockTimestamp,
      });
    });

    const insertedFills = indexerDatabaseUtils.filterSaveQueryResults(
      events.fills,
      SaveQueryResultType.Inserted,
    );
    insertedFills.forEach((event) => {
      if (event.blockTimestamp === undefined) return;
      const timeDifference =
        event.createdAt.getTime() - event.blockTimestamp.getTime();
      this.logger.debug({
        at: "SpokePoolIndexerDataHandler#profileStoreEvents",
        message: "FilledV3Relay event profile",
        depositId: event.depositId,
        originChainId: event.originChainId,
        destinationChainId: event.destinationChainId,
        timeDifference,
        createdAt: event.createdAt,
        blockTimestamp: event.blockTimestamp,
      });
    });
  }

  private async getBlockTime(blockNumber: number): Promise<number> {
    const block = await this.provider.getBlock(blockNumber);
    if (!block) {
      throw new Error(`Block with number ${blockNumber} not found`);
    }
    return block.timestamp;
  }

  private async getBlockTimes(
    blockNumbers: number[],
  ): Promise<Record<number, number>> {
    const uniqueBlockNumbers = [...new Set(blockNumbers)];
    const timestamps = await Promise.all(
      uniqueBlockNumbers.map((blockNumber) => this.getBlockTime(blockNumber)),
    );

    const blockTimestamps = uniqueBlockNumbers.reduce(
      (acc, blockNumber, index) => {
        if (timestamps[index] === undefined) {
          throw new Error(`Block time for block ${blockNumber} not found`);
        }
        acc[blockNumber] = timestamps[index]!;
        return acc;
      },
      {} as Record<number, number>,
    );
    return blockTimestamps;
  }

  private async fetchEventsByRange(
    blockRange: BlockRange,
    isBackfilling: boolean,
  ): Promise<FetchEventsResult> {
    const { configStoreClient, hubPoolClient } = this;

    // If we are in a backfilling state then we should grab the largest
    // lookback available to us. Otherwise, for this specific indexer we
    // only need exactly what we're looking for, plus some padding to be
    // sure
    const maxBlockLookback = isBackfilling
      ? getMaxBlockLookBack(this.chainId)
      : Math.min(
          getMaxBlockLookBack(this.chainId),
          (blockRange.to - blockRange.from) * 2,
        );

    const spokePoolClient = await this.spokePoolFactory.get(
      this.chainId,
      blockRange.from,
      blockRange.to,
      {
        hubPoolClient: this.hubPoolClient,
        disableQuoteBlockLookup: true,
        maxBlockLookback,
      },
      false,
    );

    const initialTime = performance.now();

    await configStoreClient.update();
    await hubPoolClient.update([
      "SetPoolRebalanceRoute",
      "CrossChainContractsSet",
    ]);

    const timeToUpdateProtocolClients = performance.now();
    // We aim to avoid the unneeded update events
    // Specifically, we avoid the EnabledDepositRoute event because this
    // requires a lookback to the deployment block of the SpokePool contract.
    await spokePoolClient.update([
      "ClaimedRelayerRefund",
      "ExecutedRelayerRefundRoot",
      "FilledRelay",
      "FundsDeposited",
      "RelayedRootBundle",
      "RequestedSlowFill",
      "RequestedSpeedUpDeposit",
      "TokensBridged",
    ]);
    const timeToUpdateSpokePoolClient = performance.now();

    const v3FundsDepositedEvents = spokePoolClient.getDeposits({
      fromBlock: blockRange.from,
      toBlock: blockRange.to,
    });
    const filledV3RelayEvents = spokePoolClient.getFills();
    const requestedV3SlowFillEvents = spokePoolClient.getSlowFillRequests();
    const requestedSpeedUpV3Events = spokePoolClient.getSpeedUps();
    const relayedRootBundleEvents = spokePoolClient.getRootBundleRelays();
    const executedRelayerRefundRootEvents =
      spokePoolClient.getRelayerRefundExecutions() as FetchEventsResult["executedRelayerRefundRootEvents"];
    const tokensBridgedEvents =
      spokePoolClient.getTokensBridged() as FetchEventsResult["tokensBridgedEvents"];
    const claimedRelayerRefunds = spokePoolClient.getClaimedRelayerRefunds();
    // getBlockTimes function will make sure we dont query more than we need to.
    const blockNumbers = [
      ...v3FundsDepositedEvents.map((deposit) => deposit.blockNumber),
      ...filledV3RelayEvents.map((fill) => fill.blockNumber),
    ];

    const startTimeToGetBlockTimes = performance.now();
    const blockTimes = await this.getBlockTimes(blockNumbers);
    const endTimeToGetBlockTimes = performance.now();

    this.logger.debug({
      at: "SpokePoolIndexerDataHandler#fetchEventsByRange",
      message: "Time to update protocol clients",
      timeToUpdateProtocolClients: timeToUpdateProtocolClients - initialTime,
      timeToUpdateSpokePoolClient:
        timeToUpdateSpokePoolClient - timeToUpdateProtocolClients,
      timeToGetBlockTimes: endTimeToGetBlockTimes - startTimeToGetBlockTimes,
      totalTime: endTimeToGetBlockTimes - initialTime,
      spokeChainId: this.chainId,
      blockRange: blockRange,
      isBackfilling,
      dynamicMaxBlockLookback: maxBlockLookback,
    });

    return {
      v3FundsDepositedEvents,
      filledV3RelayEvents,
      requestedV3SlowFillEvents,
      requestedSpeedUpV3Events,
      relayedRootBundleEvents,
      executedRelayerRefundRootEvents,
      tokensBridgedEvents,
      claimedRelayerRefunds,
      blockTimes,
    };
  }

  private async storeEvents(
    params: FetchEventsResult,
    lastFinalisedBlock: number,
  ): Promise<StoreEventsResult> {
    const { spokePoolClientRepository } = this;
    const {
      v3FundsDepositedEvents,
      filledV3RelayEvents,
      requestedV3SlowFillEvents,
      requestedSpeedUpV3Events,
      relayedRootBundleEvents,
      executedRelayerRefundRootEvents,
      tokensBridgedEvents,
      claimedRelayerRefunds,
      blockTimes,
    } = params;
    const [
      savedV3FundsDepositedEvents,
      savedV3RequestedSlowFills,
      savedFilledV3RelayEvents,
      savedExecutedRelayerRefundRootEvents,
    ] = await Promise.all([
      spokePoolClientRepository.formatAndSaveV3FundsDepositedEvents(
        v3FundsDepositedEvents,
        lastFinalisedBlock,
        blockTimes,
      ),
      spokePoolClientRepository.formatAndSaveRequestedV3SlowFillEvents(
        requestedV3SlowFillEvents,
        lastFinalisedBlock,
      ),
      spokePoolClientRepository.formatAndSaveFilledV3RelayEvents(
        filledV3RelayEvents,
        lastFinalisedBlock,
        blockTimes,
      ),
      spokePoolClientRepository.formatAndSaveExecutedRelayerRefundRootEvents(
        executedRelayerRefundRootEvents,
        lastFinalisedBlock,
      ),
      spokePoolClientRepository.formatAndSaveRequestedSpeedUpV3Events(
        requestedSpeedUpV3Events,
        lastFinalisedBlock,
      ),
      spokePoolClientRepository.formatAndSaveRelayedRootBundleEvents(
        relayedRootBundleEvents,
        this.chainId,
        lastFinalisedBlock,
      ),
      spokePoolClientRepository.formatAndSaveTokensBridgedEvents(
        tokensBridgedEvents,
        lastFinalisedBlock,
      ),
      spokePoolClientRepository.formatAndSaveClaimedRelayerRefunds(
        claimedRelayerRefunds,
        this.chainId,
        lastFinalisedBlock,
      ),
    ]);
    return {
      deposits: savedV3FundsDepositedEvents,
      fills: savedFilledV3RelayEvents,
      slowFillRequests: savedV3RequestedSlowFills,
      executedRefundRoots: savedExecutedRelayerRefundRootEvents,
    };
  }

  private async updateNewDepositsWithIntegratorId(
    deposits: entities.V3FundsDeposited[],
  ) {
    await across.utils.forEachAsync(deposits, async (deposit) => {
      const integratorId = await utils.getIntegratorId(
        this.provider,
        deposit.quoteTimestamp,
        deposit.transactionHash,
      );
      if (integratorId) {
        await this.spokePoolClientRepository.updateDepositEventWithIntegratorId(
          deposit.id,
          integratorId,
        );
      }
    });
  }

  private async publishNewRelays(storedEvents: StoreEventsResult) {
    // fetch prices only for new fills
    const fills = indexerDatabaseUtils.filterSaveQueryResults(
      storedEvents.fills,
      SaveQueryResultType.Inserted,
    );
    const messages: PriceMessage[] = fills.map((fill) => ({
      fillEventId: fill.id,
    }));

    await this.indexerQueuesService.publishMessagesBulk(
      IndexerQueues.PriceQuery,
      IndexerQueues.PriceQuery, // Use queue name as job name
      messages,
    );
  }
  private async publishSwaps(swapDepositPairs: DepositSwapPair[]) {
    const messages = swapDepositPairs.map((pair) => ({
      swapEventId: pair.swapBeforeBridge.id,
    }));
    await this.indexerQueuesService.publishMessagesBulk(
      IndexerQueues.SwapMessage,
      IndexerQueues.SwapMessage, // Use queue name as job name
      messages,
    );
  }
  private async publishIntegratorIdMessages(
    deposits: entities.V3FundsDeposited[],
  ) {
    const messages: IntegratorIdMessage[] = deposits.map((deposit) => {
      return {
        relayHash: deposit.relayHash,
      };
    });
    await this.indexerQueuesService.publishMessagesBulk(
      IndexerQueues.IntegratorId,
      IndexerQueues.IntegratorId, // Use queue name as job name
      messages,
    );
  }

  private async getFillsGasFee(
    txReceipts: Record<string, ethers.providers.TransactionReceipt>,
  ): Promise<Record<string, bigint | undefined>> {
    return Object.keys(txReceipts).reduce(
      (acc, txHash) => {
        acc[txHash] = txReceipts[txHash]!.gasUsed.mul(
          txReceipts[txHash]!.effectiveGasPrice,
        ).toBigInt();
        return acc;
      },
      {} as Record<string, bigint | undefined>,
    );
  }
}
