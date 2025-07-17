import * as across from "@across-protocol/sdk";
import Redis from "ioredis";

export class RedisCache implements across.interfaces.CachingMechanismInterface {
  constructor(private redis: Redis) {}

  async get<ObjectType>(key: string): Promise<ObjectType | null> {
    const result = await this.redis.get(key);
    if (result === null) return result;
    return JSON.parse(result);
  }

  set<ObjectType, _OverrideType>(
    key: string,
    value: ObjectType,
    ttl?: number,
  ): Promise<string | undefined> {
    if (ttl !== undefined && ttl !== Number.POSITIVE_INFINITY) {
      return this.redis.set(key, JSON.stringify(value), "EX", ttl);
    } else if (ttl !== undefined && ttl === Number.POSITIVE_INFINITY) {
      return this.redis.set(key, JSON.stringify(value), "EX", 2147483647);
    }
    return this.redis.set(key, JSON.stringify(value));
  }

  public async pub(channel: string, message: string): Promise<number> {
    return this.redis.publish(channel, message);
  }

  public async sub(
    channel: string,
    listener: (message: string, channel: string) => void,
  ): Promise<number> {
    await this.redis.subscribe(channel);
    this.redis.on("message", (channel, message) => {
      listener(message, channel);
    });
    return 1;
  }
}
