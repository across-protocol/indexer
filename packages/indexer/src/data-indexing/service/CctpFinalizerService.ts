import winston, { Logger } from "winston";
import axios from "axios";

import { RepeatableTask } from "../../generics";
import { DataSource, entities } from "@repo/indexer-database";
import { CHAIN_IDs } from "@across-protocol/constants";
import { PubSubService } from "../../pubsub/service";
import { Config } from "../../parseEnv";
import {
  fetchAttestationsForTxn,
  getCctpDestinationChainFromDomain,
  getCctpDomainForChainId,
  isProductionNetwork,
} from "../adapter/cctp-v2/service";

export const CCTP_FINALIZER_DELAY_SECONDS = 10;
export const CCTP_FINALIZER_RETRY_DELAY_HOURS = 1;
export const CCTP_FINALIZER_LOOKBACK_DAYS = 1;

export class CctpFinalizerServiceManager {
  private service: RepeatableTask;
  private pubSubService: PubSubService;

  constructor(
    private logger: Logger,
    private config: Config,
    private postgres: DataSource,
  ) {}

  public async start() {
    try {
      if (!this.config.enableCctpFinalizer) {
        this.logger.warn({
          at: "Indexer#CctpFinalizerServiceManager#start",
          message: "CCTP finalizer is disabled",
        });
        return;
      }

      this.pubSubService = new PubSubService(this.config);
      this.service = new CctpFinalizerService(
        this.logger,
        this.postgres,
        this.pubSubService,
      );
      await this.service.start(CCTP_FINALIZER_DELAY_SECONDS);
    } catch (error) {
      this.logger.error({
        at: "Indexer#CctpFinalizerServiceManager#start",
        message: "Error starting CCTP finalizer",
        error,
        errorJson: JSON.stringify(error),
      });
      throw error;
    }
  }

  public async stopGracefully() {
    this.service?.stop();
  }
}

/**
 * @description This service is designed to run on an interval basis similar to a cron job.
 * It publishes CCTP burn events info to the pubsub topic so that the finalization bot can
 * finalize the burn events indexed by the indexer. This service doesn't deal with
 * submitting the finalization transaction onchain, it just publishes the messages
 * to the the pubsub topic.
 */
class CctpFinalizerService extends RepeatableTask {
  constructor(
    logger: winston.Logger,
    private readonly postgres: DataSource,
    private readonly pubSubService: PubSubService,
  ) {
    super(logger, "cctp-finalizer-service");
  }

  protected async taskLogic(): Promise<void> {
    try {
      //#region devnote
      // Steps:
      // 1. Get the burn events from the database that were not published to the pubsub topic yet.
      // 2. For each burn event, check if there's a matching SponsoredDepositForBurn event.
      //    If found, publish with signature; otherwise publish without signature.
      // 3. Create a new CctpFinalizerJob row in the database for each burn event that was
      //    published to the pubsub topic, so that they are not picked up again.
      // 4. Also check for unfinalized transactions that have a CctpFinalizerJob but no
      //    MessageReceived event, and retry them if enough time has passed.
      //#endregion
      const qb = this.postgres
        .createQueryBuilder(entities.DepositForBurn, "burnEvent")
        .leftJoinAndSelect("burnEvent.finalizerJob", "job")
        .where("job.id IS NULL")
        // Filter out the burn events that have been deleted due to re-orgs.
        .andWhere("burnEvent.deletedAt IS NULL");
      const burnEvents = await qb.getMany();

      for (const burnEvent of burnEvents) {
        // Check if there's a matching SponsoredDepositForBurn event for this deposit
        const sponsoredEvent = await this.postgres
          .createQueryBuilder(entities.SponsoredDepositForBurn, "sponsored")
          .leftJoin(
            entities.CctpFinalizerJob,
            "job",
            "job.sponsoredDepositForBurnId = sponsored.id",
          )
          .where("sponsored.transactionHash = :transactionHash", {
            transactionHash: burnEvent.transactionHash,
          })
          .andWhere("sponsored.chainId = :chainId", {
            chainId: burnEvent.chainId,
          })
          .andWhere("sponsored.logIndex > :logIndex", {
            logIndex: burnEvent.logIndex,
          })
          .andWhere("job.id IS NULL")
          .andWhere("sponsored.deletedAt IS NULL")
          .orderBy("sponsored.logIndex", "ASC")
          .limit(1)
          .getOne();

        if (sponsoredEvent) {
          // If there's a matching sponsored event, publish with signature
          await this.publishBurnEvent(
            burnEvent,
            sponsoredEvent.signature,
            sponsoredEvent.id,
          );
        } else {
          // Otherwise, publish without signature
          await this.publishBurnEvent(burnEvent);
        }
      }

      // Check for unfinalized transactions that need retry
      try {
        await this.retryUnfinalizedTransactions();
      } catch (error) {
        this.logger.error({
          at: "CctpFinalizerService#taskLogic",
          message: "Error in retryUnfinalizedTransactions",
          notificationPath: "across-indexer-error",
          errorJson: JSON.stringify(error),
          error,
        });
      }
    } catch (error) {
      this.logger.error({
        at: "CctpFinalizerService#taskLogic",
        message: "Error in CctpFinalizerService",
        notificationPath: "across-indexer-error",
        errorJson: JSON.stringify(error),
        error,
      });
    }
  }

  protected initialize(): Promise<void> {
    // Empty because there's no need to initialize dependencies for now.
    return Promise.resolve();
  }

  private async publishBurnEvent(
    burnEvent: entities.DepositForBurn,
    signature?: string,
    sponsoredDepositForBurnId?: number,
  ) {
    try {
      const { chainId, transactionHash, minFinalityThreshold, blockTimestamp } =
        burnEvent;
      // Skip the event if the attestation time has not passed yet. Attestation times are
      // taken from here: https://developers.circle.com/cctp/required-block-confirmations
      const attestationTimeSeconds = getAttestationTime(
        Number(chainId),
        minFinalityThreshold,
      );
      const elapsedSeconds =
        new Date().getTime() / 1000 - blockTimestamp.getTime() / 1000;

      if (elapsedSeconds < attestationTimeSeconds) {
        this.logger.debug({
          at: "CctpFinalizerService#publishBurnEvent",
          message:
            "Skipping burn event because the attestation time has not passed yet",
          chainId,
          transactionHash,
          minFinalityThreshold,
          blockTimestamp,
          attestationTimeSeconds,
          elapsedSeconds,
        });
        return;
      }
      const attestations = await fetchAttestationsForTxn(
        getCctpDomainForChainId(Number(burnEvent.chainId)),
        transactionHash,
        isProductionNetwork(Number(burnEvent.chainId)),
      );
      if (attestations.messages.length === 0) {
        this.logger.debug({
          at: "CctpFinalizerService#publishBurnEvent",
          message: "No attestations found for burn event",
          chainId,
          transactionHash,
          burnEvent,
        });
        return;
      }
      const { attestation, eventNonce, message, status } =
        attestations.messages[0]!;
      if (status !== "complete") {
        this.logger.debug({
          at: "CctpFinalizerService#publishBurnEvent",
          message: "Attestation is not complete",
          chainId,
          transactionHash,
          burnEvent,
          attestations,
        });
        return;
      }

      await this.postgres
        .createQueryBuilder(entities.MessageSent, "ms")
        .update()
        .set({
          nonce: eventNonce,
        })
        .where("id = :id", { id: burnEvent.id })
        .execute();
      this.logger.debug({
        at: "CctpFinalizerService#publishBurnEvent",
        message: "Publishing burn event to pubsub",
        chainId,
        transactionHash,
        minFinalityThreshold,
        blockTimestamp,
        attestationTimeSeconds,
        elapsedSeconds,
      });
      const destinationChainId = getCctpDestinationChainFromDomain(
        burnEvent.destinationDomain,
      );
      await this.pubSubService.publishCctpFinalizerMessage(
        transactionHash,
        Number(chainId),
        message,
        attestation,
        destinationChainId,
        signature,
      );

      const jobValues: {
        attestation: string;
        message: string;
        burnEventId: number;
        sponsoredDepositForBurnId?: number;
      } = {
        attestation,
        message,
        burnEventId: burnEvent.id,
        ...(sponsoredDepositForBurnId && { sponsoredDepositForBurnId }),
      };

      await this.postgres
        .createQueryBuilder(entities.CctpFinalizerJob, "j")
        .insert()
        .values(jobValues)
        .orUpdate(["attestation", "sponsoredDepositForBurnId"], ["burnEventId"])
        .execute();
    } catch (error) {
      this.logger.error({
        at: "CctpFinalizerService#publishBurnEvent",
        message: "Error in CctpFinalizerService",
        notificationPath: "across-indexer-error",
        errorJson: JSON.stringify(error),
        error,
      });
    }
  }

  /**
   * Retry unfinalized CCTP transactions that have a CctpFinalizerJob but no MessageReceived event.
   * This handles cases where the Cloud Run job failed outside the indexer's control.
   */
  private async retryUnfinalizedTransactions(): Promise<void> {
    try {
      const lookbackTime = new Date(
        Date.now() - CCTP_FINALIZER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      );
      const retryDelayTime = new Date(
        Date.now() - CCTP_FINALIZER_RETRY_DELAY_HOURS * 60 * 60 * 1000,
      );

      const qb = this.postgres
        .createQueryBuilder(entities.DepositForBurn, "burnEvent")
        .innerJoinAndSelect("burnEvent.finalizerJob", "job")
        .innerJoin(
          entities.MessageSent,
          "messageSent",
          "messageSent.transactionHash = burnEvent.transactionHash AND messageSent.chainId = burnEvent.chainId",
        )
        .leftJoin(
          entities.MessageReceived,
          "messageReceived",
          "messageReceived.nonce = messageSent.nonce AND messageReceived.sourceDomain = messageSent.sourceDomain",
        )
        .where("burnEvent.deletedAt IS NULL")
        .andWhere("burnEvent.blockTimestamp >= :lookbackTime", {
          lookbackTime,
        })
        .andWhere("messageReceived.id IS NULL")
        .andWhere(
          "(job.createdAt <= :retryDelayTime OR job.updatedAt <= :retryDelayTime)",
          { retryDelayTime },
        );

      const unfinalizedBurnEvents = await qb.getMany();

      if (unfinalizedBurnEvents.length > 0) {
        this.logger.info({
          at: "CctpFinalizerService#retryUnfinalizedTransactions",
          message: "Found unfinalized transactions to retry",
          count: unfinalizedBurnEvents.length,
        });
      }

      for (const burnEvent of unfinalizedBurnEvents) {
        const sponsoredEvent = await this.postgres
          .createQueryBuilder(entities.SponsoredDepositForBurn, "sponsored")
          .where("sponsored.transactionHash = :transactionHash", {
            transactionHash: burnEvent.transactionHash,
          })
          .andWhere("sponsored.chainId = :chainId", {
            chainId: burnEvent.chainId,
          })
          .andWhere("sponsored.logIndex > :logIndex", {
            logIndex: burnEvent.logIndex,
          })
          .andWhere("sponsored.deletedAt IS NULL")
          .orderBy("sponsored.logIndex", "ASC")
          .limit(1)
          .getOne();

        if (sponsoredEvent) {
          // If there's a matching sponsored event, publish with signature
          await this.publishBurnEvent(
            burnEvent,
            sponsoredEvent.signature,
            sponsoredEvent.id,
          );
        } else {
          // Otherwise, publish without signature
          await this.publishBurnEvent(burnEvent);
        }
      }
    } catch (error) {
      this.logger.error({
        at: "CctpFinalizerService#retryUnfinalizedTransactions",
        message: "Error retrying unfinalized transactions",
        notificationPath: "across-indexer-error",
        errorJson: JSON.stringify(error),
        error,
      });
    }
  }
}

const ATTESTATION_TIMES = {
  [CHAIN_IDs.MAINNET]: { standard: 13 * 60, fast: 20 },
  [CHAIN_IDs.ARBITRUM]: { standard: 13 * 60, fast: 8 },
  [CHAIN_IDs.ARBITRUM_SEPOLIA]: { standard: 13 * 60, fast: 8 },
  [CHAIN_IDs.BASE]: { standard: 13 * 60, fast: 8 },
  [CHAIN_IDs.BSC]: { standard: 2, fast: 8 },
  [CHAIN_IDs.HYPEREVM]: { standard: 5, fast: 8 },
  [CHAIN_IDs.INK]: { standard: 30 * 60, fast: 8 },
  [CHAIN_IDs.LINEA]: { standard: 6 * 60 * 60, fast: 8 },
  [CHAIN_IDs.OPTIMISM]: { standard: 13 * 60, fast: 8 },
  [CHAIN_IDs.POLYGON]: { standard: 8, fast: 8 },
  [CHAIN_IDs.SOLANA]: { standard: 25, fast: 8 },
  [CHAIN_IDs.UNICHAIN]: { standard: 13 * 60, fast: 8 },
  [CHAIN_IDs.WORLD_CHAIN]: { standard: 13 * 60, fast: 8 },
};

function getAttestationTime(chainId: number, finalityThreshold: number) {
  let finalityKey: keyof (typeof ATTESTATION_TIMES)[typeof chainId];
  if (finalityThreshold <= 1000) {
    finalityKey = "fast";
  } else {
    finalityKey = "standard";
  }
  const attestationTime = ATTESTATION_TIMES[chainId]?.[finalityKey];
  if (!attestationTime) {
    throw new Error(
      `CCTP attestation time not defined for chainId: ${chainId}`,
    );
  }
  return attestationTime;
}
