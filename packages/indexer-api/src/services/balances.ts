import assert from "assert";
import Redis from "ioredis";
import * as Indexer from "@repo/indexer";

export class BalancesService {
  hubBalancesCache: Indexer.redis.hubBalancesCache.HubPoolBalanceCache;
  constructor(private redis: Redis) {
    this.hubBalancesCache =
      new Indexer.redis.hubBalancesCache.HubPoolBalanceCache({
        redis,
        prefix: "hubBalanceCache",
      });
  }
  async hubPoolBalance(params?: {
    l1Token?: string;
  }): Promise<Indexer.redis.hubBalancesCache.HubPoolBalances> {
    if (params?.l1Token) {
      const balance = await this.hubBalancesCache.get(params.l1Token);
      assert(balance, `No hubpoolBalance found for ${params.l1Token}`);
      return [balance];
    } else {
      return this.hubBalancesCache.getAllL1Tokens();
    }
  }
}
