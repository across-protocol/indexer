import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import {
  getDeployedAddress,
  getDeployedBlockNumber,
  SvmSpokeClient,
} from "@across-protocol/contracts";
import { Signature, Address, UnixTimestamp } from "@solana/kit";

import * as utils from "../../utils";
import { BlockRange } from "../model";
import { IndexerDataHandler } from "./IndexerDataHandler";
import { getMaxBlockLookBack } from "../../web3/constants";
import { SvmProvider } from "../../web3/RetryProvidersFactory";

export type FetchEventsResult = {
  depositEvents: any; // TODO: fix type. Needs SDK changes
  fillEvents: any; // TODO: fix type. Needs SDK changes
};

// TODO: Export this type from the SDK and use it from there.
export type EventData =
  | SvmSpokeClient.FilledRelay
  | SvmSpokeClient.FundsDeposited;

// TODO: Export this type from the SDK and use it from there.
export enum SVMEventNames {
  FilledRelay = "FilledRelay",
  FundsDeposited = "FundsDeposited",
}

// TODO: Export this type from the SDK and use it from there.
export type EventName = keyof typeof SVMEventNames;

// TODO: Export this type from the SDK and use it from there.
export type EventWithData<T extends EventData> = {
  confirmationStatus: string | null;
  blockTime: UnixTimestamp | null;
  signature: Signature;
  slot: bigint;
  name: EventName;
  data: T;
  program: Address;
};

// Teach BigInt how to be represented as JSON.
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
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

    await this.updateNewDepositsWithIntegratorId(events.depositEvents);

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

    const spokePoolClient = await across.arch.svm.SvmCpiEventsClient.create(
      this.provider,
    );
    // NOTE: svm spoke client uses bigint
    const fromSlot = BigInt(blockRange.from);
    const toSlot = BigInt(blockRange.to);

    const depositEvents = await spokePoolClient.queryEvents(
      "FundsDeposited",
      fromSlot,
      toSlot,
    );
    const fillEvents = await spokePoolClient.queryEvents(
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

  private async updateNewDepositsWithIntegratorId(
    deposits: EventWithData<SvmSpokeClient.FundsDeposited>[],
  ) {
    await across.utils.forEachAsync(deposits, async (deposit) => {
      const integratorId = await utils.getSvmIntegratorId(
        this.provider,
        deposit.signature,
      );
      if (integratorId) {
        // TODO: update deposit with integrator id when we are storing them in the database
      }
    });
  }
}
