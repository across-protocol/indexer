import { Repository, DataSource } from "typeorm";
import { entities } from "@repo/indexer-database";
import { getCctpDestinationChainFromDomain } from "../data-indexing/adapter/cctp-v2/service";
import { getChainIdForEndpointId } from "../data-indexing/adapter/oft/service";

/**
 * Enum to define the type of update being performed on the Deposit index.
 */
export enum DepositUpdateType {
  DEPOSIT = "DEPOSIT", // Source event
  FILL = "FILL", // Destination event
}

// --- Input Types ---

export type AcrossDepositUpdate = {
  deposit?: entities.V3FundsDeposited;
  fill?: entities.FilledV3Relay;
};

export type OftDepositUpdate = {
  sent?: entities.OFTSent;
  received?: entities.OFTReceived;
};

export type CctpDepositUpdate = {
  burn?: {
    depositForBurn?: entities.DepositForBurn;
    messageSent: entities.MessageSent;
  };
  mint?: {
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
 * Main entry point to update the central Deposit index.
 * This function orchestrates the update process by delegating to protocol-specific handlers.
 * @param request - The request object containing the data source and the deposit update payload.
 * @returns A promise that resolves when the update is complete.
 */
export async function updateDeposits(
  request: DepositUpdaterRequestType,
): Promise<void> {
  const { dataSource, depositUpdate } = request;
  const depositRepo = dataSource.getRepository(entities.Deposit);

  // --- ACROSS ---
  if (depositUpdate.across) {
    const { deposit, fill } = depositUpdate.across;
    if (deposit) {
      await handleAcrossDeposit(deposit, depositRepo);
    }
    if (fill) {
      await handleAcrossFill(fill, depositRepo);
    }
  }

  // --- CCTP ---
  else if (depositUpdate.cctp) {
    const { burn, mint } = depositUpdate.cctp;
    if (burn) {
      await handleCctpBurn(burn, depositRepo);
    }
    if (mint) {
      await handleCctpMint(mint, depositRepo);
    }
  }

  // --- OFT ---
  else if (depositUpdate.oft) {
    const { sent, received } = depositUpdate.oft;
    if (sent) {
      await handleOftSent(sent, depositRepo);
    }
    if (received) {
      await handleOftReceived(received, depositRepo);
    }
  }
}

// --- Protocol Handlers ---

/**
 * Handles the processing of an Across deposit event (V3FundsDeposited).
 * It creates or updates a deposit record based on the event data.
 * @param event - The V3FundsDeposited entity from the database.
 * @param depositRepo - The TypeORM repository for the Deposit entity.
 */
async function handleAcrossDeposit(
  event: entities.V3FundsDeposited,
  depositRepo: Repository<entities.Deposit>,
) {
  // Across uses internalHash (or relayHash) as the unique identifier
  const uniqueId = event.internalHash;

  await upsertDepositRecord(
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

/**
 * Handles the processing of an Across fill event (FilledV3Relay).
 * It updates an existing deposit record with the fill information.
 * @param event - The FilledV3Relay entity from the database.
 * @param depositRepo - The TypeORM repository for the Deposit entity.
 */
async function handleAcrossFill(
  event: entities.FilledV3Relay,
  depositRepo: Repository<entities.Deposit>,
) {
  const uniqueId = event.internalHash;

  await upsertDepositRecord(
    depositRepo,
    uniqueId,
    entities.DepositType.ACROSS,
    {
      originChainId: event.originChainId,
      destinationChainId: event.destinationChainId,
      filledV3RelayId: event.id,
      recipient: event.recipient,
      depositor: event.depositor,
      blockTimestamp: event.blockTimestamp, // Fallback timestamp
    },
    DepositUpdateType.FILL,
  );
}

/**
 * Handles the processing of a CCTP burn event, which signifies the start of a CCTP transfer.
 * It combines data from `MessageSent` and optionally `DepositForBurn` to create a deposit record.
 * @param data - An object containing the `MessageSent` and optional `DepositForBurn` entities.
 * @param depositRepo - The TypeORM repository for the Deposit entity.
 */
async function handleCctpBurn(
  data: {
    depositForBurn?: entities.DepositForBurn;
    messageSent: entities.MessageSent;
  },
  depositRepo: Repository<entities.Deposit>,
) {
  const { depositForBurn, messageSent } = data;
  const destinationChainId = getCctpDestinationChainFromDomain(
    messageSent.destinationDomain,
  ).toString();
  // CCTP's unique identifier for a transfer is the combination of the message nonce and the destination chain's domain.
  const uniqueId = `${messageSent.nonce}-${destinationChainId}`;

  // Prepare updates
  const updates: Partial<entities.Deposit> = {
    originChainId: getCctpDestinationChainFromDomain(
      messageSent.sourceDomain,
    ).toString(),
    destinationChainId,
    recipient: messageSent.recipient,
    blockTimestamp: messageSent.blockTimestamp,
  };

  if (depositForBurn) {
    updates.depositForBurnId = depositForBurn.id;
    updates.depositor = depositForBurn.depositor;
  }

  await upsertDepositRecord(
    depositRepo,
    uniqueId,
    entities.DepositType.CCTP,
    updates,
    DepositUpdateType.DEPOSIT,
  );
}

/**
 * Handles the processing of a CCTP mint event, which signifies the completion of a CCTP transfer.
 * It combines data from `MessageReceived` and optionally `MintAndWithdraw` to update a deposit record.
 * @param data - An object containing the `MessageReceived` and optional `MintAndWithdraw` entities.
 * @param depositRepo - The TypeORM repository for the Deposit entity.
 */
async function handleCctpMint(
  data: {
    mintAndWithdraw?: entities.MintAndWithdraw;
    messageReceived: entities.MessageReceived;
  },
  depositRepo: Repository<entities.Deposit>,
) {
  const { mintAndWithdraw, messageReceived } = data;

  // The unique identifier is derived from the nonce and the chain ID where the message was received.
  const uniqueId = `${messageReceived.nonce}-${messageReceived.chainId}`;

  const updates: Partial<entities.Deposit> = {
    originChainId: getCctpDestinationChainFromDomain(
      messageReceived.sourceDomain,
    ).toString(),
    destinationChainId: messageReceived.chainId,
    blockTimestamp: messageReceived.blockTimestamp,
  };

  if (mintAndWithdraw) {
    updates.mintAndWithdrawId = mintAndWithdraw.id;
    updates.recipient = mintAndWithdraw.mintRecipient;
  }

  await upsertDepositRecord(
    depositRepo,
    uniqueId,
    entities.DepositType.CCTP,
    updates,
    DepositUpdateType.FILL,
  );
}

/**
 * Handles the processing of an OFT (Omnichain Fungible Token) sent event.
 * This function creates or updates a deposit record when an OFT transfer is initiated.
 * @param event - The OFTSent entity from the database.
 * @param depositRepo - The TypeORM repository for the Deposit entity.
 */
async function handleOftSent(
  event: entities.OFTSent,
  depositRepo: Repository<entities.Deposit>,
) {
  await upsertDepositRecord(
    depositRepo,
    event.guid,
    entities.DepositType.OFT,
    {
      originChainId: event.chainId,
      destinationChainId: getChainIdForEndpointId(event.dstEid).toString(),
      blockTimestamp: event.blockTimestamp,
      depositor: event.fromAddress,
      oftSentId: event.id,
    },
    DepositUpdateType.DEPOSIT,
  );
}

/**
 * Handles the processing of an OFT (Omnichain Fungible Token) received event.
 * This function updates a deposit record when an OFT transfer is completed.
 * @param event - The OFTReceived entity from the database.
 * @param depositRepo - The TypeORM repository for the Deposit entity.
 */
async function handleOftReceived(
  event: entities.OFTReceived,
  depositRepo: Repository<entities.Deposit>,
) {
  await upsertDepositRecord(
    depositRepo,
    event.guid,
    entities.DepositType.OFT,
    {
      destinationChainId: event.chainId,
      originChainId: getChainIdForEndpointId(event.srcEid).toString(),
      recipient: event.toAddress,
      oftReceivedId: event.id,
      blockTimestamp: event.blockTimestamp,
    },
    DepositUpdateType.FILL,
  );
}

// --- Shared Core Logic ---

/**
 * Performs an "upsert" operation for a deposit record. It atomically inserts a new record
 * or updates an existing one based on a unique identifier. This is optimized to reduce
 * database round trips by using a single `INSERT ... ON CONFLICT` statement.
 * @param depositRepo - The TypeORM repository for the Deposit entity.
 * @param uniqueId - The unique identifier for the deposit (e.g., relayHash, CCTP nonce-chain, OFT guid).
 * @param type - The type of the deposit (e.g., ACROSS, CCTP, OFT).
 * @param updates - An object containing the fields to be inserted or updated.
 * @param updateType - The type of event triggering the upsert (DEPOSIT or FILL), which determines status handling.
 */
async function upsertDepositRecord(
  depositRepo: Repository<entities.Deposit>,
  uniqueId: string,
  type: entities.DepositType,
  updates: Partial<entities.Deposit>,
  updateType: DepositUpdateType,
): Promise<void> {
  // Prepare the full object to be inserted if the record does not exist.
  // The initial status is determined by whether the first seen event is a deposit or a fill.
  const insertData = {
    uniqueId,
    type,
    status:
      updateType === DepositUpdateType.FILL
        ? entities.DepositStatus.FILLED
        : entities.DepositStatus.PENDING,
    ...updates,
  };

  // Define the conflict target for the upsert operation.
  const conflictPaths = ["uniqueId"];

  // Filter out any keys from the `updates` object that have an `undefined` value.
  // This is crucial to prevent `null`ing out columns in the database that already have data
  // if the incoming update for that field is not present.
  const columnsToUpdate = Object.entries(updates)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);

  // If the event is a 'FILL', the status must be updated to 'FILLED'.
  // If it's a 'DEPOSIT' event, the status is only set on insert and not on update.
  // This prevents a late DEPOSIT event from overwriting a FILLED status.
  if (updateType === DepositUpdateType.FILL) {
    columnsToUpdate.push("status");
  }

  // Execute the upsert using the query builder for `INSERT ... ON CONFLICT` behavior.
  await depositRepo
    .createQueryBuilder()
    .insert()
    .into(entities.Deposit)
    .values(insertData)
    .orUpdate(columnsToUpdate, conflictPaths)
    .execute();
}
