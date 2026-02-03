import { DataSource } from "typeorm";
import { entities, SaveQueryResult } from "@repo/indexer-database";
import {
  assignDepositEventsToRelayHashInfo,
  assignSwapEventToRelayHashInfo,
} from "../../services/spokePoolProcessor";
import { IndexerEventPayload } from "./genericEventListening";
import { SWAP_BEFORE_BRIDGE_ABI, FUNDS_DEPOSITED_V3_ABI } from "../model/abis";
import {
  SWAP_BEFORE_BRIDGE_EVENT_NAME,
  FUNDS_DEPOSITED_V3_EVENT_NAME,
} from "./constants";
import {
  V3FundsDepositedArgs,
} from "../model/eventTypes";
import { parseAbi } from "viem";
import { Logger } from "winston";
import { decodeEventsFromReceipt } from "./preprocessing";

export const postProcessDepositEvent = async (
  db: DataSource,
  entity: entities.V3FundsDeposited,
) => {
  await assignDepositEventsToRelayHashInfo([entity], db);
};

type postProcessSwapBeforeBridgeRequest = {
  db: DataSource,
  payload: IndexerEventPayload,
  logger: Logger,
  storedItem: entities.SwapBeforeBridge,
}

export const postProcessSwapBeforeBridge = async (
  request: postProcessSwapBeforeBridgeRequest,
) => {
  const { db, payload, logger, storedItem } = request;
  const viemReceipt = await payload.transactionReceipt;
  if (!viemReceipt) {
    logger.warn({
      message: "Transaction receipt not found for swap before bridge",
      payload,
    });
    return;
  }
  if (!storedItem.logIndex) {
    logger.warn({
      message: "Log index not found for swap before bridge",
      payload,
    });
    return;
  }

  const fundsDepositedEvents = decodeEventsFromReceipt<V3FundsDepositedArgs>(
    viemReceipt,
    parseAbi(FUNDS_DEPOSITED_V3_ABI),
    FUNDS_DEPOSITED_V3_EVENT_NAME,
  );

  // Find matching Deposit: The strict NEXT deposit.
  const candidateDeposits = fundsDepositedEvents
    .filter((d) => d.logIndex > storedItem.logIndex)
    .sort((a, b) => a.logIndex - b.logIndex);

  const matchingDeposit = candidateDeposits[0];

  if (matchingDeposit) {
    // Find matched FundsDeposited entity in DB
    const depositEntity = await db
      .getRepository(entities.V3FundsDeposited)
      .findOne({
        where: {
          transactionHash: matchingDeposit.transactionHash,
          logIndex: matchingDeposit.logIndex,
        },
      });

    if (depositEntity) {
      await assignSwapEventToRelayHashInfo([{
        deposit: depositEntity,
        swapBeforeBridge: storedItem,
      }], db);
    }
    else {
      logger.warn({
        message: "No matching deposit found for swap before bridge",
        payload,
      });
    }
  } else {
    logger.warn({
      message: "No matching deposit found for swap before bridge",
      payload,
    });
  }

};
