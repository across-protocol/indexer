import * as across from "@across-protocol/sdk";
import { Contract } from "ethers";
import winston from "winston";

export class SpokePoolClient extends across.clients.SpokePoolClient {
  constructor(
    logger: winston.Logger,
    spokePool: Contract,
    hubPoolClient: across.clients.HubPoolClient | null,
    chainId: number,
    deploymentBlock: number,
    eventSearchConfig?: across.utils.MakeOptional<
      across.utils.EventSearchConfig,
      "toBlock"
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
      : Promise.resolve(
          Object.fromEntries(
            timestamps.map((timestamp) => [
              timestamp,
              across.utils.MAX_BIG_INT.toNumber(),
            ]),
          ),
        );
  }
}
