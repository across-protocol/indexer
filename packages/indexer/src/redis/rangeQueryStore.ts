import Redis from "ioredis";
import { assert } from "@repo/error-handling";

/**
 * @typedef {Object} Config
 * @property {Redis} redis - An instance of the ioredis client.
 * @property {string} prefix - The key prefix used in Redis.
 */
export type Config = {
  redis: Redis;
  prefix: string;
};
/**
 * @typedef {Object} RangeQuery
 * @property {string} id - The identifier for the range query, constructed from the block range.
 * @property {number} fromBlock - The starting block of the range.
 * @property {number} toBlock - The ending block of the range.
 */
export type RangeQuery = {
  id: string;
  fromBlock: number;
  toBlock: number;
};
export type Range = [number, number];
export type Ranges = Range[];

/**
 * Class to manage a set of ranges in Redis, representing ranges of block numbers.
 */
export class RangeQueryStore {
  constructor(private config: Config) {}
  /**
   * Generates a unique identifier for a block range.
   * @private
   * @param {number} fromBlock - The starting block of the range.
   * @param {number} toBlock - The ending block of the range.
   * @returns {string} The unique identifier for the range.
   */
  private id(fromBlock: number, toBlock: number) {
    return [fromBlock, toBlock].join("~");
  }
  /**
   * Decodes a range identifier into a RangeQuery object.
   * @private
   * @param {string} id - The identifier of the range.
   * @returns {RangeQuery} The decoded RangeQuery object.
   * @throws Will throw an error if the id does not contain a valid fromBlock or toBlock.
   */
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
  /**
   * Adds a range entry to Redis by its identifier.
   * @param {string} id - The identifier of the range.
   * @returns {Promise<RangeQuery>} The range query associated with the id.
   */
  public async set(id: string): Promise<RangeQuery> {
    await this.config.redis.sadd(this.config.prefix, id);
    return this.decode(id);
  }
  /**
   * Adds a range entry to Redis by specifying the block range.
   * @param {number} fromBlock - The starting block of the range.
   * @param {number} toBlock - The ending block of the range.
   * @returns {Promise<RangeQuery>} The range query associated with the id.
   */
  public async setByRange(fromBlock: number, toBlock: number) {
    return this.set(this.id(fromBlock, toBlock));
  }
  /**
   * Retrieves all block range entries from Redis.
   * @returns {Promise<[string, RangeQuery][]>} An array of tuples containing range ids and their associated RangeQuery objects.
   */
  public async entries(): Promise<[string, RangeQuery][]> {
    const ids = await this.config.redis.smembers(this.config.prefix);
    return ids.map((id) => {
      return [id, this.decode(id)];
    });
  }
}
