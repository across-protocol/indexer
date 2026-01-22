import { CHAIN_IDs } from "@across-protocol/constants";
import * as across from "@across-protocol/sdk";
import { expect } from "chai";
import * as sinon from "sinon";
import { DataSource } from "typeorm";
import { Logger } from "winston";

import { entities } from "@repo/indexer-database";

import { CCTPRepository } from "../../database/CctpRepository";
import { PubSubService } from "../../pubsub/service";
import { getTestDataSource } from "../../tests/setup";
import { createTestRetryProvider } from "../../tests/testProvider";
import { BlockRange } from "../model";
import { CctpFinalizerService } from "../service/CctpFinalizerService";
import { CCTPIndexerDataHandler } from "../service/CCTPIndexerDataHandler";
import { stubContractUtils } from "./utils";

describe("CctpFinalizerService", () => {
  let dataSource: DataSource;
  let cctpRepository: CCTPRepository;
  let logger: Logger;
  let provider: across.providers.RetryProvider;
  let handler: CCTPIndexerDataHandler;
  let finalizerService: CctpFinalizerService;
  let pubSubServiceStub: sinon.SinonStubbedInstance<PubSubService>;

  function setupTestForChainId(chainId: number) {
    provider = createTestRetryProvider(chainId, logger);
    handler = new CCTPIndexerDataHandler(
      logger,
      chainId,
      provider,
      cctpRepository,
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

    cctpRepository = new CCTPRepository(dataSource, logger);

    // Setup PubSubService stub
    pubSubServiceStub = sinon.createStubInstance(PubSubService);

    // Note: finalizerService will be instantiated but we might need to rely on the shared dataSource
    // which is used by cctpRepository and the handler.
    finalizerService = new CctpFinalizerService(
      logger,
      dataSource,
      pubSubServiceStub as unknown as PubSubService,
      true, // enablePubSub - set to true for tests to verify pubsub calls
    );
  });

  afterEach(async () => {
    sinon.restore();
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  async function fetchAndStoreEvents(chainId: number, blockNumber: number) {
    setupTestForChainId(chainId);

    const blockRange: BlockRange = {
      from: blockNumber,
      to: blockNumber,
    };

    // Force stub the filterTransactionsFromSwapApi to ensure we don't filter out test events
    // that might miss the swap api marker or other criteria.
    sinon.stub(handler as any, "filterTransactionsFromSwapApi").resolvesArg(1);

    await handler.processBlockRange(blockRange, blockNumber);
  }

  it("should publish with signature when sponsored event exists", async () => {
    const sponsoredTxHash =
      "0x8c765798a32efd63d0e6e17e77943b3db5b5abb7b19dc34ef660b7d297b65adc";
    const blockNumber = 418533793;
    const chainId = CHAIN_IDs.ARBITRUM;

    // We need to stub the contract address as the event we are fetching is exclusive to this address and the contract address can change with bumps of the across contracts beta package
    stubContractUtils(
      "SponsoredCCTPSrcPeriphery",
      "0xce1FFE01eBB4f8521C12e74363A396ee3d337E1B",
      CHAIN_IDs.ARBITRUM,
    );

    await fetchAndStoreEvents(chainId, blockNumber);

    // Verify events are in DB
    const depositForBurnRepo = dataSource.getRepository(
      entities.DepositForBurn,
    );
    const sponsoredRepo = dataSource.getRepository(
      entities.SponsoredDepositForBurn,
    );

    const burnEvent = await depositForBurnRepo.findOne({
      where: { transactionHash: sponsoredTxHash },
    });
    const sponsoredEvent = await sponsoredRepo.findOne({
      where: { transactionHash: sponsoredTxHash },
    });

    expect(burnEvent, "DepositForBurn event should exist").to.exist;
    expect(sponsoredEvent, "SponsoredDepositForBurn event should exist").to
      .exist;

    // Run taskLogic
    await (finalizerService as any).taskLogic();

    // Verify publishCctpFinalizerMessage was called with signature
    expect(pubSubServiceStub.publishCctpFinalizerMessage.called).to.be.true;
    // Find the call for this tx
    const calls = pubSubServiceStub.publishCctpFinalizerMessage.getCalls();
    const call = calls.find((c) => c.args[0] === sponsoredTxHash);
    expect(call, "Should call publishCctpFinalizerMessage for the tx").to.exist;

    // publishCctpFinalizerMessage(txHash, chainId, message, attestation, destinationChainId, signature)
    expect(call!.args[5]).to.equal(sponsoredEvent!.signature);
  }).timeout(30000);

  it("should log error when sponsored event is missing but expected", async () => {
    const transactionHash =
      "0x8c765798a32efd63d0e6e17e77943b3db5b5abb7b19dc34ef660b7d297b65adc";
    const blockNumber = 418533793;
    const chainId = CHAIN_IDs.ARBITRUM;

    // We need to stub the contract address as the event we are fetching is exclusive to this address and the contract address can change with bumps of the across contracts beta package
    stubContractUtils(
      "SponsoredCCTPSrcPeriphery",
      "0xce1FFE01eBB4f8521C12e74363A396ee3d337E1B",
      CHAIN_IDs.ARBITRUM,
    );

    // Fetch the SPONSORED transaction data
    await fetchAndStoreEvents(chainId, blockNumber);

    // DELETE the SponsoredDepositForBurn event to simulate inconsistency
    const sponsoredRepo = dataSource.getRepository(
      entities.SponsoredDepositForBurn,
    );
    await sponsoredRepo.delete({ transactionHash: transactionHash });

    const sponsoredEvent = await sponsoredRepo.findOne({
      where: { transactionHash: transactionHash },
    });
    expect(sponsoredEvent, "SponsoredDepositForBurn event should be deleted").to
      .be.null;

    // Run taskLogic
    await (finalizerService as any).taskLogic();

    // Verify: Should NOT publish, should LOG ERROR
    // Ensure no message published for this tx
    const calls = pubSubServiceStub.publishCctpFinalizerMessage.getCalls();
    const call = calls.find((c) => c.args[0] === transactionHash);
    expect(call, "Should NOT publish message for this tx").to.be.undefined;

    // Verify error log
    expect(
      (logger.error as sinon.SinonSpy).calledWithMatch({
        message: "Sponsored event defined by addresses but not found in DB",
        burnEvent: sinon.match.has("transactionHash", transactionHash),
      }),
    ).to.be.true;
  }).timeout(30000);

  it("should publish without signature when sponsored event is not expected", async () => {
    const normalTxHash =
      "0x3bb8860c6f7af9ca63ebbf69a0324d05412d44d7d44c6bb3c02e2d5df43e6a2a";
    const normalBlockNumber = 418565603;
    const chainId = CHAIN_IDs.ARBITRUM;

    await fetchAndStoreEvents(chainId, normalBlockNumber);

    // Verify events are in DB
    const depositForBurnRepo = dataSource.getRepository(
      entities.DepositForBurn,
    );
    const sponsoredRepo = dataSource.getRepository(
      entities.SponsoredDepositForBurn,
    );

    const burnEvent = await depositForBurnRepo.findOne({
      where: { transactionHash: normalTxHash },
    });
    // Should NOT have a sponsored event
    const sponsoredEvent = await sponsoredRepo.findOne({
      where: { transactionHash: normalTxHash },
    });

    expect(burnEvent, "DepositForBurn event should exist").to.exist;
    expect(sponsoredEvent, "SponsoredDepositForBurn event should NOT exist").to
      .be.null;

    // Run taskLogic
    await (finalizerService as any).taskLogic();

    // Verify publishCctpFinalizerMessage was called WITHOUT signature
    expect(pubSubServiceStub.publishCctpFinalizerMessage.called).to.be.true;

    const calls = pubSubServiceStub.publishCctpFinalizerMessage.getCalls();
    const call = calls.find((c) => c.args[0] === normalTxHash);
    expect(call, "Should call publishCctpFinalizerMessage for the tx").to.exist;

    // publishCctpFinalizerMessage(txHash, chainId, message, attestation, destinationChainId, signature)
    // Signature (index 5) should be undefined
    expect(call!.args[5]).to.be.undefined;
  }).timeout(30000);
});
