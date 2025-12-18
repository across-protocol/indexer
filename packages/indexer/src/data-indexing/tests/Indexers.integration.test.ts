import { expect } from "chai";
import { DataSource } from "typeorm";
import { getTestDataSource } from "../../tests/setup";
import { startArbitrumIndexing } from "../service/indexing";
import { MockWebSocketRPCServer } from "../../tests/testProvider";
import { utils as dbUtils } from "@repo/indexer-database";
import { entities, utils, DataSourceType } from "@repo/indexer-database";
import { MESSAGE_TRANSMITTER_ADDRESS_MAINNET } from "../service/constants";
import sinon from "sinon";
import { Logger } from "winston";
import { CHAIN_IDs } from "@across-protocol/constants";
import { createPublicClient, http, PublicClient } from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";

// Setup real clients for fetching data
// Setup generic client for fetching data
const getTestPublicClient = (chainId: number): PublicClient => {
  let chain;
  let transportUrl;

  if (chainId === CHAIN_IDs.ARBITRUM) {
    chain = arbitrum;
    transportUrl =
      process.env.RPC_PROVIDER_URLS_42161?.split(",")[0] ||
      "https://arb1.arbitrum.io/rpc";
  } else if (chainId === CHAIN_IDs.ARBITRUM_SEPOLIA) {
    chain = arbitrumSepolia;
    transportUrl =
      process.env.RPC_PROVIDER_URLS_421614?.split(",")[0] ||
      "https://sepolia-rollup.arbitrum.io/rpc";
  } else {
    throw new Error(`Unsupported chainId for test client: ${chainId}`);
  }
  return createPublicClient({
    chain,
    transport: http(transportUrl),
  });
};

const fetchAndMockTransaction = async (
  server: MockWebSocketRPCServer,
  client: PublicClient,
  txHash: `0x${string}`,
) => {
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  const block = await client.getBlock({
    blockNumber: receipt.blockNumber,
    includeTransactions: true,
  });

  // Helper to convert Viem formatted objects back to JSON-RPC hex strings
  const toRpcFormat = (val: any, key?: string): any => {
    if (val === null || val === undefined) return val;
    if (typeof val === "bigint") return `0x${val.toString(16)}`;
    if (typeof val === "number") {
      // Log index, block number, etc. should be hex strings
      return `0x${val.toString(16)}`;
    }
    if (typeof val === "boolean") return val ? "0x1" : "0x0";
    if (Array.isArray(val)) return val.map((item) => toRpcFormat(item));
    if (typeof val === "object") {
      const out: any = {};
      for (const k in val) {
        // Special handling for status which is "success" | "reverted" in Viem
        if (k === "status" && val[k] === "success") {
          out[k] = "0x1";
          continue;
        }
        if (k === "status" && val[k] === "reverted") {
          out[k] = "0x0";
          continue;
        }
        // Type is separate. Viem: 'eip1559'. RPC: '0x2'
        if (k === "type") {
          if (val[k] === "eip1559") {
            out[k] = "0x2";
            continue;
          }
          if (val[k] === "eip2930") {
            out[k] = "0x1";
            continue;
          }
          if (val[k] === "legacy") {
            out[k] = "0x0";
            continue;
          }
          // If it's already hex or other string
        }

        out[k] = toRpcFormat(val[k], k);
      }
      return out;
    }
    return val;
  };

  const serializedBlock = toRpcFormat(block);
  // Ensure we define transactions as generic array if needed, but toRpcFormat handles recursing
  server.mockBlockResponse(serializedBlock);

  const serializedReceipt = toRpcFormat(receipt);
  server.mockTransactionReceiptResponse(txHash, serializedReceipt);
  return {
    block,
    receipt,
  };
};

describe("Websocket Subscription", () => {
  let dataSource: DataSource;
  let blockchainRepository: dbUtils.BlockchainEventRepository;
  let server: MockWebSocketRPCServer;
  let rpcUrl: string;
  let logger: Logger;
  let abortController: AbortController;

  /**
   * Sets up the data source and blockchain repository before each test.
   */
  beforeEach(async () => {
    dataSource = await getTestDataSource();
    logger = {
      debug: sinon.spy(),
      info: sinon.spy(),
      warn: sinon.spy(),
      error: console.error,
    } as unknown as Logger;
    blockchainRepository = new dbUtils.BlockchainEventRepository(
      dataSource,
      logger,
    );
    abortController = new AbortController();
    server = new MockWebSocketRPCServer();
    rpcUrl = await server.start();
  });

  /**
   * Cleans up the data source each test.
   */
  afterEach(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
    abortController.abort();
    // Give the indexer loop a moment to exit and close its connections cleanly
    await new Promise((resolve) => setTimeout(resolve, 100));
    server.stop();
    sinon.restore();
  });

  /**
   * Tests ingesting a DepositForBurn event from a specific Arbitrum Sepolia transaction.
   */
  it("should ingest the DepositForBurn event from Arbitrum tx 0xabb...69f7", async () => {
    const txHash =
      "0x063cac1df9697e1f87ee57b7d56a4bdb58447ca9d88c113fd576a44d3c842b1d";

    const arbitrumClient = getTestPublicClient(CHAIN_IDs.ARBITRUM);

    const { block, receipt } = await fetchAndMockTransaction(
      server,
      arbitrumClient,
      txHash,
    );

    // Start the Indexer with the real repository
    startArbitrumIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      testNet: false,
    });

    // Wait for the indexer to subscribe
    await server.waitForSubscription(2);

    // Push the events to the WebSocket
    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify Persistence
    const depositRepo = dataSource.getRepository(entities.DepositForBurn);
    const savedEvent = await depositRepo.findOne({
      where: { transactionHash: txHash },
    });
    expect(savedEvent).to.exist;
    expect(savedEvent).to.deep.include({
      // --- Chain Context ---
      chainId: CHAIN_IDs.ARBITRUM, // Arbitrum One
      blockNumber: Number(block.number),
      transactionHash: txHash,
      transactionIndex: 11,
      logIndex: 12,
      finalised: false, // Should be false initially for WS events
      // --- CCTP Event Data ---
      burnToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
      amount: 1000000, // 1 USDC (6 decimals)
      maxFee: 100,
      depositor: "0xce1ffe01ebb4f8521c12e74363a396ee3d337e1b",
      mintRecipient: "0x1c709fd0db6a6b877ddb19ae3d485b7b4add879f",
      destinationDomain: 19,
      destinationTokenMessenger: "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d",
      destinationCaller: "0x1c709fd0db6a6b877ddb19ae3d485b7b4add879f",

      minFinalityThreshold: 1000,

      // We verify the hookData matches exactly
      hookData:
        "0xca926484ff944441cfca1a0fdfe973e6076fabce3dc5714fcd283d2d867b10c00000000000000000000000000000000000000000000000000000000069411d3b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001f40000000000000000000000009a8f92a830a5cb89a3816e3d267cb7791c16b04d000000000000000000000000b88339cb7199b77e23db6e890353e22632ba630f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000",
    });

    expect(savedEvent!.blockTimestamp.toISOString()).to.exist;
    expect(savedEvent!.deletedAt).to.be.null;
    expect(savedEvent!.finalizerJob).to.be.undefined;
  }).timeout(20000);

  it("should ingest the MessageSent event from Arbitrum tx 0x063...2b1d", async () => {
    const txHash =
      "0x063cac1df9697e1f87ee57b7d56a4bdb58447ca9d88c113fd576a44d3c842b1d";

    const arbitrumClient = getTestPublicClient(CHAIN_IDs.ARBITRUM);
    const { block, receipt } = await fetchAndMockTransaction(
      server,
      arbitrumClient,
      txHash,
    );

    startArbitrumIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      testNet: false,
    });

    await server.waitForSubscription(2);
    // Push the events to the WebSocket
    receipt.logs.forEach((log) => server.pushEvent(log));

    // Wait for insertion
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify Persistence
    const messageSentRepo = dataSource.getRepository(entities.MessageSent);
    const savedEvent = await messageSentRepo.findOne({
      where: { transactionHash: txHash },
    });
    expect(savedEvent).to.exist;
    expect(savedEvent).to.deep.include({
      chainId: CHAIN_IDs.ARBITRUM,
      blockNumber: Number(block.number),
      transactionHash: txHash,
      transactionIndex: 11,
      logIndex: 11,
      finalised: false,
      version: 1,
      sourceDomain: 3,
      destinationDomain: 19,
      nonce:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      sender: "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d",
      recipient: "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d",
      destinationCaller: "0x1c709fd0db6a6b877ddb19ae3d485b7b4add879f",
      minFinalityThreshold: 1000,
      finalityThresholdExecuted: 0,
      messageBody:
        "0x00000001000000000000000000000000af88d065e77c8cc2239327c5edb3a432268e58310000000000000000000000001c709fd0db6a6b877ddb19ae3d485b7b4add879f00000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000ce1ffe01ebb4f8521c12e74363a396ee3d337e1b000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ca926484ff944441cfca1a0fdfe973e6076fabce3dc5714fcd283d2d867b10c00000000000000000000000000000000000000000000000000000000069411d3b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001f40000000000000000000000009a8f92a830a5cb89a3816e3d267cb7791c16b04d000000000000000000000000b88339cb7199b77e23db6e890353e22632ba630f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000",
      message:
        "0x000000010000000300000013000000000000000000000000000000000000000000000000000000000000000000000000000000000000000028b5a0e9c621a5badaa536219b3a228c8168cf5d00000000000000000000000028b5a0e9c621a5badaa536219b3a228c8168cf5d0000000000000000000000001c709fd0db6a6b877ddb19ae3d485b7b4add879f000003e80000000000000001000000000000000000000000af88d065e77c8cc2239327c5edb3a432268e58310000000000000000000000001c709fd0db6a6b877ddb19ae3d485b7b4add879f00000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000ce1ffe01ebb4f8521c12e74363a396ee3d337e1b000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ca926484ff944441cfca1a0fdfe973e6076fabce3dc5714fcd283d2d867b10c00000000000000000000000000000000000000000000000000000000069411d3b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001f40000000000000000000000009a8f92a830a5cb89a3816e3d267cb7791c16b04d000000000000000000000000b88339cb7199b77e23db6e890353e22632ba630f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000",
    });

    expect(savedEvent!.blockTimestamp.toISOString()).to.exist;
  }).timeout(20000);
  it("should ingest the MessageReceived event from Arbitrum tx 0xe016...0580", async () => {
    // Real Transaction Data taken from:
    // https://arbiscan.io/tx/0xe0167a1bc37a020e2035c67abf92f434eb5ff3d344de99d33d8e303650280580#eventlog#58
    const txHash =
      "0xe0167a1bc37a020e2035c67abf92f434eb5ff3d344de99d33d8e303650280580";
    const blockNumber = 410837599;
    const blockHash =
      "0x49a795cdd62e55d51dfada9c7bb7035fd31ea733a4cc1f4a69d7e56e1a6721fe";
    const blockTimestamp = "0x6564b1f3"; // Arbitrary valid timestamp since real one wasn't provided, using same as DepositForBurn test

    // Prime the Mock Server
    server.mockBlockResponse({
      number: "0x" + blockNumber.toString(16),
      hash: blockHash,
      timestamp: blockTimestamp,
      transactions: [],
    });

    server.mockTransactionResponse(txHash, {
      hash: txHash,
      blockNumber: blockNumber,
      blockHash: blockHash,
      blockTimestamp: blockTimestamp,
      from: "0x0000000000000000000000000000000000000000",
      to: "0x0000000000000000000000000000000000000000",
      gasPrice: "0x0",
      gasLimit: "0x0",
      gasUsed: "0x0",
      cumulativeGasUsed: "0x0",
      effectiveGasPrice: "0x0",
      logs: [],
    });

    server.mockTransactionReceiptResponse(txHash, {
      blockNumber: blockNumber,
      blockHash: blockHash,
      transactionHash: txHash,
      transactionIndex: 1,
      cumulativeGasUsed: "0x0",
      effectiveGasPrice: "0x0",
      logs: [],
    });

    // Start the Indexer
    startArbitrumIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      testNet: false, // Arbitrum One
    });
    await server.waitForSubscription();

    const messageBody =
      "0x00000001000000000000000000000000B88339CB7199B77E23DB6E890353E22632BA630F000000000000000000000000928E8B34E4585F259CD645C5B7E45CEC5ADDB845000000000000000000000000000000000000000000000000000000000FF89D1600000000000000000000000015B2810232EC96FF083CA6D8B785CB930D241D8300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

    // Push the REAL Event Payload
    server.pushEvent({
      address: MESSAGE_TRANSMITTER_ADDRESS_MAINNET,
      blockNumber: "0x" + blockNumber.toString(16),
      transactionHash: txHash,
      logIndex: "0x3A", // 58
      blockHash,
      transactionIndex: "0x1",
      topics: [
        // Topic 0: Event Signature
        "0xff48c13eda96b1cceacc6b9edeedc9e9db9d6226afbc30146b720c19d3addb1c", // check signature for MessageReceived
        // Topic 1: caller (0x99f5A2E5d81F22DDB130f4A194584532A3dc3C2E)
        "0x00000000000000000000000099f5A2E5d81F22DDB130f4A194584532A3dc3C2E",
        // Topic 2: nonce (4FFEC20F05E67D8D5E5EC283B7C080514C31B666E9178737D400B522810342E1)
        "0x4FFEC20F05E67D8D5E5EC283B7C080514C31B666E9178737D400B522810342E1",
        // Topic 3: finalityThresholdExecuted (2000 -> 0x7d0)
        "0x00000000000000000000000000000000000000000000000000000000000007d0",
      ],
      data: "0x000000000000000000000000000000000000000000000000000000000000001300000000000000000000000028b5a0e9c621a5badaa536219b3a228c8168cf5d000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000e500000001000000000000000000000000b88339cb7199b77e23db6e890353e22632ba630f000000000000000000000000928e8b34e4585f259cd645c5b7e45cec5addb845000000000000000000000000000000000000000000000000000000000ff89d1600000000000000000000000015b2810232ec96ff083ca6d8b785cb930d241d8300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    });

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 500));

    // Verify Persistence
    const messageReceivedRepo = dataSource.getRepository(
      entities.MessageReceived,
    );
    const savedEvent = await messageReceivedRepo.findOne({
      where: { transactionHash: txHash },
    });

    // Basic Existence Check
    expect(savedEvent).to.exist;

    // Detailed Field Verification
    expect(savedEvent).to.deep.include({
      chainId: CHAIN_IDs.ARBITRUM,
      blockNumber,
      transactionHash: txHash,
      transactionIndex: 1,
      logIndex: 58,
      finalised: false,

      // Specific Event Data
      caller: "0x99f5a2e5d81f22ddb130f4a194584532a3dc3c2e",
      nonce:
        "0x4ffec20f05e67d8d5e5ec283b7c080514c31b666e9178737d400b522810342e1", // Lowercase for db consistency
      sourceDomain: 19,
      sender: "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d", // Transformed from bytes32 to address
      finalityThresholdExecuted: 2000,
      messageBody: messageBody.toLowerCase(),
      dataSource: DataSourceType.WEB_SOCKET,
    });
  }).timeout(20000);
});
