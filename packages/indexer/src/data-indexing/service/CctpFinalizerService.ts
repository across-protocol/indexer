import winston, { Logger } from "winston";

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
import { CCTP_FORWARD_MAGIC_BYTES } from "./constants";
import { utils } from "@across-protocol/sdk";
import {
  formatFromAddressToChainFormat,
  getSponsoredCCTPDstPeripheryAddress,
} from "../../utils";

export const CCTP_FINALIZER_DELAY_SECONDS = 10;
export const CCTP_UNFINALIZED_MONITOR_DELAY_SECONDS = 5 * 60; // 5 minutes

export class CctpFinalizerServiceManager {
  private finalizerService: RepeatableTask;
  private monitorService: RepeatableTask;
  private pubSubService: PubSubService;

  constructor(
    private logger: Logger,
    private config: Config,
    private postgres: DataSource,
  ) {}

  public async start(signal: AbortSignal) {
    try {
      if (!this.config.enableCctpFinalizer) {
        this.logger.debug({
          at: "Indexer#CctpFinalizerServiceManager#start",
          message: "CCTP finalizer is disabled",
        });
        return;
      }

      this.pubSubService = new PubSubService(this.config);
      this.finalizerService = new CctpFinalizerService(
        this.logger,
        this.postgres,
        this.pubSubService,
        this.config.enableCctpFinalizerPubSub,
      );
      this.monitorService = new CctpUnfinalizedBurnMonitorService(
        this.logger,
        this.postgres,
      );

      await Promise.all([
        this.finalizerService.start(CCTP_FINALIZER_DELAY_SECONDS, signal),
        this.monitorService.start(
          CCTP_UNFINALIZED_MONITOR_DELAY_SECONDS,
          signal,
        ),
      ]);
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
}

/**
 * @description This service is designed to run on an interval basis similar to a cron job.
 * It publishes CCTP burn events info to the pubsub topic so that the finalization bot can
 * finalize the burn events indexed by the indexer. This service doesn't deal with
 * submitting the finalization transaction onchain, it just publishes the messages
 * to the pubsub topic.
 */
export class CctpFinalizerService extends RepeatableTask {
  constructor(
    logger: winston.Logger,
    private readonly postgres: DataSource,
    private readonly pubSubService: PubSubService,
    private readonly enablePubSub: boolean,
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
        let qb = this.postgres
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
          .andWhere("job.id IS NULL")
          .andWhere("sponsored.deletedAt IS NULL")
          .orderBy("sponsored.logIndex", "ASC")
          .limit(1);

        if (Number(burnEvent.chainId) !== CHAIN_IDs.SOLANA) {
          qb = qb.andWhere("sponsored.logIndex > :logIndex", {
            logIndex: burnEvent.logIndex,
          });
        }
        const sponsoredEvent = await qb.getOne();

        if (sponsoredEvent) {
          // If there's a matching sponsored event, publish with signature
          await this.processBurnEvent(
            burnEvent,
            sponsoredEvent.signature,
            sponsoredEvent.id,
          );
        } else {
          // If not found, check if it SHOULD have been found
          const isSponsoredDeposit = isSponsoredCCTPDeposit(
            getCctpDestinationChainFromDomain(burnEvent.destinationDomain),
            burnEvent.destinationCaller,
            burnEvent.mintRecipient,
          );
          if (isSponsoredDeposit) {
            // If this sponsored event does not exist then log an error.
            this.logger.error({
              at: "CctpFinalizerService#taskLogic",
              message:
                "Sponsored event defined by addresses but not found in DB",
              burnEvent,
            });
          } else {
            // Otherwise, publish without signature
            const isHyperliquidDeposit =
              burnEvent.hookData
                ?.toLowerCase()
                .includes(CCTP_FORWARD_MAGIC_BYTES.toLowerCase()) ?? false;
            await this.processBurnEvent(
              burnEvent,
              undefined,
              undefined,
              isHyperliquidDeposit,
            );
          }
        }
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

  private async processBurnEvent(
    burnEvent: entities.DepositForBurn,
    signature?: string,
    sponsoredDepositForBurnId?: number,
    skipPubSub?: boolean,
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
        .where(
          "chainId = :chainId AND blockNumber = :blockNumber AND transactionHash = :transactionHash",
          { chainId, blockNumber: burnEvent.blockNumber, transactionHash },
        )
        .execute();

      // Skip PubSub publishing for Hyperliquid deposits (they go through HyperEVM, not standard finalization)
      // Also skip if pubsub is disabled via ENABLE_CCTP_FINALIZER_PUBSUB
      if (!skipPubSub && this.enablePubSub) {
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
          .orUpdate(
            ["attestation", "sponsoredDepositForBurnId"],
            ["burnEventId"],
          )
          .execute();
      }
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
}

/**
 * @description Monitors for CCTP burn events that have been published to the finalizer
 * but haven't been finalized on the destination chain within the expected timeframe.
 * Runs every 5 minutes to detect and alert on stuck burns.
 */
class CctpUnfinalizedBurnMonitorService extends RepeatableTask {
  constructor(
    logger: winston.Logger,
    private readonly postgres: DataSource,
  ) {
    super(logger, "cctp-unfinalized-burn-monitor");
  }

  protected async taskLogic(): Promise<void> {
    try {
      const unfinalizedBurns = await this.postgres
        .createQueryBuilder(entities.CctpFinalizerJob, "job")
        .innerJoinAndSelect("job.burnEvent", "burnEvent")
        .innerJoin(
          entities.MessageSent,
          "messageSent",
          "messageSent.transactionHash = burnEvent.transactionHash AND messageSent.chainId = burnEvent.chainId",
        )
        .leftJoin(
          entities.MessageReceived,
          "messageReceived",
          "messageReceived.sourceDomain = messageSent.sourceDomain AND messageReceived.nonce = messageSent.nonce",
        )
        .where("now() - job.createdAt > interval '30 minutes'")
        .andWhere("now() - job.createdAt < interval '24 hours'")
        .andWhere("messageReceived.id IS NULL")
        .addSelect("messageSent.sourceDomain", "sourceDomain")
        .addSelect("messageSent.nonce", "nonce")
        .addSelect("messageSent.destinationDomain", "destinationDomain")
        .getRawAndEntities();

      for (let i = 0; i < unfinalizedBurns.entities.length; i++) {
        const job = unfinalizedBurns.entities[i]!;
        const raw = unfinalizedBurns.raw[i];

        if (!raw?.sourceDomain || !raw?.destinationDomain) {
          continue;
        }

        const { nonce, sourceDomain, destinationDomain } = raw;
        const isProduction = isProductionNetwork(Number(job.burnEvent.chainId));
        const destinationChainId = getCctpDestinationChainFromDomain(
          destinationDomain,
          isProduction,
        );

        const elapsedMinutes = Math.round(
          (Date.now() - job.createdAt.getTime()) / 1000 / 60,
        );

        this.logger.error({
          at: "CctpUnfinalizedBurnMonitorService#taskLogic",
          message: `CCTP burn event has not been finalized after ${elapsedMinutes} minutes`,
          notificationPath: "across-indexer-error",
          sourceChainId: job.burnEvent.chainId,
          destinationChainId,
          burnTransactionHash: job.burnEvent.transactionHash,
          burnBlockNumber: job.burnEvent.blockNumber,
          amount: job.burnEvent.amount,
          depositor: job.burnEvent.depositor,
          mintRecipient: job.burnEvent.mintRecipient,
          sourceDomain,
          nonce,
          jobCreatedAt: job.createdAt,
          elapsedMinutes,
        });
      }
    } catch (error) {
      this.logger.error({
        at: "CctpUnfinalizedBurnMonitorService#taskLogic",
        message: "Error checking for unfinalized burn events",
        notificationPath: "across-indexer-error",
        errorJson: JSON.stringify(error),
        error,
      });
    }
  }

  protected initialize(): Promise<void> {
    return Promise.resolve();
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
  [CHAIN_IDs.MONAD]: { standard: 5, fast: 1 },
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

export function isSponsoredCCTPDeposit(
  destinationChainId: number,
  destinationCaller: string,
  mintRecipient: string,
): boolean {
  const sponsoredCCTPDstPeripheryAddress =
    getSponsoredCCTPDstPeripheryAddress(destinationChainId);

  if (!sponsoredCCTPDstPeripheryAddress) return false;

  const sponsoredCCTPDstPeripheryAddressBytes = formatFromAddressToChainFormat(
    utils.toAddressType(
      sponsoredCCTPDstPeripheryAddress.toLowerCase(),
      destinationChainId,
    ),
    destinationChainId,
  ).toLowerCase();

  const mintRecipientBytes = mintRecipient.toLowerCase();
  const destinationCallerBytes = destinationCaller.toLowerCase();
  return (
    destinationCallerBytes === sponsoredCCTPDstPeripheryAddressBytes &&
    mintRecipientBytes === sponsoredCCTPDstPeripheryAddressBytes
  );
}
