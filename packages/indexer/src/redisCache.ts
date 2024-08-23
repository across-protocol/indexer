import * as across from "@across-protocol/sdk";
import Redis from "ioredis";

export class RedisCache implements across.interfaces.CachingMechanismInterface {
  constructor(private redis: Redis) {}
  async get<ObjectType>(key: string): Promise<ObjectType | null> {
    return this.redis.get(key) as ObjectType | null;
  }
  async set<ObjectType>(
    key: string,
    value: ObjectType,
  ): Promise<string | undefined> {
    await this.redis.set(key, JSON.stringify(value));
    return undefined;
  }
}
