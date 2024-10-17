import assert from "assert";
import Redis from "ioredis";
import * as s from "superstruct";

export type Config = {
  redis: Redis;
  prefix: string;
};

export const BundleLeaf = s.object({
  chainId: s.number(),
  l1Token: s.string(),
  netSendAmount: s.string(),
  runningBalance: s.string(),
});
export type BundleLeaf = s.Infer<typeof BundleLeaf>;
export type BundleLeaves = BundleLeaf[];

/**
 * Class to interact with a Redis-backed cache for storing and retrieving BundleLeaves.
 */
export class BundleLeavesCache {
  /**
   * @param {Config} config - The configuration object, including the Redis instance and prefix.
   */
  constructor(private config: Config) {}

  /**
   * Stores a BundleLeaf object in Redis, indexed by chainId and l1Token.
   * Also adds the key to separate indexes for chainId and l1Token for efficient lookups.
   *
   * @param {BundleLeaf} data - The BundleLeaf data to store.
   * @returns {Promise<void>} - A promise that resolves when the data is successfully stored.
   */
  async set(data: BundleLeaf): Promise<void> {
    const key = this.getKey(data.chainId, data.l1Token);
    await this.config.redis.set(key, JSON.stringify(data));

    // Add to indexes for quick retrieval by chainId and l1Token separately
    await this.config.redis.sadd(this.getChainIdIndexKey(data.chainId), key);
    await this.config.redis.sadd(this.getL1TokenIndexKey(data.l1Token), key);
  }

  /**
   * Retrieves a BundleLeaf from Redis by chainId and l1Token.
   *
   * @param {number} chainId - The chainId to query.
   * @param {string} l1Token - The l1Token to query.
   * @returns {Promise<BundleLeaf | undefined>} - The retrieved BundleLeaf or undefined if not found.
   */
  async get(chainId: number, l1Token: string): Promise<BundleLeaf | undefined> {
    const key = this.getKey(chainId, l1Token);
    const data = await this.config.redis.get(key);
    return data ? s.create(JSON.parse(data), BundleLeaf) : undefined;
  }

  /**
   * Retrieves all BundleLeaves from Redis that match the provided chainId.
   *
   * @param {number} chainId - The chainId to query.
   * @returns {Promise<(BundleLeaf | undefined)[]>} - An array of matching BundleLeaves or undefined if not found.
   */
  async getByChainId(chainId: number): Promise<(BundleLeaf | undefined)[]> {
    const keys = await this.config.redis.smembers(
      this.getChainIdIndexKey(chainId),
    );
    return this.getDataByKeys(keys);
  }

  /**
   * Retrieves all BundleLeaves from Redis that match the provided l1Token.
   *
   * @param {string} l1Token - The l1Token to query.
   * @returns {Promise<(BundleLeaf | undefined)[]>} - An array of matching BundleLeaves or undefined if not found.
   */
  async getByL1Token(l1Token: string): Promise<(BundleLeaf | undefined)[]> {
    const keys = await this.config.redis.smembers(
      this.getL1TokenIndexKey(l1Token),
    );
    return this.getDataByKeys(keys);
  }

  /**
   * Deletes a BundleLeaf from Redis by chainId and l1Token.
   * Also removes the corresponding key from the chainId and l1Token indexes.
   *
   * @param {number} chainId - The chainId to delete.
   * @param {string} l1Token - The l1Token to delete.
   * @returns {Promise<boolean>} - True if the record was deleted, false otherwise.
   */
  async delete(chainId: number, l1Token: string): Promise<boolean> {
    const key = this.getKey(chainId, l1Token);

    // Remove from Redis
    const result = await this.config.redis.del(key);

    // Also remove from the indexes
    await this.config.redis.srem(this.getChainIdIndexKey(chainId), key);
    await this.config.redis.srem(this.getL1TokenIndexKey(l1Token), key);

    return result > 0;
  }

  /**
   * Checks if a specific chainId and l1Token pair exists in Redis.
   *
   * @param {number} chainId - The chainId to check.
   * @param {string} l1Token - The l1Token to check.
   * @returns {Promise<boolean>} - True if the record exists, false otherwise.
   */
  async has(chainId: number, l1Token: string): Promise<boolean> {
    const key = this.getKey(chainId, l1Token);
    const result = await this.config.redis.exists(key);
    return result > 0;
  }

  /**
   * Checks if any records exist for a specific chainId.
   *
   * @param {number} chainId - The chainId to check.
   * @returns {Promise<boolean>} - True if records exist, false otherwise.
   */
  async hasByChainId(chainId: number): Promise<boolean> {
    const keys = await this.config.redis.smembers(
      this.getChainIdIndexKey(chainId),
    );
    return keys.length > 0;
  }

  /**
   * Clears the entire cache by deleting all keys that match the configured prefix.
   * This method uses the SCAN command to safely iterate through all matching keys.
   *
   * @returns {Promise<void>} - A promise that resolves when the cache is cleared.
   */
  async clear(): Promise<void> {
    const pattern = `${this.config.prefix}:*`;
    let cursor = "0";
    do {
      // SCAN the keys that match the pattern in batches
      const [newCursor, keys] = await this.config.redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100,
      );
      cursor = newCursor;

      if (keys.length > 0) {
        // Use pipeline to efficiently delete multiple keys at once
        const pipeline = this.config.redis.pipeline();
        keys.forEach((key) => pipeline.del(key));
        await pipeline.exec();
      }
    } while (cursor !== "0");
  }

  /**
   * Checks if any records exist for a specific l1Token.
   *
   * @param {string} l1Token - The l1Token to check.
   * @returns {Promise<boolean>} - True if records exist, false otherwise.
   */
  async hasByL1Token(l1Token: string): Promise<boolean> {
    const keys = await this.config.redis.smembers(
      this.getL1TokenIndexKey(l1Token),
    );
    return keys.length > 0;
  }

  /**
   * Helper function to retrieve data by a list of Redis keys.
   *
   * @private
   * @param {string[]} keys - The Redis keys to retrieve.
   * @returns {Promise<(BundleLeaf | undefined)[]>} - An array of BundleLeaves or undefined if not found.
   */
  private async getDataByKeys(
    keys: string[],
  ): Promise<(BundleLeaf | undefined)[]> {
    const pipeline = this.config.redis.pipeline();
    keys.forEach((key) => pipeline.get(key));
    const results = (await pipeline.exec()) ?? [];
    return results
      .filter(([err, result]) => !err && result)
      .map(([_, result]) =>
        result ? s.create(JSON.parse(result as string), BundleLeaf) : undefined,
      );
  }

  /**
   * Helper function to generate the Redis key for a specific chainId and l1Token.
   *
   * @private
   * @param {number} chainId - The chainId to use in the key.
   * @param {string} l1Token - The l1Token to use in the key.
   * @returns {string} - The Redis key for the BundleLeaf.
   */
  private getKey(chainId: number, l1Token: string): string {
    return `${this.config.prefix}:${chainId}:${l1Token}`;
  }

  /**
   * Helper function to generate the Redis key for the chainId index.
   *
   * @private
   * @param {number} chainId - The chainId to use in the index key.
   * @returns {string} - The Redis key for the chainId index.
   */
  private getChainIdIndexKey(chainId: number): string {
    return `${this.config.prefix}:chainIdIndex:${chainId}`;
  }

  /**
   * Helper function to generate the Redis key for the l1Token index.
   *
   * @private
   * @param {string} l1Token - The l1Token to use in the index key.
   * @returns {string} - The Redis key for the l1Token index.
   */
  private getL1TokenIndexKey(l1Token: string): string {
    return `${this.config.prefix}:l1TokenIndex:${l1Token}`;
  }
}
