import { DataSource, entities } from "@repo/indexer-database";

/**
 * Finds the CCTP burn event corresponding to a Hyperliquid deposit.
 * The transactionHash in HyperliquidDeposit is the EVM transaction hash from HyperEVM (MessageReceived transaction).
 * We find the MessageReceived event, then MessageSent using nonce and sourceDomain, then DepositForBurn using MessageSent's transactionHash.
 *
 * @param db - The database connection
 * @param transactionHash - The transaction hash from the HyperliquidDeposit (MessageReceived transaction hash)
 * @returns The DepositForBurn event if found, null otherwise
 */
export async function findCctpBurnEventForHyperliquidDeposit(
  db: DataSource,
  transactionHash: string,
): Promise<entities.DepositForBurn | null> {
  try {
    const messageReceivedRepo = db.getRepository(entities.MessageReceived);
    const messageReceived = await messageReceivedRepo.findOne({
      where: {
        transactionHash,
        chainId: "999",
      },
    });

    if (!messageReceived) {
      return null;
    }

    const messageSentRepo = db.getRepository(entities.MessageSent);
    const messageSent = await messageSentRepo.findOne({
      where: {
        nonce: messageReceived.nonce,
        sourceDomain: messageReceived.sourceDomain,
      },
    });

    if (!messageSent) {
      return null;
    }

    const depositForBurnRepo = db.getRepository(entities.DepositForBurn);
    const depositForBurn = await depositForBurnRepo.findOne({
      where: {
        transactionHash: messageSent.transactionHash,
        chainId: messageSent.chainId,
      },
    });

    return depositForBurn || null;
  } catch (error: any) {
    return null;
  }
}
