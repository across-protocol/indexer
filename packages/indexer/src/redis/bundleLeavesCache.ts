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

export class BundleLeavesCache {
  constructor(private config: Config) {}
  // Set data by chainId and l1Token
  async set(data: BundleLeaf): Promise<void> {
    const key = this.getKey(data.chainId, data.l1Token);
    await this.config.redis.set(key, JSON.stringify(data));

    // Add to indexes for quick retrieval by chainId and l1Token separately
    await this.config.redis.sadd(this.getChainIdIndexKey(data.chainId), key);
    await this.config.redis.sadd(this.getL1TokenIndexKey(data.l1Token), key);
  }

  // Get by chainId and l1Token (both)
  async get(chainId: number, l1Token: string): Promise<BundleLeaf | null> {
    const key = this.getKey(chainId, l1Token);
    const data = await this.config.redis.get(key);
    return data ? s.create(JSON.parse(data), BundleLeaf) : null;
  }

  // Get by chainId
  async getByChainId(chainId: number): Promise<(BundleLeaf | undefined)[]> {
    const keys = await this.config.redis.smembers(
      this.getChainIdIndexKey(chainId),
    );
    return this.getDataByKeys(keys);
  }

  // Get by l1Token
  async getByL1Token(l1Token: string): Promise<(BundleLeaf | undefined)[]> {
    const keys = await this.config.redis.smembers(
      this.getL1TokenIndexKey(l1Token),
    );
    return this.getDataByKeys(keys);
  }

  // Delete a record by chainId and l1Token
  async delete(chainId: number, l1Token: string): Promise<boolean> {
    const key = this.getKey(chainId, l1Token);

    // Remove from Redis
    const result = await this.config.redis.del(key);

    // Also remove from the indexes
    await this.config.redis.srem(this.getChainIdIndexKey(chainId), key);
    await this.config.redis.srem(this.getL1TokenIndexKey(l1Token), key);

    return result > 0;
  }

  // Check if a specific chainId + l1Token pair exists
  async has(chainId: number, l1Token: string): Promise<boolean> {
    const key = this.getKey(chainId, l1Token);
    const result = await this.config.redis.exists(key);
    return result > 0;
  }

  // Check if any entry exists for a specific chainId
  async hasByChainId(chainId: number): Promise<boolean> {
    const keys = await this.config.redis.smembers(
      this.getChainIdIndexKey(chainId),
    );
    return keys.length > 0;
  }

  // Check if any entry exists for a specific l1Token
  async hasByL1Token(l1Token: string): Promise<boolean> {
    const keys = await this.config.redis.smembers(
      this.getL1TokenIndexKey(l1Token),
    );
    return keys.length > 0;
  }

  // Helper to retrieve data by list of Redis keys
  private async getDataByKeys(
    keys: string[],
  ): Promise<(BundleLeaf | undefined)[]> {
    const pipeline = this.config.redis.pipeline();
    keys.forEach((key) => pipeline.get(key));
    const results = (await pipeline.exec()) ?? [];
    return (
      results
        .filter(([err, result]) => !err && result)
        // this is kind of messed up with typescript, since the type could be things other than a string or null
        // but we are only using gets, so it should theoretically be string or null
        .map(([_, result]) =>
          result
            ? s.create(JSON.parse(result as string), BundleLeaf)
            : undefined,
        )
    );
  }

  // Helper to generate Redis key for chainId + l1Token
  private getKey(chainId: number, l1Token: string): string {
    return `${this.config.prefix}:${chainId}:${l1Token}`;
  }

  // Helper to generate Redis key for chainId index
  private getChainIdIndexKey(chainId: number): string {
    return `${this.config.prefix}:chainIdIndex:${chainId}`;
  }

  // Helper to generate Redis key for l1Token index
  private getL1TokenIndexKey(l1Token: string): string {
    return `${this.config.prefix}:l1TokenIndex:${l1Token}`;
  }
}
