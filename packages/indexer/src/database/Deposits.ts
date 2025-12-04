import { Repository, ObjectLiteral, DataSource } from "typeorm";
import { entities } from "@repo/indexer-database";

/**
 * Enum to define the type of update being performed on the Deposit index.
 * - DEPOSIT: Represents the source event (e.g., FundsDeposited). Sets status to PENDING unless already FILLED.
 * - FILL: Represents the destination event (e.g., FilledRelay). Always sets status to FILLED.
 */
export enum DepositUpdateType {
  DEPOSIT = "DEPOSIT",
  FILL = "FILL",
}

/**
 * Updates the central Deposit index based on a protocol event.
 *
 * @param event - The specific protocol event (e.g., V3FundsDeposited, OFTSent)
 * @param dataSource - The DataSource to access the Deposit repository and related entities
 */
export async function updateDeposits<T extends ObjectLiteral>(
  event: T,
  dataSource: DataSource,
): Promise<T> {
  const depositRepo = dataSource.getRepository(entities.Deposit);

  // --- ACROSS ---
  if (event instanceof entities.V3FundsDeposited) {
    await handleAcrossDeposit(event, depositRepo);
  } else if (event instanceof entities.FilledV3Relay) {
    await handleAcrossFill(event, depositRepo);
  }

  // --- CCTP ---
  else if (event instanceof entities.DepositForBurn) {
    await handleCctpDeposit(event, depositRepo, dataSource);
  } else if (event instanceof entities.MintAndWithdraw) {
    await handleCctpFill(event, depositRepo, dataSource);
  }

  // --- OFT ---
  else if (event instanceof entities.OFTSent) {
    await handleOftSent(event, depositRepo);
  } else if (event instanceof entities.OFTReceived) {
    await handleOftReceived(event, depositRepo);
  }

  return event;
}

// --- Protocol Handlers ---

async function handleAcrossDeposit(
  event: entities.V3FundsDeposited,
  depositRepo: Repository<entities.Deposit>,
) {
  const uniqueId = event.relayHash; // Across uses relayHash as the primary identifier
  if (!uniqueId) return;

  await updateDepositRecord(
    depositRepo,
    uniqueId,
    entities.DepositType.ACROSS,
    {
      originChainId: event.originChainId,
      destinationChainId: event.destinationChainId,
      depositor: event.depositor,
      recipient: event.recipient,
      blockTimestamp: event.blockTimestamp,
      v3FundsDepositedId: event.id,
    },
    DepositUpdateType.DEPOSIT,
  );
}

async function handleAcrossFill(
  event: entities.FilledV3Relay,
  depositRepo: Repository<entities.Deposit>,
) {
  const uniqueId = event.relayHash;
  if (!uniqueId) return;

  await updateDepositRecord(
    depositRepo,
    uniqueId,
    entities.DepositType.ACROSS,
    {
      destinationChainId: event.destinationChainId,
      filledV3RelayId: event.id,
      // Use timestamp as fallback if the deposit event has not been processed yet
      blockTimestamp: event.blockTimestamp,
    },
    DepositUpdateType.FILL,
  );
}

async function handleCctpDeposit(
  event: entities.DepositForBurn,
  depositRepo: Repository<entities.Deposit>,
  dataSource: DataSource,
) {
  // CCTP requires Nonce for uniqueId from MessageSent
  const messageSentRepo = dataSource.getRepository(entities.MessageSent);
  const messageSent = await messageSentRepo.findOne({
    where: {
      transactionHash: event.transactionHash,
      chainId: event.chainId,
    },
  });

  if (!messageSent) return;

  const uniqueId = `${messageSent.nonce}-${event.destinationDomain}`;

  await updateDepositRecord(
    depositRepo,
    uniqueId,
    entities.DepositType.CCTP,
    {
      originChainId: event.chainId,
      depositor: event.depositor,
      recipient: event.mintRecipient,
      blockTimestamp: event.blockTimestamp,
      depositForBurnId: event.id,
    },
    DepositUpdateType.DEPOSIT,
  );
}

async function handleCctpFill(
  event: entities.MintAndWithdraw,
  depositRepo: Repository<entities.Deposit>,
  dataSource: DataSource,
) {
  // CCTP Fill links to MessageReceived via txHash to get nonce
  const messageReceivedRepo = dataSource.getRepository(
    entities.MessageReceived,
  );
  const messageReceived = await messageReceivedRepo.findOne({
    where: {
      transactionHash: event.transactionHash,
      chainId: event.chainId,
    },
  });

  if (!messageReceived) return;

  const uniqueId = `${messageReceived.nonce}-${messageReceived.sourceDomain}`;

  await updateDepositRecord(
    depositRepo,
    uniqueId,
    entities.DepositType.CCTP,
    {
      destinationChainId: event.chainId,
      mintAndWithdrawId: event.id,
      blockTimestamp: event.blockTimestamp,
    },
    DepositUpdateType.FILL,
  );
}

async function handleOftSent(
  event: entities.OFTSent,
  depositRepo: Repository<entities.Deposit>,
) {
  await updateDepositRecord(
    depositRepo,
    event.guid,
    entities.DepositType.OFT,
    {
      originChainId: event.chainId,
      blockTimestamp: event.blockTimestamp,
      depositor: event.fromAddress,
      oftSentId: event.id,
    },
    DepositUpdateType.DEPOSIT,
  );
}

async function handleOftReceived(
  event: entities.OFTReceived,
  depositRepo: Repository<entities.Deposit>,
) {
  await updateDepositRecord(
    depositRepo,
    event.guid,
    entities.DepositType.OFT,
    {
      destinationChainId: event.chainId,
      recipient: event.toAddress,
      oftReceivedId: event.id,
      blockTimestamp: event.blockTimestamp,
    },
    DepositUpdateType.FILL,
  );
}

// --- Shared Helper ---

/**
 * Shared function to handle the common logic of finding/creating a Deposit
 * and updating it with partial data.
 *
 * @param depositRepo - The Deposit repository
 * @param uniqueId - The unique identifier for the deposit
 * @param type - The deposit type (ACROSS, CCTP, OFT)
 * @param updates - Object containing fields to update (undefined values are ignored)
 * @param updateType - The type of update (DEPOSIT or FILL) which dictates the status transition logic
 */
async function updateDepositRecord(
  depositRepo: Repository<entities.Deposit>,
  uniqueId: string,
  type: entities.DepositType,
  updates: Partial<entities.Deposit>,
  updateType: DepositUpdateType,
) {
  let deposit = await depositRepo.findOne({ where: { uniqueId } });

  if (!deposit) {
    deposit = depositRepo.create({ uniqueId, type });
    // If creating a new record (e.g. orphan fill), ensure timestamp is set if provided
    if (updates.blockTimestamp) {
      deposit.blockTimestamp = updates.blockTimestamp;
    }
  }

  // Apply updates safely: only update fields that are explicitly defined
  // This prevents overwriting existing data with undefined
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && value !== null) {
      (deposit as any)[key] = value;
    }
  }

  switch (updateType) {
    case DepositUpdateType.FILL:
      deposit.status = entities.DepositStatus.FILLED;
      break;
    case DepositUpdateType.DEPOSIT:
      // If it's a deposit event (source), only set to PENDING if it's not already FILLED
      // (This handles cases where the fill event was indexed before the deposit event)
      if (deposit.status !== entities.DepositStatus.FILLED) {
        deposit.status = entities.DepositStatus.PENDING;
      }
      break;
  }

  await depositRepo.save(deposit);
}
