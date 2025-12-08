import { Repository, ObjectLiteral, DataSource } from "typeorm";
import { entities } from "@repo/indexer-database";
import { getCctpDestinationChainFromDomain } from "../data-indexing/adapter/cctp-v2/service";

/**
 * Enum to define the type of update being performed on the Deposit index.
 * - DEPOSIT: Represents the source event (e.g., FundsDeposited). Sets status to PENDING unless already FILLED.
 * - FILL: Represents the destination event (e.g., FilledRelay). Always sets status to FILLED.
 */
export enum DepositUpdateType {
  DEPOSIT = "DEPOSIT",
  FILL = "FILL",
}

export type AcrossDepositUpdate = {
  deposit?: entities.V3FundsDeposited;
  fill?: entities.FilledV3Relay;
};

export type OftDepositUpdate = {
  sent?: entities.OFTSent;
  received?: entities.OFTReceived;
};

export type CctpDepositUpdate = {
  deposit?: {
    depositForBurn?: entities.DepositForBurn;
    messageSent: entities.MessageSent;
  };
  fill?: {
    mintAndWithdraw?: entities.MintAndWithdraw;
    messageReceived: entities.MessageReceived;
  };
};

export type DepositUpdaterRequestType = {
  dataSource: DataSource;
  depositUpdate: {
    across?: AcrossDepositUpdate;
    cctp?: CctpDepositUpdate;
    oft?: OftDepositUpdate;
  };
};

/**
 * Updates the central Deposit index based on a protocol event.
 *
 */
export async function updateDeposits(
  request: DepositUpdaterRequestType,
): Promise<entities.Deposit | undefined> {
  const { dataSource, depositUpdate } = request;
  const depositRepo = dataSource.getRepository(entities.Deposit);
  let savedUpdate: entities.Deposit | undefined;
  // --- ACROSS ---
  if (depositUpdate.across) {
    const { deposit, fill } = depositUpdate.across;
    if (deposit) await handleAcrossDeposit(deposit, depositRepo);
    if (fill) await handleAcrossFill(fill, depositRepo);
  }

  // --- CCTP ---
  else if (depositUpdate.cctp) {
    const { deposit, fill } = depositUpdate.cctp;
    if (deposit) {
      await handleCctpDeposit(deposit, depositRepo);
    }
    if (fill) {
      await handleCctpFill(fill, depositRepo);
    }
  }

  // --- OFT ---
  else if (depositUpdate.oft) {
    const { sent, received } = depositUpdate.oft;
    if (sent) await handleOftSent(sent, depositRepo);
    if (received) await handleOftReceived(received, depositRepo);
  }
  return savedUpdate;
}

// --- Protocol Handlers ---

async function handleAcrossDeposit(
  event: entities.V3FundsDeposited,
  depositRepo: Repository<entities.Deposit>,
): Promise<void> {
  const uniqueId = event.internalHash; // Across uses internalHash as the primary identifier

  return await updateDepositRecord(
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
): Promise<void> {
  const uniqueId = event.internalHash;

  return await updateDepositRecord(
    depositRepo,
    uniqueId,
    entities.DepositType.ACROSS,
    {
      originChainId: event.originChainId,
      destinationChainId: event.destinationChainId,
      filledV3RelayId: event.id,
      // Use timestamp as fallback if the deposit event has not been processed yet
      blockTimestamp: event.blockTimestamp,
    },
    DepositUpdateType.FILL,
  );
}

async function handleCctpDeposit(
  deposit: {
    depositForBurn?: entities.DepositForBurn;
    messageSent: entities.MessageSent;
  },
  depositRepo: Repository<entities.Deposit>,
) {
  // CCTP requires Nonce for uniqueId from MessageSent
  const { depositForBurn, messageSent } = deposit;
  const uniqueId = `${messageSent.nonce}-${messageSent.destinationDomain}`;

  await updateDepositRecord(
    depositRepo,
    uniqueId,
    entities.DepositType.CCTP,
    {
      destinationChainId: getCctpDestinationChainFromDomain(
        messageSent.destinationDomain,
      ).toString(),
      depositor: messageSent.sender,
      recipient: messageSent.recipient,
      blockTimestamp: messageSent.blockTimestamp,
      depositForBurnId: messageSent.id,
    },
    DepositUpdateType.DEPOSIT,
  );
  if (depositForBurn) {
    await updateDepositRecord(
      depositRepo,
      uniqueId,
      entities.DepositType.CCTP,
      {
        depositForBurnId: depositForBurn.id,
      },
      DepositUpdateType.DEPOSIT,
    );
  }
}

async function handleCctpFill(
  fill: {
    mintAndWithdraw?: entities.MintAndWithdraw;
    messageReceived: entities.MessageReceived;
  },
  depositRepo: Repository<entities.Deposit>,
): Promise<void> {
  const { mintAndWithdraw, messageReceived } = fill;
  // CCTP Fill links to MessageReceived via txHash to get nonce
  const uniqueId = `${messageReceived.nonce}-${messageReceived.sourceDomain}`;

  await updateDepositRecord(
    depositRepo,
    uniqueId,
    entities.DepositType.CCTP,
    {
      originChainId: getCctpDestinationChainFromDomain(
        messageReceived.sourceDomain,
      ).toString(),
      mintAndWithdrawId: messageReceived.id,
      blockTimestamp: messageReceived.blockTimestamp,
    },
    DepositUpdateType.FILL,
  );

  if (mintAndWithdraw) {
    await updateDepositRecord(
      depositRepo,
      uniqueId,
      entities.DepositType.CCTP,
      {
        mintAndWithdrawId: mintAndWithdraw.id,
        recipient: mintAndWithdraw.mintRecipient,
      },
      DepositUpdateType.FILL,
    );
  }
}

async function handleOftSent(
  event: entities.OFTSent,
  depositRepo: Repository<entities.Deposit>,
): Promise<void> {
  return await updateDepositRecord(
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
): Promise<void> {
  return await updateDepositRecord(
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
 * @returns The saved Deposit entity
 */
async function updateDepositRecord(
  depositRepo: Repository<entities.Deposit>,
  uniqueId: string,
  type: entities.DepositType,
  updates: Partial<entities.Deposit>,
  updateType: DepositUpdateType,
): Promise<void> {
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
