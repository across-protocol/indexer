import {
  createPublicClient,
  webSocket,
  type PublicClient,
  type Transport,
  type Chain,
  WebSocketTransportConfig,
} from "viem";
import * as chains from "viem/chains";
import { Logger } from "winston";
import { safeJsonStringify } from "../../utils";

/**
 * Creates and configures a Viem Public Client with a WebSocket transport.
 *
 * @param chainId The ID of the chain for this client, used for logging context.
 * @param rpcUrl The WebSocket RPC endpoint URL.
 * @param logger An optional logger instance or console.
 * @returns A configured `PublicClient` instance.
 */
export const createWebSocketClient = (
  chainId: number,
  rpcUrl: string,
  logger: Logger,
  transportOptions?: WebSocketTransportConfig,
): PublicClient<Transport, Chain> => {
  // Use the helper to get the official chain object
  const chain = getChain(chainId, logger);

  // In Viem, the client is created with a transport configuration.
  const client = createPublicClient({
    chain,
    // We use the webSocket transport for persistent connections
    transport: webSocket(rpcUrl, transportOptions),
  });

  return client;
};

export async function closeViemClient(client: PublicClient, logger: Logger) {
  const transport = client.transport as any;

  if (transport.type !== "webSocket") return;

  try {
    // Viem v2 transports have a direct close method
    if (typeof transport.close === "function") {
      await transport.close();
      return;
    }

    // Fallback: manual cleanup
    const rpcClient = await transport.getRpcClient();

    if (rpcClient) {
      // Disable reconnection
      if (rpcClient.reconnect !== undefined) {
        rpcClient.reconnect = false;
      }

      // Close the RPC client
      if (typeof rpcClient.close === "function") {
        rpcClient.close();
      }

      // Handle socket cleanup
      if (rpcClient.socket) {
        const socket = rpcClient.socket;

        // Add error handler to suppress ECONNREFUSED during cleanup
        if (typeof socket.on === "function") {
          socket.on("error", () => {}); // Suppress errors
          socket.removeAllListeners();
        } else {
          socket.onerror = () => {};
          socket.onclose = null;
          socket.onmessage = null;
          socket.onopen = null;
        }

        // Close/terminate
        if (typeof socket.terminate === "function") {
          socket.terminate();
        } else {
          socket.close();
        }
      }
    }
  } catch (error) {
    // This is expected if the socket is already closed/closing
    logger.debug({
      message: `WebSocket client cleanup completed with error (expected)}`,
      error: safeJsonStringify(error),
    });
  }
}

/**
 * Looks up a Viem Chain object from the official library by its numeric ID.
 * @param chainId The ID of the chain to find.
 * @param logger An optional logger instance or console.
 * @returns The Chain object if found, otherwise throws an error.
 */
export const getChain = (chainId: number, logger: Logger): Chain => {
  // Convert the map of exports into an array of Chain objects
  const allChains = Object.values(chains);

  // Find the one that matches our ID
  const chain = allChains.find((c) => c.id === chainId);

  if (!chain) {
    logger.error({
      at: "getChain",
      message: `Chain with ID ${chainId} not found in viem/chains`,
      notificationPath: "across-indexer-error",
    });
    throw new Error(`Chain with ID ${chainId} not found in viem/chains`);
  }

  return chain;
};
