import { createClient, RedisClientType } from "redis";

export interface AsyncStore<V> {
  get(key: string): Promise<V | undefined>;
  set(key: string, value: V): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  values(): AsyncIterableIterator<V>;
  entries(): AsyncIterableIterator<[string, V]>;
  keys(): AsyncIterableIterator<string>;
}

export class MemoryStore<V> implements AsyncStore<V> {
  private map: Map<string, V>;

  constructor(map?: Map<string, V>) {
    this.map = map ?? new Map<string, V>();
  }

  async get(key: string): Promise<V | undefined> {
    return this.map.get(key);
  }

  async set(key: string, value: V): Promise<void> {
    this.map.set(key, value);
  }

  async has(key: string): Promise<boolean> {
    return this.map.has(key);
  }

  async delete(key: string): Promise<boolean> {
    return this.map.delete(key);
  }

  async *values(): AsyncIterableIterator<V> {
    for (const value of this.map.values()) {
      yield value;
    }
  }

  async *entries(): AsyncIterableIterator<[string, V]> {
    for (const entry of this.map.entries()) {
      yield entry;
    }
  }

  async *keys(): AsyncIterableIterator<string> {
    for (const key of this.map.keys()) {
      yield key;
    }
  }
}

export class RedisStore<V> implements AsyncStore<V> {
  private client: RedisClientType;

  constructor(client: RedisClientType) {
    this.client = client;
  }

  async get(key: string): Promise<V | undefined> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : undefined;
  }

  async set(key: string, value: V): Promise<void> {
    await this.client.set(key, JSON.stringify(value));
  }

  async has(key: string): Promise<boolean> {
    const exists = await this.client.exists(key);
    return exists === 1;
  }

  async delete(key: string): Promise<boolean> {
    const result = await this.client.del(key);
    return result === 1;
  }

  async *values(): AsyncIterableIterator<V> {
    const keys = await this.client.keys("*");
    for (const key of keys) {
      const value = await this.get(key);
      if (value !== undefined) {
        yield value;
      }
    }
  }

  async *entries(): AsyncIterableIterator<[string, V]> {
    const keys = await this.client.keys("*");
    for (const key of keys) {
      const value = await this.get(key);
      if (value !== undefined) {
        yield [key, value];
      }
    }
  }

  async *keys(): AsyncIterableIterator<string> {
    const keys = await this.client.keys("*");
    for (const key of keys) {
      yield key;
    }
  }
}
