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
  ) {
    const chainIdColumn = "chainId";
    const [
      oftSentEvents,
      oftReceivedEvents,
      simpleTransferFlowCompletedEvents,
      fallbackHyperEVMFlowCompletedEvents,
      arbitraryActionsExecutedEvents,
      sponsoredAccountActivationEvents,
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
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.FallbackHyperEVMFlowCompleted,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.ArbitraryActionsExecuted,
      ),
      this.deleteUnfinalisedEvents(
        chainId,
        chainIdColumn,
        lastFinalisedBlock,
        entities.SponsoredAccountActivation,
      ),
    ]);

    return {
      oftSentEvents,
      oftReceivedEvents,
      simpleTransferFlowCompletedEvents,
      fallbackHyperEVMFlowCompletedEvents,
      arbitraryActionsExecutedEvents,
      sponsoredAccountActivationEvents,
    };
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
}
