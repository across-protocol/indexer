import { expect } from "chai";
import { DataSource } from "typeorm";
import { Logger } from "winston";
import sinon from "sinon";
import { CHAIN_IDs } from "@across-protocol/constants";
import { entities, fixtures } from "@repo/indexer-database";
import {
  CctpFinalizerServiceManager,
  CCTP_FINALIZER_RETRY_DELAY_HOURS,
} from "../service/CctpFinalizerService";
import { PubSubService } from "../../pubsub/service";
import { Config } from "../../parseEnv";
import { getTestDataSource } from "../../tests/setup";
import * as CctpV2Service from "../adapter/cctp-v2/service";

describe("CctpFinalizerService", () => {
  let dataSource: DataSource;
  let logger: Logger;
  let manager: CctpFinalizerServiceManager;
  let config: Config;
  let publishMessageStub: sinon.SinonStub;

  beforeEach(async () => {
    dataSource = await getTestDataSource();

    logger = {
      debug: sinon.spy(),
      info: sinon.spy(),
      warn: sinon.spy(),
      error: sinon.spy(),
    } as unknown as Logger;

    publishMessageStub = sinon.stub().resolves();

    config = {
      enableCctpFinalizer: true,
      pubSubCctpFinalizerTopic: "test-topic",
      pubSubGcpProjectId: "test-project",
    } as unknown as Config;

    // Stub PubSubService's publishCctpFinalizerMessage method
    sinon
      .stub(PubSubService.prototype, "publishCctpFinalizerMessage")
      .callsFake(publishMessageStub as any);

    manager = new CctpFinalizerServiceManager(logger, config, dataSource);
  });

  afterEach(async () => {
    sinon.restore();
    if (manager) {
      await manager.stopGracefully();
    }
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  describe("publishBurnEvent", () => {
    it("should create CctpFinalizerJob when publishing a new burn event", async () => {
      const jobRepo = dataSource.getRepository(entities.CctpFinalizerJob);
      const messageSentFixture = new fixtures.MessageSentFixture(dataSource);
      const depositForBurnFixture = new fixtures.DepositForBurnFixture(
        dataSource,
      );

      await messageSentFixture.insertMessageSentEvents([
        {
          chainId: CHAIN_IDs.ARBITRUM.toString(),
          blockNumber: 1000,
          transactionHash: "0x123",
          transactionIndex: 0,
          logIndex: 0,
          message: "0xmessage",
          version: 1,
          sourceDomain: 3,
          destinationDomain: 6,
          nonce: "0xnonce",
          sender: "0xsender",
          recipient: "0xrecipient",
          destinationCaller: "0xcaller",
          minFinalityThreshold: 1000,
          finalityThresholdExecuted: 0,
          messageBody: "0xbody",
          finalised: true,
          blockTimestamp: new Date(Date.now() - 20 * 60 * 1000), // 20 minutes ago
        },
      ]);

      const [burnEvent] =
        await depositForBurnFixture.insertDepositForBurnEvents([
          {
            chainId: CHAIN_IDs.ARBITRUM.toString(),
            blockNumber: 1000,
            transactionHash: "0x123",
            transactionIndex: 0,
            logIndex: 1,
            burnToken: "0xtoken",
            amount: "1000000",
            depositor: "0xdepositor",
            mintRecipient: "0xrecipient",
            destinationDomain: 6,
            destinationTokenMessenger: "0xmessenger",
            destinationCaller: "0xcaller",
            maxFee: "1000",
            minFinalityThreshold: 1000,
            hookData: "0xhook",
            finalised: true,
            blockTimestamp: new Date(Date.now() - 20 * 60 * 1000), // 20 minutes ago
          },
        ]);

      const fetchAttestationsStub = sinon
        .stub(CctpV2Service, "fetchAttestationsForTxn")
        .resolves({
          messages: [
            {
              attestation: "0xattestation",
              eventNonce: "0xnonce",
              message: "0xmessage",
              status: "complete",
            },
          ],
        });

      const getDomainStub = sinon
        .stub(CctpV2Service, "getCctpDomainForChainId")
        .returns(3);

      const getDestinationChainStub = sinon
        .stub(CctpV2Service, "getCctpDestinationChainFromDomain")
        .returns(CHAIN_IDs.BASE);

      const isProductionStub = sinon
        .stub(CctpV2Service, "isProductionNetwork")
        .returns(true);

      const service = (manager as any).service;
      await (service as any).publishBurnEvent(burnEvent);

      // Verify job was created
      const job = await jobRepo.findOne({
        where: { burnEventId: burnEvent?.id },
      });

      expect(job).to.exist;
      expect(job!.attestation).to.equal("0xattestation");
      expect(job!.message).to.equal("0xmessage");
      expect(publishMessageStub.callCount).to.equal(1);

      fetchAttestationsStub.restore();
      getDomainStub.restore();
      getDestinationChainStub.restore();
      isProductionStub.restore();
    });

    it("should skip burn event if attestation time has not passed", async () => {
      const depositForBurnFixture = new fixtures.DepositForBurnFixture(
        dataSource,
      );

      const [burnEvent] =
        await depositForBurnFixture.insertDepositForBurnEvents([
          {
            chainId: CHAIN_IDs.ARBITRUM.toString(),
            blockNumber: 1000,
            transactionHash: "0x456",
            transactionIndex: 0,
            logIndex: 0,
            burnToken: "0xtoken",
            amount: "1000000",
            depositor: "0xdepositor",
            mintRecipient: "0xrecipient",
            destinationDomain: 6,
            destinationTokenMessenger: "0xmessenger",
            destinationCaller: "0xcaller",
            maxFee: "1000",
            minFinalityThreshold: 1000,
            hookData: "0xhook",
            finalised: true,
            blockTimestamp: new Date(), // Just now - attestation time hasn't passed
          },
        ]);

      const service = (manager as any).service;
      await (service as any).publishBurnEvent(burnEvent);

      // Verify job was not created and pubsub was not called
      const jobRepo = dataSource.getRepository(entities.CctpFinalizerJob);
      const job = await jobRepo.findOne({
        where: { burnEventId: burnEvent?.id },
      });

      expect(job).to.not.exist;
      expect(publishMessageStub.callCount).to.equal(0);
    });
  });

  describe("retryUnfinalizedTransactions", () => {
    it("should retry unfinalized transactions that meet retry criteria", async () => {
      const jobRepo = dataSource.getRepository(entities.CctpFinalizerJob);
      const messageSentFixture = new fixtures.MessageSentFixture(dataSource);
      const depositForBurnFixture = new fixtures.DepositForBurnFixture(
        dataSource,
      );

      await messageSentFixture.insertMessageSentEvents([
        {
          chainId: CHAIN_IDs.ARBITRUM.toString(),
          blockNumber: 1000,
          transactionHash: "0x789",
          transactionIndex: 0,
          logIndex: 0,
          message: "0xmessage",
          version: 1,
          sourceDomain: 3,
          destinationDomain: 6,
          nonce: "0xnonce",
          sender: "0xsender",
          recipient: "0xrecipient",
          destinationCaller: "0xcaller",
          minFinalityThreshold: 1000,
          finalityThresholdExecuted: 0,
          messageBody: "0xbody",
          finalised: true,
          blockTimestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
        },
      ]);

      const [burnEvent] =
        await depositForBurnFixture.insertDepositForBurnEvents([
          {
            chainId: CHAIN_IDs.ARBITRUM.toString(),
            blockNumber: 1000,
            transactionHash: "0x789",
            transactionIndex: 0,
            logIndex: 1,
            burnToken: "0xtoken",
            amount: "1000000",
            depositor: "0xdepositor",
            mintRecipient: "0xrecipient",
            destinationDomain: 6,
            destinationTokenMessenger: "0xmessenger",
            destinationCaller: "0xcaller",
            maxFee: "1000",
            minFinalityThreshold: 1000,
            hookData: "0xhook",
            finalised: true,
            blockTimestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago (within lookback)
          },
        ]);

      // Create an existing job that was created more than retry delay ago
      const oldJobTime = new Date(
        Date.now() - (CCTP_FINALIZER_RETRY_DELAY_HOURS + 1) * 60 * 60 * 1000,
      );
      const job = await jobRepo.save({
        attestation: "0xattestation",
        message: "0xmessage",
        burnEventId: burnEvent?.id,
        createdAt: oldJobTime,
        updatedAt: oldJobTime,
      });

      const fetchAttestationsStub = sinon
        .stub(CctpV2Service, "fetchAttestationsForTxn")
        .resolves({
          messages: [
            {
              attestation: "0xattestation",
              eventNonce: "0xnonce",
              message: "0xmessage",
              status: "complete",
            },
          ],
        });

      const getDomainStub = sinon
        .stub(CctpV2Service, "getCctpDomainForChainId")
        .returns(3);

      const getDestinationChainStub = sinon
        .stub(CctpV2Service, "getCctpDestinationChainFromDomain")
        .returns(CHAIN_IDs.BASE);

      const isProductionStub = sinon
        .stub(CctpV2Service, "isProductionNetwork")
        .returns(true);

      const service = (manager as any).service;
      await (service as any).retryUnfinalizedTransactions();

      // Verify pubsub was called (retry happened)
      expect(publishMessageStub.callCount).to.equal(1);

      fetchAttestationsStub.restore();
      getDomainStub.restore();
      getDestinationChainStub.restore();
      isProductionStub.restore();
    });

    it("should not retry if MessageReceived exists (transaction is finalized)", async () => {
      const jobRepo = dataSource.getRepository(entities.CctpFinalizerJob);
      const messageSentFixture = new fixtures.MessageSentFixture(dataSource);
      const depositForBurnFixture = new fixtures.DepositForBurnFixture(
        dataSource,
      );
      const messageReceivedRepo = dataSource.getRepository(
        entities.MessageReceived,
      );

      await messageSentFixture.insertMessageSentEvents([
        {
          chainId: CHAIN_IDs.ARBITRUM.toString(),
          blockNumber: 1000,
          transactionHash: "0xabc",
          transactionIndex: 0,
          logIndex: 0,
          message: "0xmessage",
          version: 1,
          sourceDomain: 3,
          destinationDomain: 6,
          nonce: "0xnonce",
          sender: "0xsender",
          recipient: "0xrecipient",
          destinationCaller: "0xcaller",
          minFinalityThreshold: 1000,
          finalityThresholdExecuted: 0,
          messageBody: "0xbody",
          finalised: true,
          blockTimestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
        },
      ]);

      await messageReceivedRepo.save({
        chainId: CHAIN_IDs.BASE.toString(),
        blockNumber: 2000,
        transactionHash: "0xreceived",
        transactionIndex: 0,
        logIndex: 0,
        caller: "0xcaller",
        sourceDomain: 3,
        nonce: "0xnonce",
        sender: "0xsender",
        finalityThresholdExecuted: 1,
        messageBody: "0xbody",
        finalised: true,
        blockTimestamp: new Date(),
      });

      const [burnEvent] =
        await depositForBurnFixture.insertDepositForBurnEvents([
          {
            chainId: CHAIN_IDs.ARBITRUM.toString(),
            blockNumber: 1000,
            transactionHash: "0xabc",
            transactionIndex: 0,
            logIndex: 1,
            burnToken: "0xtoken",
            amount: "1000000",
            depositor: "0xdepositor",
            mintRecipient: "0xrecipient",
            destinationDomain: 6,
            destinationTokenMessenger: "0xmessenger",
            destinationCaller: "0xcaller",
            maxFee: "1000",
            minFinalityThreshold: 1000,
            hookData: "0xhook",
            finalised: true,
            blockTimestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
          },
        ]);

      // Create an existing job
      const oldJobTime = new Date(
        Date.now() - (CCTP_FINALIZER_RETRY_DELAY_HOURS + 1) * 60 * 60 * 1000,
      );
      await jobRepo.save({
        attestation: "0xattestation",
        message: "0xmessage",
        burnEventId: burnEvent?.id,
        createdAt: oldJobTime,
        updatedAt: oldJobTime,
      });

      publishMessageStub.resetHistory();

      const service = (manager as any).service;
      await (service as any).retryUnfinalizedTransactions();

      // Verify pubsub was NOT called (transaction is finalized, no retry)
      expect(publishMessageStub.callCount).to.equal(0);
    });

    it("should not retry if job was created recently (within retry delay)", async () => {
      const jobRepo = dataSource.getRepository(entities.CctpFinalizerJob);
      const messageSentFixture = new fixtures.MessageSentFixture(dataSource);
      const depositForBurnFixture = new fixtures.DepositForBurnFixture(
        dataSource,
      );

      await messageSentFixture.insertMessageSentEvents([
        {
          chainId: CHAIN_IDs.ARBITRUM.toString(),
          blockNumber: 1000,
          transactionHash: "0xdef",
          transactionIndex: 0,
          logIndex: 0,
          message: "0xmessage",
          version: 1,
          sourceDomain: 3,
          destinationDomain: 6,
          nonce: "0xnonce",
          sender: "0xsender",
          recipient: "0xrecipient",
          destinationCaller: "0xcaller",
          minFinalityThreshold: 1000,
          finalityThresholdExecuted: 0,
          messageBody: "0xbody",
          finalised: true,
          blockTimestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
        },
      ]);

      const [burnEvent] =
        await depositForBurnFixture.insertDepositForBurnEvents([
          {
            chainId: CHAIN_IDs.ARBITRUM.toString(),
            blockNumber: 1000,
            transactionHash: "0xdef",
            transactionIndex: 0,
            logIndex: 1,
            burnToken: "0xtoken",
            amount: "1000000",
            depositor: "0xdepositor",
            mintRecipient: "0xrecipient",
            destinationDomain: 6,
            destinationTokenMessenger: "0xmessenger",
            destinationCaller: "0xcaller",
            maxFee: "1000",
            minFinalityThreshold: 1000,
            hookData: "0xhook",
            finalised: true,
            blockTimestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
          },
        ]);

      // Create a job that was created recently (within retry delay)
      const recentJobTime = new Date(
        Date.now() - (CCTP_FINALIZER_RETRY_DELAY_HOURS - 0.5) * 60 * 60 * 1000,
      );
      await jobRepo.save({
        attestation: "0xattestation",
        message: "0xmessage",
        burnEventId: burnEvent?.id,
        createdAt: recentJobTime,
        updatedAt: recentJobTime,
      });

      publishMessageStub.resetHistory();

      const service = (manager as any).service;
      await (service as any).retryUnfinalizedTransactions();

      // Verify pubsub was NOT called (too recent, no retry yet)
      expect(publishMessageStub.callCount).to.equal(0);
    });
  });
});
