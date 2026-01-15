import axios, { AxiosInstance } from "axios";
import { Logger } from "winston";
import pRetry from "p-retry";

export enum HyperliquidStreamType {
  TRADES = "trades",
  ORDERS = "orders",
  BOOK = "book",
  TWAP = "twap",
  EVENTS = "events",
  WRITER_ACTIONS = "writer_actions",
}

export interface HyperliquidBlock {
  blockNumber: number;
  blockTime?: string;
  data: any[];
}

/**
 * API response structure for a single block from Hyperliquid
 */
interface HyperliquidApiBlockResponse {
  block_number: number;
  block_time: string;
  local_time: string;
  events: any[];
}

/**
 * API response structure for multiple blocks from Hyperliquid
 */
interface HyperliquidBlocksResponse {
  blocks: HyperliquidApiBlockResponse[];
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
    streamType: HyperliquidStreamType = HyperliquidStreamType.WRITER_ACTIONS,
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
    filters?: Record<string, any>,
  ): Promise<HyperliquidBlock> {
    const params: any = [streamType, blockNumber];
    if (filters) {
      params.push(filters);
    }
    const block = await this.makeRequest<HyperliquidApiBlockResponse>(
      "hl_getBlock",
      params,
    );
    return {
      blockNumber: block.block_number,
      blockTime: block.block_time,
      data: block.events || [],
    };
  }

  /**
   * Gets data for a range of blocks
   */
  async getBatchBlocks(
    streamType: HyperliquidStreamType,
    fromBlock: number,
    toBlock: number,
    filters?: Record<string, any>,
  ): Promise<HyperliquidBlock[]> {
    const params: any = {
      stream: streamType,
      from: fromBlock,
      to: toBlock,
    };
    if (filters) {
      params.filters = filters;
    }
    const response = await this.makeRequest<HyperliquidBlocksResponse>(
      "hl_getBatchBlocks",
      params,
    );

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
      blockTime: block.block_time,
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
    const response = await this.makeRequest<HyperliquidBlocksResponse>(
      "hl_getLatestBlocks",
      {
        stream: streamType,
        count,
      },
    );

    if (!response || !response.blocks || !Array.isArray(response.blocks)) {
      this.logger.warn({
        at: "HyperliquidRpcClient#getLatestBlocks",
        message: "Unexpected API response structure",
        response,
      });
      return [];
    }

    return response.blocks.map((block) => ({
      blockNumber: block.block_number,
      blockTime: block.block_time,
      data: block.events || [],
    }));
  }
}
