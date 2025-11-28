import * as across from "@across-protocol/sdk";
import Redis from "ioredis";
import { Logger } from "winston";
import { RetryProvidersFactory } from "../web3/RetryProvidersFactory";
import { RedisCache } from "../redis/redisCache";
import { WebSocketServer, WebSocket } from "ws";

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
  return retryProvidersFactory.getCustomEvmProvider({
    chainId,
    enableCaching: false,
  }) as across.providers.RetryProvider;
}

export class MockWebSocketRPCServer {
  public wss: WebSocketServer;
  private activeSocket: WebSocket | null = null;
  private nextBlockResponse: any = null;

  // Track the subscription handshake state
  private subscriptionPromise: Promise<void>;
  private subscriptionResolver: (() => void) | null = null;

  // Map to store active subscriptions and their filters
  // Key: Subscription ID, Value: Filter options (address, topics)
  private subscriptions: Map<
    string,
    { address?: string | string[]; topics?: any[] }
  > = new Map();
  private subscriptionCounter = 0;

  constructor() {
    // Create the server instance, but it doesn't listen until .listen() is called inside start()
    // Setting port: 0 allows the OS to pick a random free port.
    this.wss = new WebSocketServer({ port: 0 });

    // Initialize the promise that waits for 'eth_subscribe'
    this.subscriptionPromise = new Promise((resolve) => {
      this.subscriptionResolver = resolve;
    });
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
      });
    });
  }

  stop() {
    this.wss.close();
  }

  /**
   * Waits until the client (Viem) has actually requested a subscription.
   * This prevents race conditions where you push an event before Viem is ready.
   */
  async waitForSubscription() {
    return this.subscriptionPromise;
  }

  mockBlockResponse(block: any) {
    this.nextBlockResponse = block;
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
        this.activeSocket.send(JSON.stringify(payload));
      }
    }
  }

  /**
   * Checks if a log matches the subscription filter (primarily address check).
   */
  private isLogMatchingFilter(
    log: any,
    filter: { address?: string | string[]; topics?: any[] },
  ): boolean {
    // Check Address (if filter has one)
    if (filter.address) {
      const logAddress = log.address.toLowerCase();

      if (Array.isArray(filter.address)) {
        // Viem might send an array of addresses
        const match = filter.address.some(
          (a) => a.toLowerCase() === logAddress,
        );
        if (!match) return false;
      } else {
        // Single address string
        if (filter.address.toLowerCase() !== logAddress) return false;
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

      // Unblock the test! We know Viem is listening now.
      if (this.subscriptionResolver) {
        this.subscriptionResolver();
        // We set this to null so it doesn't fire again,
        // satisfying the "wait for connection" pattern.
        this.subscriptionResolver = null;
      }
    } else if (req.method === "eth_getBlockByNumber") {
      respond(this.nextBlockResponse);
    } else if (req.method === "eth_chainId") {
      respond("0xa4b1"); // Arbitrum One Chain ID
    } else {
      respond(null);
    }
  }
}
