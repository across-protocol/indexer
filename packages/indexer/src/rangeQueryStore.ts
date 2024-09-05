import assert from "assert";
import Redis from "ioredis";

export type Config = {
  redis: Redis;
  prefix: string;
};
export type RangeQuery = {
  id: string;
  fromBlock: number;
  toBlock: number;
};
export type Range = [number, number];
export type Ranges = Range[];

// Uses redis set to store any range which is just a from and to block
export class RangeQueryStore {
  constructor(private config: Config) {}
  private id(fromBlock: number, toBlock: number) {
    return [fromBlock, toBlock].join("~");
  }
  async create(fromBlock: number, toBlock: number) {
    const id = this.id(fromBlock, toBlock);
    assert(!(await this.has(id)), "Range already exists");
    return this.set(id);
  }
  async set(id: string): Promise<RangeQuery> {
    await this.config.redis.sadd(this.config.prefix, id);
    return this.decode(id);
  }
  async get(id: string) {
    assert(await this.has(id), `Range not found with id ${id}`);
    return this.decode(id);
  }
  async has(id: string) {
    const count = await this.config.redis.sismember(this.config.prefix, id);
    return count === 1;
  }
  async del(id: string) {
    await this.config.redis.srem(this.config.prefix, id);
  }
  async setByRange(fromBlock: number, toBlock: number) {
    return this.set(this.id(fromBlock, toBlock));
  }
  private decode(id: string): RangeQuery {
    const [fromBlock, toBlock] = id.split("~").slice(-2);

    assert(fromBlock !== undefined, "id does not contain fromBlock");
    assert(toBlock !== undefined, "id does not contain toBlock");

    return {
      id,
      fromBlock: Number(fromBlock),
      toBlock: Number(toBlock),
    };
  }
  async entries(): Promise<[string, RangeQuery][]> {
    const ids = await this.config.redis.smembers(this.config.prefix);
    return ids.map((id) => {
      return [id, this.decode(id)];
    });
  }
}
