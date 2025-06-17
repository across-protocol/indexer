import * as across from "@across-protocol/sdk";
import { Address } from "@solana/kit";
import { Contract } from "ethers";
import winston from "winston";

function defaultGetBlockNumbers(
  timestamps: number[],
): Promise<{ [quoteTimestamp: number]: number }> {
  return Promise.resolve(
    Object.fromEntries(
      timestamps.map((timestamp) => [
        timestamp,
        across.utils.MAX_BIG_INT.toNumber(),
      ]),
    ),
  );
}

/**
 * Custom EVM spoke pool client that allows for disabling quote block lookup
 */
export class EvmSpokePoolClient extends across.clients.EVMSpokePoolClient {
  constructor(
    logger: winston.Logger,
    spokePool: Contract,
    hubPoolClient: across.clients.HubPoolClient | null,
    chainId: number,
    deploymentBlock: number,
    eventSearchConfig?: across.utils.MakeOptional<
      across.utils.EventSearchConfig,
      "to"
    >,
    private disableQuoteBlockLookup = false,
  ) {
    super(
      logger,
      spokePool,
      hubPoolClient,
      chainId,
      deploymentBlock,
      eventSearchConfig,
    );
  }

  protected getBlockNumbers(
    timestamps: number[],
  ): Promise<{ [quoteTimestamp: number]: number }> {
    return this.hubPoolClient && !this.disableQuoteBlockLookup
      ? this.hubPoolClient.getBlockNumbers(timestamps)
      : defaultGetBlockNumbers(timestamps);
  }
}

/**
 * Custom SVM spoke pool client that allows for disabling quote block lookup
 */
export class SvmSpokePoolClient extends across.clients.SVMSpokePoolClient {
  constructor(
    logger: winston.Logger,
    hubPoolClient: across.clients.HubPoolClient | null,
    chainId: number,
    deploymentSlot: bigint,
    eventSearchConfig: across.utils.MakeOptional<
      across.utils.EventSearchConfig,
      "to"
    >,
    svmEventsClient: across.arch.svm.SvmCpiEventsClient,
    programId: Address,
    statePda: Address,
    private disableQuoteBlockLookup = false,
  ) {
    super(
      logger,
      hubPoolClient,
      chainId,
      deploymentSlot,
      eventSearchConfig,
      svmEventsClient,
      programId,
      statePda,
    );
  }

  protected getBlockNumbers(
    timestamps: number[],
  ): Promise<{ [quoteTimestamp: number]: number }> {
    return this.hubPoolClient && !this.disableQuoteBlockLookup
      ? this.hubPoolClient.getBlockNumbers(timestamps)
      : defaultGetBlockNumbers(timestamps);
  }
}
