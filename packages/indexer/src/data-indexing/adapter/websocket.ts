import {
  createPublicClient,
  webSocket,
  type PublicClient,
  type Transport,
  type Chain,
} from "viem";
import * as chains from "viem/chains";
import { Logger } from "winston";

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
): PublicClient<Transport, Chain> => {
  // Use the helper to get the official chain object
  const chain = getChain(chainId, logger);

  // In Viem, the client is created with a transport configuration.
  const client = createPublicClient({
    chain,
    // We use the webSocket transport for persistent connections
    transport: webSocket(rpcUrl),
  });

  return client;
};

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
