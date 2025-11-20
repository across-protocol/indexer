import { utils } from "@across-protocol/sdk";
import Redis from "ioredis";
import * as s from "superstruct";

export type Config = {
  redis: Redis;
  prefix: string;
};

export const HubPoolBalance = s.object({
  l1Token: s.string(),
  currentNetSendAmounts: s.string(),
  pendingNetSendAmounts: s.nullable(s.string()),
  currentLiquidReserves: s.string(),
  pendingLiquidReserves: s.nullable(s.string()),
});
export type HubPoolBalance = s.Infer<typeof HubPoolBalance>;
export type HubPoolBalances = HubPoolBalance[];

/**
 * Class to interact with a Redis-backed cache for storing and retrieving hub balances.
 */
export class HubPoolBalanceCache {
  /**
   * @param config - The configuration object, including the Redis instance and prefix.
   */
  constructor(private config: Config) {}

  /**
   * Stores a HubPoolBalance object in Redis, indexed by l1Token.
   * Also adds the key to separate index for its l1Token for efficient lookups.
   *
   * @param datum A HubPoolBalance record to store.
   * @returns A promise that resolves when the datum is successfully stored.
   */
  async set(datum: HubPoolBalance): Promise<void> {
    const key = this.getKey(datum.l1Token);
    await Promise.all([
      this.config.redis.set(key, JSON.stringify(datum)),
      // Add to indexes for quick retrieval by l1Token separately
      this.config.redis.sadd(this.getL1TokenIndexKey(), key),
    ]);
  }

  /**
   * Stores multiple HubPoolBalance objects in Redis, indexed by l1Token.
   *
   * @param data An array of HubPoolBalance records to store.
   */
  async setAll(data: HubPoolBalance[]): Promise<void> {
    await Promise.all(data.map((datum) => this.set(datum)));
  }

  /**
   * Retrieves a HubPoolBalance from Redis by l1Token.
   *
   * @param l1Token The l1Token to query.
   * @returns The retrieved HubPoolBalance or undefined if not found.
   */
  async get(l1Token: string): Promise<HubPoolBalance | undefined> {
    const key = this.getKey(l1Token);
    const data = await this.config.redis.get(key);
    return data ? s.create(JSON.parse(data), HubPoolBalance) : undefined;
  }

  /**
   * Retrieves all HubPoolBalances from Redis that exist across all recorded l1 tokens.
   *
   * @returns An array of HubPoolBalances.
   */
  async getAllL1Tokens(): Promise<HubPoolBalance[]> {
    const keys = await this.config.redis.smembers(this.getL1TokenIndexKey());
    return this.getDataByKeys(keys);
  }

  /**
   * Deletes a HubPoolBalance from Redis by l1Token.
   * Also removes the corresponding key from the l1Token index.
   *
   * @param l1Token The l1Token to delete.
   * @returns True if the record was deleted, false otherwise.
   */
  async delete(l1Token: string): Promise<boolean> {
    const key = this.getKey(l1Token);

    // Remove from Redis
    const result = await this.config.redis.del(key);

    // Also remove from the indexes
    await this.config.redis.srem(this.getL1TokenIndexKey(), key);

    return result > 0;
  }

  /**
   * Checks if a specific l1Token key exists in Redis.
   *
   * @param l1Token The l1Token to check.
   * @returns True if the record exists, false otherwise.
   */
  async has(l1Token: string): Promise<boolean> {
    const key = this.getKey(l1Token);
    const result = await this.config.redis.exists(key);
    return result > 0;
  }

  /**
   * Clears the entire cache by deleting all keys that match the configured prefix.
   * This method uses the SCAN command to safely iterate through all matching keys.
   *
   * @returns A promise that resolves when the cache is cleared.
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
   * Helper function to retrieve data by a list of Redis keys.
   *
   * @private
   * @param keys The Redis keys to retrieve.
   * @returns An array of HubPoolBalances.
   */
  private async getDataByKeys(keys: string[]): Promise<HubPoolBalance[]> {
    const pipeline = this.config.redis.pipeline();
    keys.forEach((key) => pipeline.get(key));
    const results = (await pipeline.exec()) ?? [];
    return results
      .filter(([err, result]) => !err && result)
      .map(([_, result]) =>
        result
          ? s.create(JSON.parse(result as string), HubPoolBalance)
          : undefined,
      )
      .filter(utils.isDefined);
  }

  /**
   * Helper function to generate the Redis key for a specific l1Token.
   *
   * @param l1Token - The l1Token to use in the key.
   * @returns The Redis key for the HubPoolBalance.
   */
  private getKey(l1Token: string): string {
    return `${this.config.prefix}:${l1Token}`;
  }

  /**
   * Helper function to generate the Redis key for the l1Token index.
   *
   * @private
   * @returns The Redis key for the l1Token set of indices.
   */
  private getL1TokenIndexKey(): string {
    return `${this.config.prefix}:l1TokenIndex`;
  }
}
