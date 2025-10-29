import { expect } from "chai";
import { DataSource } from "typeorm";
import { Logger } from "winston";
import { ethers } from "ethers";
import * as across from "@across-protocol/sdk";
import Redis from "ioredis";
import * as sinon from "sinon";
import { getTestDataSource } from "../../tests/setup";
import { CCTPIndexerDataHandler } from "../service/CCTPIndexerDataHandler";
import { CCTPRepository } from "../../database/CctpRepository";
import { BlockRange } from "../model";
import { RetryProviderConfig, parseProvidersUrls } from "../../parseEnv";
import { createTestRetryProvider } from "../../tests/testProvider";
import { assert } from "@repo/error-handling";
import { CHAIN_IDs } from "@across-protocol/constants";

describe("CCTPIndexerDataHandler", () => {
  let dataSource: DataSource;
  let cctpRepository: CCTPRepository;
  let logger: Logger;
  let provider: across.providers.RetryProvider;
  let handler: CCTPIndexerDataHandler;

  beforeEach(async () => {
    dataSource = await getTestDataSource();

    logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    } as unknown as Logger;

    cctpRepository = new CCTPRepository(dataSource, logger);

    const providerUrls = parseProvidersUrls().get(CHAIN_IDs.ARBITRUM_SEPOLIA);
    if (!providerUrls || providerUrls.length === 0) {
      throw new Error(
        `No RPC provider URL found for chain ID ${CHAIN_IDs.ARBITRUM_SEPOLIA}`,
      );
    }
    const ARBITRUM_SEPOLIA_RPC_URL = providerUrls[0];
    assert(
      ARBITRUM_SEPOLIA_RPC_URL,
      `RPC URL for chain ID ${CHAIN_IDs.ARBITRUM_SEPOLIA} is undefined`,
    );
    provider = createTestRetryProvider(
      ARBITRUM_SEPOLIA_RPC_URL,
      CHAIN_IDs.ARBITRUM_SEPOLIA,
      logger,
    );

    handler = new CCTPIndexerDataHandler(
      logger,
      CHAIN_IDs.ARBITRUM_SEPOLIA,
      provider,
      cctpRepository,
    );
  });

  afterEach(async () => {
    sinon.restore();
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("should fetch events for a given block range including a sample transaction", async () => {
    const transactionHash =
      "0xcb92b553ebf00a2fff5ab04d4966b5a1d4a37afec858308e4d87ef12bea63576";
    const blockNumber = 209540538;

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };
    // We need to stub the filterTransactionsFromSwapApi method to avoid filtering out our test transaction
    sinon.stub(handler as any, "filterTransactionsFromSwapApi").resolvesArg(1);

    const events = await handler.fetchEventsByRange(blockRange);

    expect(events.sponsoredBurnEvents).to.have.lengthOf(1);
    expect(events.sponsoredBurnEvents[0]!.transactionHash).to.equal(
      transactionHash,
    );
  }).timeout(10000); // Increase timeout for network requests
});
