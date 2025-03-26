import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import {
  getDeployedAddress,
  getDeployedBlockNumber,
  SvmSpokeClient,
} from "@across-protocol/contracts";

import { BlockRange } from "../model";
import { IndexerDataHandler } from "./IndexerDataHandler";

import { getMaxBlockLookBack } from "../../web3/constants";
import { SvmProvider } from "../../web3/RetryProvidersFactory";

export type FetchEventsResult = {
  depositEvents: any; // TODO: fix type. Needs SDK changes
  fillEvents: any; // TODO: fix type. Needs SDK changes
};

export class SvmSpokePoolIndexerDataHandler implements IndexerDataHandler {
  constructor(
    private logger: Logger,
    private chainId: number,
    private hubPoolChainId: number,
    private provider: SvmProvider,
  ) {}

  public getDataIdentifier() {
    return `${getDeployedAddress("SvmSpoke", this.chainId)}:${this.chainId}`;
  }

  public getStartIndexingBlockNumber() {
    return getDeployedBlockNumber("SvmSpoke", this.chainId);
  }

  public async processBlockRange(
    blockRange: BlockRange,
    lastFinalisedBlock: number,
    isBackfilling: boolean = false,
  ) {
    this.logger.debug({
      at: "Indexer#SvmSpokePoolIndexerDataHandler#processBlockRange",
      message: `Processing block range ${this.getDataIdentifier()}`,
      blockRange,
      lastFinalisedBlock,
      isBackfilling,
    });

    const events = await this.fetchEventsByRange(blockRange, isBackfilling);

    this.logger.debug({
      at: "Indexer#SpokePoolIndexerDataHandler#processBlockRange",
      message: `Found events for ${this.getDataIdentifier()}`,
      events: {
        depositEvents: events.depositEvents.length,
        fillEvents: events.fillEvents.length,
      },
      blockRange,
    });

    // TODO:
    // - store events
    // - get block times
    // - delete unfinalised events
    // - update new deposits with integrator id
    // - process events
    // - publish price messages
  }

  private async fetchEventsByRange(
    blockRange: BlockRange,
    isBackfilling: boolean,
  ): Promise<FetchEventsResult> {
    // NOTE: maxBlockLookback is not a supported config in the svm client. Add when supported.
    // If we are in a backfilling state then we should grab the largest
    // lookback available to us. Otherwise, for this specific indexer we
    // only need exactly what we're looking for, plus some padding to be sure
    const maxBlockLookback = isBackfilling
      ? getMaxBlockLookBack(this.chainId)
      : Math.min(
          getMaxBlockLookBack(this.chainId),
          (blockRange.to - blockRange.from) * 2,
        );

    const spokePoolClient = await across.svm.SvmSpokeEventsClient.create(
      this.provider,
    );
    // NOTE: svm spoke client uses bigint
    const fromSlot = BigInt(blockRange.from);
    const toSlot = BigInt(blockRange.to);

    const depositEvents =
      await spokePoolClient.queryEvents<SvmSpokeClient.FundsDeposited>(
        "FundsDeposited",
        fromSlot,
        toSlot,
      );
    const fillEvents =
      await spokePoolClient.queryEvents<SvmSpokeClient.FilledRelay>(
        "FilledRelay",
        fromSlot,
        toSlot,
      );

    // NOTE: we can log events for now as it should be a short list
    if (depositEvents.length > 0) {
      this.logger.debug({
        at: "Indexer#SvmSpokePoolIndexerDataHandler#processBlockRange",
        message: `Found deposit events for ${this.getDataIdentifier()}`,
        depositEvents,
        blockRange,
      });
    }

    if (fillEvents.length > 0) {
      this.logger.debug({
        at: "Indexer#SvmSpokePoolIndexerDataHandler#processBlockRange",
        message: `Found fill events for ${this.getDataIdentifier()}`,
        fillEvents,
        blockRange,
      });
    }

    return {
      depositEvents,
      fillEvents,
    };
  }
}
