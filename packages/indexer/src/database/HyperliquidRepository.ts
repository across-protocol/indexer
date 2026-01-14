import winston from "winston";
import { MoreThan } from "typeorm";
import * as across from "@across-protocol/sdk";
import {
  DataSource,
  entities,
  utils as dbUtils,
  SaveQueryResult,
} from "@repo/indexer-database";
import { HyperliquidDepositEvent } from "../data-indexing/adapter/hyperliquid/model";

export class HyperliquidRepository extends dbUtils.BlockchainEventRepository {
  constructor(
    postgres: DataSource,
    logger: winston.Logger,
    private chunkSize = 100,
  ) {
    super(postgres, logger);
  }

  public async deleteUnfinalisedHyperliquidDeposits(
    lastFinalisedBlock: number,
  ) {
    const repository = this.postgres.getRepository(entities.HyperliquidDeposit);
    return repository.delete({
      blockNumber: MoreThan(lastFinalisedBlock),
      finalised: false,
    });
  }

  /**
   * Generates hypercore identifier from user and nonce
   */
  private generateHypercoreIdentifier(user: string, nonce: string): string {
    if (!user || !nonce) {
      throw new Error(
        "user and nonce are required to generate hypercoreIdentifier",
      );
    }
    return `${user}-${nonce}`;
  }

  /**
   * Finds the CCTP burn event corresponding to a Hyperliquid deposit.
   * The transactionHash in HyperliquidDeposit is the EVM transaction hash from HyperEVM (MessageReceived transaction).
   * We find the MessageReceived event, then MessageSent using nonce and sourceDomain, then DepositForBurn using MessageSent's transactionHash.
   */
  private async findCctpBurnEvent(
    transactionHash: string,
  ): Promise<entities.DepositForBurn | null> {
    try {
      const messageReceivedRepo = this.postgres.getRepository(
        entities.MessageReceived,
      );
      const messageReceived = await messageReceivedRepo.findOne({
        where: {
          transactionHash,
          chainId: "999",
        },
      });

      if (!messageReceived) {
        this.logger.debug({
          at: "HyperliquidRepository#findCctpBurnEvent",
          message: "MessageReceived event not found for transaction hash",
          transactionHash,
        });
        return null;
      }

      const messageSentRepo = this.postgres.getRepository(entities.MessageSent);
      const messageSent = await messageSentRepo.findOne({
        where: {
          nonce: messageReceived.nonce,
          sourceDomain: messageReceived.sourceDomain,
        },
      });

      if (!messageSent) {
        this.logger.debug({
          at: "HyperliquidRepository#findCctpBurnEvent",
          message: "MessageSent event not found for MessageReceived",
          transactionHash,
          nonce: messageReceived.nonce,
          sourceDomain: messageReceived.sourceDomain,
        });
        return null;
      }

      const depositForBurnRepo = this.postgres.getRepository(
        entities.DepositForBurn,
      );
      const depositForBurn = await depositForBurnRepo.findOne({
        where: {
          transactionHash: messageSent.transactionHash,
          chainId: messageSent.chainId,
        },
      });

      if (!depositForBurn) {
        this.logger.debug({
          at: "HyperliquidRepository#findCctpBurnEvent",
          message: "DepositForBurn event not found for MessageSent",
          transactionHash,
          messageSentTransactionHash: messageSent.transactionHash,
          messageSentChainId: messageSent.chainId,
        });
        return null;
      }

      return depositForBurn;
    } catch (error: any) {
      this.logger.warn({
        at: "HyperliquidRepository#findCctpBurnEvent",
        message: "Error finding CCTP burn event",
        transactionHash,
        error: error.message,
      });
      return null;
    }
  }

  public async formatAndSaveHyperliquidDeposits(
    deposits: HyperliquidDepositEvent[],
    lastFinalisedBlock: number,
    blockDates: Record<number, Date>,
  ) {
    const formattedEvents: Partial<entities.HyperliquidDeposit>[] =
      deposits.map((deposit) => {
        if (!deposit.user) {
          throw new Error("user is required for HyperliquidDeposit");
        }
        if (!deposit.nonce) {
          throw new Error("nonce is required for HyperliquidDeposit");
        }

        return {
          blockNumber: deposit.blockNumber,
          transactionHash: deposit.transactionHash,
          blockTimestamp:
            deposit.blockTimestamp || blockDates[deposit.blockNumber]!,
          user: deposit.user,
          amount: deposit.amount,
          token: deposit.token,
          depositType: deposit.depositType,
          nonce: deposit.nonce,
          hypercoreIdentifier: this.generateHypercoreIdentifier(
            deposit.user,
            deposit.nonce,
          ),
          finalised: deposit.blockNumber <= lastFinalisedBlock,
        };
      });

    const chunkedEvents = across.utils.chunk(formattedEvents, this.chunkSize);
    const savedEvents = await Promise.all(
      chunkedEvents.map((eventsChunk) =>
        this.saveAndHandleFinalisationBatch<entities.HyperliquidDeposit>(
          entities.HyperliquidDeposit,
          eventsChunk,
          ["hypercoreIdentifier"],
          [],
        ),
      ),
    );
    const result = savedEvents.flat();

    // Link to CCTP burn events after saving
    await Promise.all(
      result.map(async (saveResult) => {
        if (
          saveResult.result === "inserted" ||
          saveResult.result === "updated"
        ) {
          const deposit = saveResult.data;
          if (deposit && deposit.transactionHash) {
            const burnEvent = await this.findCctpBurnEvent(
              deposit.transactionHash,
            );
            if (burnEvent) {
              const repo = this.postgres.getRepository(
                entities.HyperliquidDeposit,
              );
              await repo.update({ id: deposit.id }, {
                cctpBurnEventId: burnEvent.id,
              } as any);
            }
          }
        }
      }),
    );

    return result;
  }
}
