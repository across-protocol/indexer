import * as across from "@across-protocol/sdk";
import Redis from "ioredis";

export class RedisCache implements across.interfaces.CachingMechanismInterface {
  constructor(private redis: Redis) {}
  async get<ObjectType>(key: string): Promise<ObjectType | null> {
    const result = await this.redis.get(key);
    if (result === null) return result;
    return JSON.parse(result);
  }
  async set<ObjectType>(
    key: string,
    value: ObjectType,
  ): Promise<string | undefined> {
    return this.redis.set(key, JSON.stringify(value));
  }
}
