import { expect } from "chai";
import { DataSource } from "typeorm";
import { getTestDataSource } from "../../tests/setup";
import { startChainIndexing } from "../service/indexing";
import { MockWebSocketRPCServer } from "../../tests/testProvider";
import { utils as dbUtils } from "@repo/indexer-database";
import { entities, utils, DataSourceType } from "@repo/indexer-database";
import { MESSAGE_TRANSMITTER_ADDRESS_MAINNET } from "../service/constants";
import sinon from "sinon";
import { Logger } from "winston";
import { CHAIN_IDs } from "@across-protocol/constants";
import { createPublicClient, http, PublicClient } from "viem";
import { arbitrum, arbitrumSepolia, mainnet } from "viem/chains";
import { CCTP_PROTOCOL } from "../service/config";

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
  } else if (chainId === CHAIN_IDs.MAINNET) {
    chain = mainnet;
    transportUrl =
      process.env.RPC_PROVIDER_URLS_1?.split(",")[0] ||
      "https://eth.llamarpc.com";
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
    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.ARBITRUM,
      protocols: [CCTP_PROTOCOL],
    });

    // Wait for the indexer to subscribe
    await server.waitForSubscription();

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
      burnToken: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // USDC
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

    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.ARBITRUM,
      protocols: [CCTP_PROTOCOL],
    });

    await server.waitForSubscription();
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
  it("should ingest the MessageReceived event from Arbitrum tx 0x3846...f049", async () => {
    // Real Transaction Data taken from:
    // https://arbiscan.io/tx/0x384656c6c3243982e130b3f7024f8677a5791ea8cab9e11cf7013abb7b03f049#eventlog#36
    const txHash =
      "0x384656c6c3243982e130b3f7024f8677a5791ea8cab9e11cf7013abb7b03f049";

    const arbitrumClient = getTestPublicClient(CHAIN_IDs.ARBITRUM);
    const { block, receipt } = await fetchAndMockTransaction(
      server,
      arbitrumClient,
      txHash,
    );

    // Start the Indexer
    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.ARBITRUM,
      protocols: [CCTP_PROTOCOL],
    });

    await server.waitForSubscription();

    receipt.logs.forEach((log) => server.pushEvent(log));

    const messageBody =
      "00000001C6FA7AF3BEDBAD3A3D65F36AABC97431B1BBE4C2D2F6E0E47CA60203452F5D61000000000000000000000000AEECE9A1F996226C026BB05E7561830872385A59000000000000000000000000000000000000000000000000000000037E11D600455B0EAACAC3285754B398CE32FA37EF6846ACBE1D7A09E0A8EF006FF7110412000000000000000000000000000000000000000000000000000000000016E361000000000000000000000000000000000000000000000000000000000016E36000000000000000000000000000000000000000000000000000000000016DBBAF";

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
      blockNumber: Number(block.number),
      transactionHash: txHash,
      transactionIndex: 7,
      logIndex: 36,
      finalised: false,

      // Specific Event Data
      caller: "0x72adb07a487f38321b6665c02d289c413610b081",
      nonce:
        "0xbf423e1a36b969577de2b0b84e5d80f9386e452f6e1325497fad900b3905fdbe", // Lowercase for db consistency
      sourceDomain: 5,
      // The origin is Solana
      sender: "cctpv2vpzjs2u2bbsuoscuikbyjnpfmbfsvvujdgumqe", // Transformed from bytes32 to address for domain 5
      finalityThresholdExecuted: 1000,
      messageBody: "0x" + messageBody.toLowerCase(),
    });
  }).timeout(20000);

  it("should ingest the DepositForBurn event from Ethereum tx 0x1945...ee93", async () => {
    const txHash =
      "0x1945f68534f3e599b1229c6317672bdbab930061bbb4dc00f96c30da5d4aee93";

    const client = getTestPublicClient(CHAIN_IDs.MAINNET);
    const { block, receipt } = await fetchAndMockTransaction(
      server,
      client,
      txHash,
    );

    // Start the Indexer
    startChainIndexing({
      repo: blockchainRepository,
      rpcUrl,
      logger,
      sigterm: abortController.signal,
      chainId: CHAIN_IDs.MAINNET,
      protocols: [CCTP_PROTOCOL],
    });

    await server.waitForSubscription();

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
      chainId: CHAIN_IDs.MAINNET,
      blockNumber: Number(block.number),
      transactionHash: txHash,
      // Values provided by user
      burnToken: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      amount: 1000000,
      depositor: "0x9a8f92a830a5cb89a3816e3d267cb7791c16b04d",
      mintRecipient: "0x9a8f92a830a5cb89a3816e3d267cb7791c16b04d",
      destinationDomain: 3,
      destinationTokenMessenger: "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d",
      destinationCaller: "0x72adb07a487f38321b6665c02d289c413610b081",
      maxFee: 100,
      minFinalityThreshold: 1000,
      hookData: "0x",
    });
  }).timeout(20000);
});
