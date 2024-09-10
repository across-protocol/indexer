import assert from "assert";
import Redis from "ioredis";

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
   * Creates a new block range entry in Redis.
   * @param {number} fromBlock - The starting block of the range.
   * @param {number} toBlock - The ending block of the range.
   * @throws Will throw an error if the range already exists.
   * @returns {Promise<RangeQuery>} The created range query.
   */
  async create(fromBlock: number, toBlock: number) {
    const id = this.id(fromBlock, toBlock);
    assert(!(await this.has(id)), "Range already exists");
    return this.set(id);
  }
  /**
   * Adds a range entry to Redis by its identifier.
   * @param {string} id - The identifier of the range.
   * @returns {Promise<RangeQuery>} The range query associated with the id.
   */
  async set(id: string): Promise<RangeQuery> {
    await this.config.redis.sadd(this.config.prefix, id);
    return this.decode(id);
  }
  /**
   * Retrieves a block range from Redis by its identifier.
   * @param {string} id - The identifier of the range.
   * @throws Will throw an error if the range does not exist.
   * @returns {Promise<RangeQuery>} The range query associated with the id.
   */
  async get(id: string) {
    assert(await this.has(id), `Range not found with id ${id}`);
    return this.decode(id);
  }

  /**
   * Checks if a block range exists in Redis by its identifier.
   * @param {string} id - The identifier of the range.
   * @returns {Promise<boolean>} True if the range exists, false otherwise.
   */
  async has(id: string) {
    const count = await this.config.redis.sismember(this.config.prefix, id);
    return count === 1;
  }
  /**
   * Removes a block range from Redis by its identifier.
   * @param {string} id - The identifier of the range to delete.
   * @returns {Promise<void>}
   */
  async del(id: string) {
    await this.config.redis.srem(this.config.prefix, id);
  }
  /**
   * Adds a range entry to Redis by specifying the block range.
   * @param {number} fromBlock - The starting block of the range.
   * @param {number} toBlock - The ending block of the range.
   * @returns {Promise<RangeQuery>} The range query associated with the id.
   */
  async setByRange(fromBlock: number, toBlock: number) {
    return this.set(this.id(fromBlock, toBlock));
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
   * Retrieves all block range entries from Redis.
   * @returns {Promise<[string, RangeQuery][]>} An array of tuples containing range ids and their associated RangeQuery objects.
   */
  async entries(): Promise<[string, RangeQuery][]> {
    const ids = await this.config.redis.smembers(this.config.prefix);
    return ids.map((id) => {
      return [id, this.decode(id)];
    });
  }
}
