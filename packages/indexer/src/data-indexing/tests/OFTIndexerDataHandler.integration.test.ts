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
import {
  OFT_DST_HANDLER_ADDRESS,
  SPONSORED_OFT_SRC_PERIPHERY_ADDRESS,
} from "../adapter/oft/service";

describe("OFTIndexerDataHandler", () => {
  let dataSource: DataSource;
  let oftRepository: OftRepository;
  let logger: Logger;
  let provider: across.providers.RetryProvider;
  let handler: OFTIndexerDataHandler;

  function setupTestForChainId(chainId: number) {
    provider = createTestRetryProvider(chainId, logger);
    handler = new OFTIndexerDataHandler(
      logger,
      chainId,
      provider,
      oftRepository,
    );
  }

  beforeEach(async () => {
    dataSource = await getTestDataSource();

    logger = {
      debug: sinon.spy(),
      info: sinon.spy(),
      warn: sinon.spy(),
      error: sinon.spy(),
    } as unknown as Logger;

    oftRepository = new OftRepository(dataSource, logger);
  });

  afterEach(async () => {
    sinon.restore();
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("should process a block range and store SponsoredOFTSend event", async () => {
    // Trying to fetch https://arbiscan.io/tx/0x2bc0a3844389de155fac8a91cae44a01379ab9b13aa135cb69f368985b0ae85a
    const transactionHash =
      "0x2bc0a3844389de155fac8a91cae44a01379ab9b13aa135cb69f368985b0ae85a";
    const blockNumber = 394505590;
    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };
    // TODO: Remove this reassign after production deployment is certain
    SPONSORED_OFT_SRC_PERIPHERY_ADDRESS[CHAIN_IDs.ARBITRUM] =
      "0x1235Ac1010FeeC8ae22744f323416cBBE37feDbE";

    setupTestForChainId(CHAIN_IDs.ARBITRUM);
    // We need to stub the filterTransactionsFromSwapApi method to avoid filtering out our test transaction
    sinon.stub(handler as any, "filterTransactionsFromSwapApi").resolvesArg(1);
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

  it("should process a block range and store SimpleTransferFlowCompleted event for OFT", async () => {
    const transactionHash =
      "0xf72cfb2c0a9f781057cd4f7beca6fc6bd9290f1d73adef1142b8ac1b0ed7186c";
    const blockNumber = 18414987;
    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };

    // TODO: Remove this reassign after production deployment is certain
    OFT_DST_HANDLER_ADDRESS[CHAIN_IDs.HYPEREVM] =
      "0x2beF20D17a17f6903017d27D1A35CC9Dc72b0888";

    setupTestForChainId(CHAIN_IDs.HYPEREVM);
    // We need to stub the filterTransactionsFromSwapApi method to avoid filtering out our test transaction
    sinon.stub(handler as any, "filterTransactionsFromSwapApi").resolvesArg(1);
    await handler.processBlockRange(blockRange, blockNumber - 1);

    const simpleTransferFlowCompletedRepo = dataSource.getRepository(
      entities.SimpleTransferFlowCompleted,
    );
    const savedEvent = await simpleTransferFlowCompletedRepo.findOne({
      where: { transactionHash: transactionHash },
    });

    expect(savedEvent).to.exist;
    expect(savedEvent!.transactionHash).to.equal(transactionHash);
    expect(savedEvent!.blockNumber).to.equal(blockNumber);
    expect(savedEvent!.quoteNonce).to.equal(
      "0x49a117e77ab01fd0d76ce06b042baa7b634cc7ff8b8749afbbfd0d5b09797ea7",
    );
    expect(savedEvent!.finalRecipient).to.equal(
      "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
    );
    expect(savedEvent!.finalToken).to.equal(
      "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
    );
    expect(savedEvent!.evmAmountIn.toString()).to.equal("1000000");
    expect(savedEvent!.bridgingFeesIncurred.toString()).to.equal("0");
    expect(savedEvent!.evmAmountSponsored.toString()).to.equal("0");
  }).timeout(20000);

  it("should process a block range and store FallbackHyperEVMFlowCompleted event for OFT", async () => {
    const transactionHash =
      "0x05ccdbd44e8ffbed8f057762f40dee73fb218049347705d88f839dfe3c368c52";
    const blockNumber = 17917691;
    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };

    // TODO: Remove this reassign after production deployment is certain
    OFT_DST_HANDLER_ADDRESS[CHAIN_IDs.HYPEREVM] =
      "0x2beF20D17a17f6903017d27D1A35CC9Dc72b0888";

    setupTestForChainId(CHAIN_IDs.HYPEREVM);
    // We need to stub the filterTransactionsFromSwapApi method to avoid filtering out our test transaction
    sinon.stub(handler as any, "filterTransactionsFromSwapApi").resolvesArg(1);
    await handler.processBlockRange(blockRange, blockNumber - 1);

    const fallbackHyperEVMFlowCompletedRepo = dataSource.getRepository(
      entities.FallbackHyperEVMFlowCompleted,
    );
    const savedEvent = await fallbackHyperEVMFlowCompletedRepo.findOne({
      where: { transactionHash: transactionHash },
    });

    expect(savedEvent).to.exist;
    expect(savedEvent!.transactionHash).to.equal(transactionHash);
    expect(savedEvent!.blockNumber).to.equal(blockNumber);
    expect(savedEvent!.quoteNonce).to.equal(
      "0x0000000000000000000000000000000000000000000000000000000069041bd4",
    );
    expect(savedEvent!.finalRecipient).to.equal(
      "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
    );
    expect(savedEvent!.finalToken).to.equal(
      "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
    );
    expect(savedEvent!.evmAmountIn.toString()).to.equal("1005000");
    expect(savedEvent!.bridgingFeesIncurred.toString()).to.equal("0");
    expect(savedEvent!.evmAmountSponsored.toString()).to.equal("0");
  }).timeout(20000);

  it("should fetch and store SponsoredAccountActivation event in the database", async () => {
    const transactionHash =
      "0x5008ce0be97eb5b8b0a1f8854826f33d33e5038a31c793569354ec2dc66ddfef";
    const blockNumber = 18007251;

    // TODO: Remove this reassign after production deployment is certain
    OFT_DST_HANDLER_ADDRESS[CHAIN_IDs.HYPEREVM] =
      "0x2beF20D17a17f6903017d27D1A35CC9Dc72b0888";

    setupTestForChainId(CHAIN_IDs.HYPEREVM);

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };

    // We need to stub the filterTransactionsFromSwapApi method to avoid filtering out our test transaction
    sinon.stub(handler as any, "filterTransactionsFromSwapApi").resolvesArg(1);

    await handler.processBlockRange(blockRange, blockNumber);

    const sponsoredAccountActivationRepository = dataSource.getRepository(
      entities.SponsoredAccountActivation,
    );
    const savedEvent = await sponsoredAccountActivationRepository.findOne({
      where: { transactionHash: transactionHash },
    });

    expect(savedEvent).to.exist;
    expect(savedEvent!.transactionHash).to.equal(transactionHash);
    expect(savedEvent!.blockTimestamp).to.exist;
    expect(savedEvent!.blockNumber).to.equal(blockNumber);
    expect(savedEvent!.quoteNonce).to.equal(
      "0x0000000000000000000000000000000000000000000000000000000069056cc8",
    );
    expect(savedEvent!.finalRecipient).to.equal(
      "0xb8ecd15c43172c0285bEA20e4D3c185980ca610A",
    );
    expect(savedEvent!.fundingToken).to.equal(
      "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
    );
    expect(savedEvent!.evmAmountSponsored.toString()).to.equal("1000000");
  }).timeout(20000);

  it("should fetch and store SwapFlowInitialized event in the database", async () => {
    // Taken from https://hyperevmscan.io/tx/0x9af51c6c1cfd7ce2daaeaaaba1832071ef0033dc49da5e0406b5c3f314da39de#eventlog#0
    const transactionHash =
      "0x9af51c6c1cfd7ce2daaeaaaba1832071ef0033dc49da5e0406b5c3f314da39de";

    const blockNumber = 21474788;
    setupTestForChainId(CHAIN_IDs.HYPEREVM);

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };

    // We need to stub the filterTransactionsFromSwapApi method to avoid filtering out our test transaction
    sinon.stub(handler as any, "filterTransactionsFromSwapApi").resolvesArg(1);

    await handler.processBlockRange(blockRange, blockNumber);

    const swapFlowInitializedRepository = dataSource.getRepository(
      entities.SwapFlowInitialized,
    );

    const savedEvent = await swapFlowInitializedRepository.findOne({
      where: { transactionHash: transactionHash },
    });
    expect(savedEvent).to.deep.include({
      // Identity & Indexing
      chainId: CHAIN_IDs.HYPEREVM,
      blockNumber: blockNumber,
      transactionHash: transactionHash,
      logIndex: 0,
      transactionIndex: 0,
      finalised: true,
      quoteNonce:
        "0x48af6868cc5ac8b9be544d9c70a86d17246066b4be4bcfe4a7ee8ecb5bb25c60",
      finalRecipient: "0x9A8f92a830A5cB89a3816e3D267CB7791c16b04D",
      finalToken: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
      // Amounts (Expected as strings for 'numeric'/'bigint' columns)
      evmAmountIn: 1000000,
      bridgingFeesIncurred: 0,
      coreAmountIn: 100000000,
      minAmountToSend: 95000000,
      maxAmountToSend: 100000000,
    });

    // Date Assertion
    // We check that it is a valid date object, rather than a specific ms timestamp
    expect(savedEvent!.blockTimestamp).to.be.instanceOf(Date);
  }).timeout(20000);
});
