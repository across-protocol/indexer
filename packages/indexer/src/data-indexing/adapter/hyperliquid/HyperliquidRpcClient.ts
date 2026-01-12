import axios, { AxiosInstance } from "axios";
import { Logger } from "winston";
import pRetry from "p-retry";

export type HyperliquidStreamType =
  | "trades"
  | "orders"
  | "book"
  | "twap"
  | "events"
  | "writer_actions";

export interface HyperliquidBlock {
  blockNumber: number;
  data: any[];
}

export interface HyperliquidRpcResponse<T = any> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class HyperliquidRpcClient {
  private axiosInstance: AxiosInstance;
  private requestId: number = 1;

  constructor(
    private rpcUrl: string,
    private logger: Logger,
  ) {
    this.axiosInstance = axios.create({
      baseURL: rpcUrl,
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000, // 30 seconds
    });
  }

  /**
   * Makes a JSON-RPC request to the Hyperliquid QuickNode endpoint
   */
  private async makeRequest<T>(
    method: string,
    params: any[] | Record<string, any>,
  ): Promise<T> {
    const id = this.requestId++;
    // JSON-RPC 2.0 allows params to be an array or an object
    // Hyperliquid API accepts both formats, so pass directly
    const requestBody = {
      jsonrpc: "2.0",
      method,
      params: params,
      id,
    };

    const response = await pRetry(
      async () => {
        try {
          const res = await this.axiosInstance.post<HyperliquidRpcResponse<T>>(
            "",
            requestBody,
          );
          return res.data;
        } catch (error: any) {
          this.logger.warn({
            at: "HyperliquidRpcClient#makeRequest",
            message: "RPC request failed, retrying...",
            method,
            error: error.message,
          });
          throw error;
        }
      },
      {
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 10000,
        onFailedAttempt: (error: any) => {
          this.logger.debug({
            at: "HyperliquidRpcClient#makeRequest",
            message: `Retry attempt ${error.attemptNumber} for ${method}`,
            retriesLeft: error.retriesLeft,
          });
        },
      },
    );

    if (response.error) {
      throw new Error(
        `Hyperliquid RPC error: ${response.error.message} (code: ${response.error.code})`,
      );
    }

    if (response.result === undefined) {
      throw new Error(
        `Hyperliquid RPC returned undefined result for ${method}`,
      );
    }

    return response.result;
  }

  /**
   * Gets the latest block number for a specific stream type
   */
  async getLatestBlockNumber(
    streamType: HyperliquidStreamType = "writer_actions",
  ): Promise<number> {
    const result = await this.makeRequest<number>("hl_getLatestBlockNumber", [
      streamType,
    ]);
    return result;
  }

  /**
   * Gets data for a specific block
   */
  async getBlock(
    streamType: HyperliquidStreamType,
    blockNumber: number,
  ): Promise<HyperliquidBlock> {
    const data = await this.makeRequest<any[]>("hl_getBlock", [
      streamType,
      blockNumber,
    ]);
    return {
      blockNumber,
      data: data || [],
    };
  }

  /**
   * Gets data for a range of blocks
   */
  async getBatchBlocks(
    streamType: HyperliquidStreamType,
    fromBlock: number,
    toBlock: number,
  ): Promise<HyperliquidBlock[]> {
    const response = await this.makeRequest<{
      blocks: Array<{
        block_number: number;
        block_time: string;
        local_time: string;
        events: any[];
      }>;
    }>("hl_getBatchBlocks", {
      stream: streamType,
      from: fromBlock,
      to: toBlock,
    });

    // The API returns { blocks: [...] } where each block has block_number and events
    if (!response || !response.blocks || !Array.isArray(response.blocks)) {
      this.logger.warn({
        at: "HyperliquidRpcClient#getBatchBlocks",
        message: "Unexpected API response structure",
        response,
      });
      return [];
    }

    return response.blocks.map((block) => ({
      blockNumber: block.block_number,
      data: block.events || [],
    }));
  }

  /**
   * Gets the most recent N blocks
   */
  async getLatestBlocks(
    streamType: HyperliquidStreamType,
    count: number,
  ): Promise<HyperliquidBlock[]> {
    const data = await this.makeRequest<any[]>("hl_getLatestBlocks", {
      stream: streamType,
      count,
    });

    // Similar to getBatchBlocks, we need to structure the response
    // This will need adjustment based on actual API response
    return Array.isArray(data)
      ? data.map((blockData) => ({
          blockNumber: 0, // Will need to be determined from response
          data: Array.isArray(blockData) ? blockData : [blockData],
        }))
      : [];
  }
}
