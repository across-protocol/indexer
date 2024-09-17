import { DataSource, entities } from "@repo/indexer-database";
import winston from "winston";

type SpokePoolEventsProcessorConfig = {
  logger: winston.Logger;
  postgres: DataSource;
};

/**
 * Closure generator for the processor service to track relay hash info
 * @param config The configuration for the processor service
 * @returns A function that can be called to start the processor service
 */
export function Processor(config: SpokePoolEventsProcessorConfig) {
  const { postgres, logger } = config;

  return async () => {
    await assignSpokeEventsToRelayHashInfo(postgres, logger);
    await updateRelayStatus(postgres, logger);
    await updateRefundedDepositsStatus(postgres, logger);
  };
}

/**
 * Calls the database to find deposit, fill and slow fill request events that are not associated
 * with relayHashInfo yet and creates the relation
 * @param postgres A connection to the database
 * @param logger A logger instance
 * @returns A void promise
 */
async function assignSpokeEventsToRelayHashInfo(
  postgres: DataSource,
  logger: winston.Logger,
): Promise<void> {
  const relayHashInfoRepository = postgres.getRepository(
    entities.RelayHashInfo,
  );
  for (const [eventEntity, fieldName] of [
    [entities.V3FundsDeposited, "depositEventId"] as [
      typeof entities.V3FundsDeposited,
      string,
    ],
    [entities.FilledV3Relay, "fillEventId"] as [
      typeof entities.FilledV3Relay,
      string,
    ],
    [entities.RequestedV3SlowFill, "slowFillRequestEventId"] as [
      typeof entities.RequestedV3SlowFill,
      string,
    ],
  ]) {
    const eventsWithoutRelayHashInfo = await postgres
      .getRepository(eventEntity)
      .createQueryBuilder("events")
      .leftJoin("relay_hash_info", "rhi", `events.id = rhi.${fieldName}`)
      .where(`rhi.${fieldName} IS NULL`)
      .getMany();
    if (eventsWithoutRelayHashInfo.length > 0) {
      const updatedEvents = await relayHashInfoRepository.upsert(
        eventsWithoutRelayHashInfo.map((event) => {
          return {
            relayHash: event.relayHash,
            depositId: event.depositId,
            originChainId: event.originChainId,
            [fieldName]: event.id,
          };
        }),
        ["relayHash"],
      );
      logger.info({
        at: "SpokePoolProcessor#assignSpokeEventsToRelayHashInfo",
        message: `Found and associated ${eventEntity.name} events with bundles`,
        updatedRelayHashInfoRows: updatedEvents.generatedMaps.length,
      });
    }
  }
}

/**
 * Calls the database to find relayHashInfo rows without a final status and
 * updates it in case it has changed
 * @param postgres A connection to the database
 * @param logger A logger instance
 * @returns A void promise
 */
async function updateRelayStatus(
  postgres: DataSource,
  logger: winston.Logger,
): Promise<void> {
  const finalStatuses = [
    entities.RelayStatus.Filled,
    entities.RelayStatus.SlowFilled,
    entities.RelayStatus.Refunded,
  ];
  const relayHashInfoRepository = postgres.getRepository(
    entities.RelayHashInfo,
  );
  const relaysToUpdate = await relayHashInfoRepository
    .createQueryBuilder("rhi")
    .leftJoinAndSelect("rhi.depositEvent", "deposit")
    .leftJoinAndSelect("rhi.fillEvent", "fill")
    .leftJoinAndSelect("rhi.slowFillRequestEvent", "slowFillRequest")
    .where("status NOT IN (:...finalStatuses)", { finalStatuses })
    .orWhere("status IS NULL")
    .getMany();

  const updatedRelays = relaysToUpdate.map(async (relay) => {
    const previousStatus = relay.status;
    const newStatus = getRelayStatus(relay);
    if (newStatus !== previousStatus) {
      return await relayHashInfoRepository.update(
        { id: relay.id },
        { status: newStatus },
      );
    }
  });
  const numberUpdated = updatedRelays.filter((x) => x).length;
  logger.info({
    at: "SpokePoolProcessor#updateRelayStatus",
    message: `Updated ${numberUpdated} relayHashInfo statuses`,
  });
}

/**
 * Computes the status of a relay based on the associated events
 * @param relayHashInfo A relayHashInfo row
 * @returns The status of the relay
 */
function getRelayStatus(relayHashInfo: entities.RelayHashInfo) {
  let status: entities.RelayStatus = relayHashInfo.status;
  const {
    depositEvent: deposit,
    fillEvent: fill,
    slowFillRequestEvent: slowFillRequest,
  } = relayHashInfo;
  if (deposit) {
    if (!fill && !slowFillRequest) {
      const now = new Date();
      status =
        deposit.fillDeadline < now
          ? entities.RelayStatus.Expired
          : entities.RelayStatus.Unfilled;
    } else if (fill) {
      const fillType = fill.relayExecutionInfo.fillType;
      if (fillType === 0 || fillType === 1) {
        status = entities.RelayStatus.Filled;
      } else if (fillType === 2) {
        status = entities.RelayStatus.SlowFilled;
      }
    } else if (slowFillRequest) {
      status = entities.RelayStatus.SlowFillRequested;
    }
  } else if (fill && !slowFillRequest) {
    status = entities.RelayStatus.Filled;
  } else if (slowFillRequest && !fill) {
    status = entities.RelayStatus.SlowFillRequested;
  }
  return status;
}

/**
 * Calls the database to find expired deposits and looks for related refunds.
 * When a matching refund is found, updates the relay status to refunded
 * @param postgres A connection to the database
 * @param logger A logger instance
 * @returns A void promise
 */
async function updateRefundedDepositsStatus(
  postgres: DataSource,
  logger: winston.Logger,
): Promise<void> {
  const relayHashInfoRepository = postgres.getRepository(
    entities.RelayHashInfo,
  );
  const refundsRepository = postgres.getRepository(
    entities.ExecutedRelayerRefundRoot,
  );
  const expiredDeposits = await relayHashInfoRepository.find({
    where: { status: entities.RelayStatus.Expired },
    relations: ["depositEvent"],
  });
  let updatedRows = 0;
  for (const expiredDeposit of expiredDeposits) {
    const { depositor, inputAmount, inputToken, blockNumber } =
      expiredDeposit.depositEvent;
    const matchingRefunds = await refundsRepository
      .createQueryBuilder("refunds")
      .where("refunds.chainId = :originChainId", {
        originChainId: expiredDeposit.originChainId,
      })
      .andWhere("refunds.blockNumber > :depositBlockNumber", {
        depositBlockNumber: blockNumber,
      })
      .andWhere("refunds.l2TokenAddress = :inputToken", {
        inputToken: inputToken,
      })
      .andWhere("refunds.refundAddresses ::jsonb @> :depositor", {
        depositor: JSON.stringify([depositor]),
      })
      .andWhere("refunds.refundAmounts ::jsonb @> :inputAmount", {
        inputAmount: JSON.stringify([inputAmount]),
      })
      .getMany();
    const possibleRefunds = matchingRefunds.filter((refund) => {
      return refund.refundAddresses.some(
        (address, idx) =>
          address === depositor && refund.refundAmounts[idx] === inputAmount,
      );
    });
    const numberPossibleRefunds = possibleRefunds.length;
    if (numberPossibleRefunds > 1) {
      logger.warn({
        at: "SpokePoolProcessor#updateRefundedDepositsStatus",
        message: `Unable to set refund for deposit with id ${expiredDeposit.depositEventId}. Found ${numberPossibleRefunds} matches.`,
      });
    } else if (possibleRefunds[0]) {
      await relayHashInfoRepository.update(
        { id: expiredDeposit.id },
        {
          depositRefundTxHash: possibleRefunds[0].transactionHash,
          status: entities.RelayStatus.Refunded,
        },
      );
      updatedRows += 1;
    }
  }
  logger.info({
    at: "SpokePoolProcessor#updateRefundedDepositsStatus",
    message: `Updated ${updatedRows} refunded deposits`,
  });
}
