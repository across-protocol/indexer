import * as across from "@across-protocol/sdk";
import Redis from "ioredis";
import { Logger } from "winston";
import { WebSocket, WebSocketServer } from "ws";
import { RedisCache } from "../redis/redisCache";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";

/**
 * Creates a test instance of a RetryProvider.
 *
 * This function simplifies the creation of a `RetryProvider` for testing purposes.
 * It sets up a `RetryProvidersFactory` with a dummy Redis cache and a provided logger,
 * then returns a new provider instance for the specified chain ID with caching disabled.
 * This is useful for isolating provider-dependent logic in tests without needing a full
 * Redis instance or complex configuration.
 *
 * @param chainId The chain ID for which to create the provider.
 * @param logger A logger instance for the provider to use.
 * @returns An instance of `across.providers.RetryProvider` configured for testing.
 */
export function createTestRetryProvider(
  chainId: number,
  logger: Logger,
): across.providers.RetryProvider {
  const dummyRedis = {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve("OK"),
    publish: () => Promise.resolve(1),
    subscribe: () => Promise.resolve(),
    on: () => {},
  } as unknown as Redis;
  const redisCache = new RedisCache(dummyRedis);
  const retryProvidersFactory = new RetryProvidersFactory(redisCache, logger);
  // If the chain is SVM, we need to use the SVM provider
  if (across.utils.chainIsSvm(chainId)) {
    retryProvidersFactory.initializeProviders();
    return retryProvidersFactory.getProviderForChainId(
      chainId,
    ) as across.providers.RetryProvider;
  }
  return retryProvidersFactory.getCustomEvmProvider({
    chainId,
    enableCaching: false,
  }) as across.providers.RetryProvider;
}

interface SubscriptionFilter {
  address?: string;
  topics?: any[];
}

export class MockWebSocketRPCServer {
  public wss: WebSocketServer;
  private activeSocket: WebSocket | null = null;
  private nextBlockResponse: any = null;

  // Track the subscription handshake state
  private waiters: Array<{ count: number; resolve: () => void }> = [];

  // Map to store active subscriptions and their filters
  // Key: Subscription ID, Value: Filter options (address, topics)
  private subscriptions: Map<string, SubscriptionFilter> = new Map();
  private subscriptionCounter = 0;

  constructor() {
    // Create the server instance, but it doesn't listen until .listen() is called inside start()
    // Setting port: 0 allows the OS to pick a random free port.
    this.wss = new WebSocketServer({ port: 0 });
  }

  /**
   * Starts the server listening on a random port.
   * Returns the full WebSocket URL (e.g., ws://127.0.0.1:45321)
   */
  start(): Promise<string> {
    return new Promise((resolve) => {
      this.wss.on("listening", () => {
        const addr = this.wss.address() as any;
        // Resolve with the URL the client should connect to
        resolve(`ws://127.0.0.1:${addr.port}`);
      });

      this.wss.on("connection", (ws) => {
        this.activeSocket = ws;
        ws.on("message", (msg) => this.handleMessage(ws, msg));
        // Handle socket errors to prevent them from bubbling up as unhandled events
        ws.on("error", (_) => {
          // excessive noise, ignoring mostly as these are expected during teardown
        });
      });
    });
  }

  stop() {
    this.wss.close();
  }

  /**
   * Waits until the client (Viem) has actually requested a subscription.
   * This prevents race conditions where you push an event before Viem is ready.
   * @param count The number of subscriptions/events to wait for.
   */
  async waitForSubscription(count: number) {
    if (this.subscriptions.size >= count) {
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiters.push({ count, resolve });
    });
  }

  private mockedTransactions = new Map<string, any>();
  private mockedReceipts = new Map<string, any>();

  mockBlockResponse(block: any) {
    this.nextBlockResponse = block;
  }

  mockTransactionResponse(txHash: string, transaction: any) {
    this.mockedTransactions.set(txHash, transaction);
  }

  mockTransactionReceiptResponse(txHash: string, receipt: any) {
    this.mockedReceipts.set(txHash, receipt);
  }

  /**
   * Pushes a log event to the client.
   * ONLY sends the event to subscriptions that match the log's address.
   */
  pushEvent(log: any) {
    if (!this.activeSocket) throw new Error("No client connected");
    // Iterate over all active subscriptions
    for (const [subId, filter] of this.subscriptions.entries()) {
      // Check if this log matches the subscription's filter
      if (this.isLogMatchingFilter(log, filter)) {
        const payload = {
          jsonrpc: "2.0",
          method: "eth_subscription",
          params: {
            subscription: subId,
            result: log,
          },
        };
        const replacer = (_: string, value: any) =>
          typeof value === "bigint" || typeof value === "number"
            ? `0x${value.toString(16)}`
            : value;

        this.activeSocket.send(JSON.stringify(payload, replacer));
      }
    }
  }

  /**
   * Checks if a log matches the subscription filter (primarily address check).
   */
  private isLogMatchingFilter(log: any, filter: SubscriptionFilter): boolean {
    // Check Address (if filter has one)
    if (filter.address) {
      const logAddress = log.address.toLowerCase();
      if (filter.address.toLowerCase() !== logAddress) {
        return false;
      }
    }

    // Check Topics (if filter has one)
    if (filter.topics && filter.topics.length > 0) {
      if (!log.topics || log.topics.length === 0) {
        return false;
      }

      for (let i = 0; i < filter.topics.length; i++) {
        const filterTopic = filter.topics[i];
        const logTopic = log.topics[i];

        // If filter topic is null, it acts as a wildcard -> match anything
        if (filterTopic === null) continue;

        if (Array.isArray(filterTopic)) {
          // OR condition: log topic must match one of the filter topics
          const match = filterTopic.some(
            (t) => t.toLowerCase() === logTopic.toLowerCase(),
          );
          if (!match) return false;
        } else {
          // Exact match
          if (filterTopic.toLowerCase() !== logTopic.toLowerCase())
            return false;
        }
      }
    }

    return true;
  }

  private handleMessage(ws: WebSocket, rawMessage: any) {
    const req = JSON.parse(rawMessage.toString());

    const respond = (result: any) => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }));
    };

    if (req.method === "eth_subscribe") {
      // Generate a unique ID for this specific subscription
      const subId = "0x" + (++this.subscriptionCounter).toString(16);

      // Extract filter params.
      // req.params looks like: ["logs", { address: "0x...", topics: [...] }]
      const params = req.params || [];
      if (params.length > 1 && typeof params[1] === "object") {
        this.subscriptions.set(subId, params[1]);
      } else {
        // Fallback for empty filter (subscribe to everything)
        this.subscriptions.set(subId, {});
      }

      // Respond with the unique ID
      respond(subId);

      // Check waiters
      this.waiters = this.waiters.filter((waiter) => {
        if (this.subscriptions.size >= waiter.count) {
          waiter.resolve();
          return false; // Remove from list
        }
        return true; // Keep in list
      });
    } else if (req.method === "eth_getBlockByNumber") {
      respond(this.nextBlockResponse);
    } else if (req.method === "eth_getTransactionByHash") {
      const txHash = req.params[0];
      const tx = this.mockedTransactions.get(txHash);
      respond(tx || null);
    } else if (req.method === "eth_getTransactionReceipt") {
      const txHash = req.params[0];
      const receipt = this.mockedReceipts.get(txHash);
      respond(receipt || null);
    } else {
      respond(null);
    }
  }
}
