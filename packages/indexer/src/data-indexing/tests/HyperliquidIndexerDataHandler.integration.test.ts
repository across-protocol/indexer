import { expect } from "chai";
import { DataSource } from "typeorm";
import { Logger } from "winston";
import sinon from "sinon";
import { entities } from "@repo/indexer-database";
import { HyperliquidIndexerDataHandler } from "../service/HyperliquidIndexerDataHandler";
import { HyperliquidRepository } from "../../database/HyperliquidRepository";
import {
  HyperliquidRpcClient,
  HyperliquidBlock,
  HyperliquidStreamType,
} from "../adapter/hyperliquid/HyperliquidRpcClient";
import { BlockRange } from "../model";
import { getTestDataSource } from "../../tests/setup";

describe("HyperliquidIndexerDataHandler", () => {
  let dataSource: DataSource;
  let hyperliquidRepository: HyperliquidRepository;
  let logger: Logger;
  let handler: HyperliquidIndexerDataHandler;
  let rpcClientStub: sinon.SinonStub;

  const mockRpcUrl = "https://test-rpc-url.com/hypercore";
  const mockBlockNumber = 859481445;
  const mockBlockTime = "2026-01-12T22:19:03.042753714Z";
  const mockTransactionHash = "0x1234567890abcdef1234567890abcdef12345678";

  beforeEach(async () => {
    dataSource = await getTestDataSource();

    logger = {
      debug: sinon.spy(),
      info: sinon.spy(),
      warn: sinon.spy(),
      error: sinon.spy(),
    } as unknown as Logger;

    hyperliquidRepository = new HyperliquidRepository(dataSource, logger);

    handler = new HyperliquidIndexerDataHandler(
      logger,
      mockRpcUrl,
      hyperliquidRepository,
      0,
    );

    // Stub the HyperliquidRpcClient constructor to return a mock
    rpcClientStub = sinon.stub(
      HyperliquidRpcClient.prototype,
      "getBatchBlocks",
    );
  });

  afterEach(async () => {
    sinon.restore();
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("should process a block range and store Hyperliquid deposit event", async () => {
    const blockRange: BlockRange = {
      from: mockBlockNumber,
      to: mockBlockNumber,
    };

    // Mock the RPC response
    const mockBlock: HyperliquidBlock = {
      blockNumber: mockBlockNumber,
      blockTime: mockBlockTime,
      data: [
        {
          evm_tx_hash: mockTransactionHash,
          user: "0x2222222222222222222222222222222222222222",
          nonce: 12345,
          action: {
            type: "SystemSendAssetAction",
            token: 150,
            wei: 1000000000000000000,
            destination: "0x9a8f92a830a5cb89a3816e3d267cb7791c16b04d",
          },
        },
      ],
    };

    rpcClientStub.resolves([mockBlock]);

    await handler.processBlockRange(blockRange, mockBlockNumber);

    const hyperliquidDepositRepo = dataSource.getRepository(
      entities.HyperliquidDeposit,
    );
    const savedDeposit = await hyperliquidDepositRepo.findOne({
      where: {
        blockNumber: mockBlockNumber,
        transactionHash: mockTransactionHash,
      },
    });

    expect(savedDeposit).to.exist;
    expect(savedDeposit!.transactionHash).to.equal(mockTransactionHash);
    expect(savedDeposit!.blockNumber).to.equal(mockBlockNumber);
    expect(savedDeposit!.user).to.equal(
      "0x2222222222222222222222222222222222222222",
    );
    expect(savedDeposit!.amount.toString()).to.equal("1000000000000000000");
    expect(savedDeposit!.token).to.equal("150");
    expect(savedDeposit!.depositType).to.equal("SystemSendAssetAction");
    expect(savedDeposit!.nonce).to.equal("12345");
    expect(savedDeposit!.finalised).to.be.true;
    expect(savedDeposit!.hypercoreIdentifier).to.equal(
      "0x2222222222222222222222222222222222222222-12345",
    );
  }).timeout(20000);

  it("should handle empty block data", async () => {
    const blockRange: BlockRange = {
      from: mockBlockNumber,
      to: mockBlockNumber,
    };

    // Mock the RPC response with empty data
    const mockBlock: HyperliquidBlock = {
      blockNumber: mockBlockNumber,
      blockTime: mockBlockTime,
      data: [],
    };

    rpcClientStub.resolves([mockBlock]);

    await handler.processBlockRange(blockRange, mockBlockNumber);

    const hyperliquidDepositRepo = dataSource.getRepository(
      entities.HyperliquidDeposit,
    );
    const savedDeposits = await hyperliquidDepositRepo.find({
      where: {
        blockNumber: mockBlockNumber,
      },
    });

    expect(savedDeposits).to.have.length(0);
  }).timeout(20000);

  it("should process multiple blocks in a range", async () => {
    const blockRange: BlockRange = {
      from: mockBlockNumber,
      to: mockBlockNumber + 2,
    };

    // Mock the RPC response with multiple blocks
    const mockBlocks: HyperliquidBlock[] = [
      {
        blockNumber: mockBlockNumber,
        blockTime: mockBlockTime,
        data: [
          {
            evm_tx_hash: `${mockTransactionHash}1`,
            user: "0x2222222222222222222222222222222222222222",
            nonce: 12347,
            action: {
              type: "SystemSendAssetAction",
              token: 150,
              wei: 1000000000000000000,
              destination: "0x9a8f92a830a5cb89a3816e3d267cb7791c16b04d",
            },
          },
        ],
      },
      {
        blockNumber: mockBlockNumber + 1,
        blockTime: mockBlockTime,
        data: [
          {
            evm_tx_hash: `${mockTransactionHash}2`,
            user: "0x2222222222222222222222222222222222222222",
            nonce: 12348,
            action: {
              type: "SystemSendAssetAction",
              token: 268,
              wei: 2000000000000000000,
              destination: "0x9a8f92a830a5cb89a3816e3d267cb7791c16b04d",
            },
          },
        ],
      },
      {
        blockNumber: mockBlockNumber + 2,
        blockTime: mockBlockTime,
        data: [],
      },
    ];

    rpcClientStub.resolves(mockBlocks);

    await handler.processBlockRange(blockRange, mockBlockNumber + 2);

    const hyperliquidDepositRepo = dataSource.getRepository(
      entities.HyperliquidDeposit,
    );
    const savedDeposits = await hyperliquidDepositRepo.find({
      where: [
        { blockNumber: mockBlockNumber },
        { blockNumber: mockBlockNumber + 1 },
      ],
    });

    expect(savedDeposits).to.have.length(2);
    expect(savedDeposits.find((d) => d.blockNumber === mockBlockNumber)).to
      .exist;
    expect(savedDeposits.find((d) => d.blockNumber === mockBlockNumber + 1)).to
      .exist;
  }).timeout(20000);

  it("should filter out non-SystemSendAssetAction events", async () => {
    const blockRange: BlockRange = {
      from: mockBlockNumber,
      to: mockBlockNumber,
    };

    // Mock the RPC response with different event types
    const mockBlock: HyperliquidBlock = {
      blockNumber: mockBlockNumber,
      blockTime: mockBlockTime,
      data: [
        {
          evm_tx_hash: mockTransactionHash,
          user: "0x2222222222222222222222222222222222222222",
          nonce: 12349,
          action: {
            type: "SystemSpotSendAction",
            token: 150,
            wei: 1000000000000000000,
          },
        },
        {
          evm_tx_hash: `${mockTransactionHash}2`,
          user: "0x2222222222222222222222222222222222222222",
          nonce: 12350,
          action: {
            type: "SystemSendAssetAction",
            token: 268,
            wei: 2000000000000000000,
            destination: "0x9a8f92a830a5cb89a3816e3d267cb7791c16b04d",
          },
        },
      ],
    };

    rpcClientStub.resolves([mockBlock]);

    await handler.processBlockRange(blockRange, mockBlockNumber);

    const hyperliquidDepositRepo = dataSource.getRepository(
      entities.HyperliquidDeposit,
    );
    const savedDeposits = await hyperliquidDepositRepo.find({
      where: {
        blockNumber: mockBlockNumber,
      },
    });

    // Should only save the SystemSendAssetAction event
    expect(savedDeposits).to.have.length(1);
    expect(savedDeposits[0]?.depositType).to.equal("SystemSendAssetAction");
    expect(savedDeposits[0]?.nonce).to.equal("12350");
  }).timeout(20000);

  it("should throw error when user is missing", async () => {
    const blockRange: BlockRange = {
      from: mockBlockNumber,
      to: mockBlockNumber,
    };

    // Mock the RPC response without user
    const mockBlock: HyperliquidBlock = {
      blockNumber: mockBlockNumber,
      blockTime: mockBlockTime,
      data: [
        {
          evm_tx_hash: mockTransactionHash,
          nonce: 12351,
          action: {
            type: "SystemSendAssetAction",
            token: 150,
            wei: 1000000000000000000,
            destination: "0x9a8f92a830a5cb89a3816e3d267cb7791c16b04d",
          },
        },
      ],
    };

    rpcClientStub.resolves([mockBlock]);

    await handler.processBlockRange(blockRange, mockBlockNumber);

    // Error should be caught and logged as warning, not thrown
    expect((logger.warn as sinon.SinonSpy).called).to.be.true;
    const warnCalls = (logger.warn as sinon.SinonSpy).getCalls();
    const warnCall = warnCalls.find(
      (call) =>
        call.args[0]?.message === "Error parsing event" &&
        call.args[0]?.error?.includes(
          `user is required for HyperliquidDeposit event in block ${mockBlockNumber}`,
        ),
    );
    expect(warnCall).to.exist;
  }).timeout(20000);

  it("should throw error when nonce is missing", async () => {
    const blockRange: BlockRange = {
      from: mockBlockNumber,
      to: mockBlockNumber,
    };

    // Mock the RPC response without nonce
    const mockBlock: HyperliquidBlock = {
      blockNumber: mockBlockNumber,
      blockTime: mockBlockTime,
      data: [
        {
          evm_tx_hash: mockTransactionHash,
          user: "0x2222222222222222222222222222222222222222",
          action: {
            type: "SystemSendAssetAction",
            token: 150,
            wei: 1000000000000000000,
            destination: "0x9a8f92a830a5cb89a3816e3d267cb7791c16b04d",
          },
        },
      ],
    };

    rpcClientStub.resolves([mockBlock]);

    await handler.processBlockRange(blockRange, mockBlockNumber);

    // Error should be caught and logged as warning, not thrown
    expect((logger.warn as sinon.SinonSpy).called).to.be.true;
    const warnCalls = (logger.warn as sinon.SinonSpy).getCalls();
    const warnCall = warnCalls.find(
      (call) =>
        call.args[0]?.message === "Error parsing event" &&
        call.args[0]?.error?.includes(
          `nonce is required for HyperliquidDeposit event in block ${mockBlockNumber}`,
        ),
    );
    expect(warnCall).to.exist;
  }).timeout(20000);
});
