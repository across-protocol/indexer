import { expect } from "chai";
import { DataSource } from "typeorm";
import { Logger } from "winston";
import * as across from "@across-protocol/sdk";
import sinon from "sinon";
import { CHAIN_IDs } from "@across-protocol/constants";
import { entities } from "@repo/indexer-database";
import { OFTIndexerDataHandler } from "../service/OFTIndexerDataHandler";
import { OftRepository } from "../../database/OftRepository";
import { BlockRange } from "../model";
import { createTestRetryProvider } from "../../tests/testProvider";
import { getTestDataSource } from "../../tests/setup";

describe("OFTIndexerDataHandler", () => {
  let dataSource: DataSource;
  let oftRepository: OftRepository;
  let logger: Logger;
  let provider: across.providers.RetryProvider;
  let handler: OFTIndexerDataHandler;

  const transactionHash =
    "0x2bc0a3844389de155fac8a91cae44a01379ab9b13aa135cb69f368985b0ae85a";
  const blockNumber = 168661609;

  beforeEach(async () => {
    dataSource = await getTestDataSource();

    logger = {
      debug: sinon.spy(),
      info: sinon.spy(),
      warn: sinon.spy(),
      error: sinon.spy(),
    } as unknown as Logger;

    oftRepository = new OftRepository(dataSource, logger);
    provider = createTestRetryProvider(CHAIN_IDs.ARBITRUM, logger);

    handler = new OFTIndexerDataHandler(
      logger,
      CHAIN_IDs.ARBITRUM,
      provider,
      oftRepository,
    );
  });

  afterEach(async () => {
    sinon.restore();
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("should process a block range and store SponsoredOFTSend event", async () => {
    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };

    await handler.processBlockRange(blockRange, blockNumber - 1);

    const sponsoredOFTSendRepo = dataSource.getRepository(
      entities.SponsoredOFTSend,
    );
    const savedEvent = await sponsoredOFTSendRepo.findOne({
      where: { transactionHash: transactionHash },
    });

    expect(savedEvent).to.exist;
    expect(savedEvent!.transactionHash).to.equal(transactionHash);
    expect(savedEvent!.blockNumber).to.equal(blockNumber);
  }).timeout(20000);
});
