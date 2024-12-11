import _ from "lodash";

import Events from "events";

export interface IKeyManager extends Events {
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  firstKey(): Promise<string | undefined>;
  lastKey(): Promise<string | undefined>;
  prevKey(someKey: string): Promise<string | undefined>;
  nextKey(someKey: string): Promise<string | undefined>;
  keyAtIndex(index?: number): Promise<string | undefined>;
  closestKeyPrev(someKey: string): Promise<string | undefined>;
  keys(): Promise<string[]>;
  readonly size: number;
}

export interface IAsyncSortedKVStore<T> extends IKeyManager {
  set(key: string, value: T): Promise<void>;
  get(key: string): Promise<T | undefined>;
  delete(key: string): Promise<boolean>;
  entries(): Promise<[string, T][]>;
}

export class AsyncSortedKVStore<T>
  extends Events
  implements IAsyncSortedKVStore<T>
{
  private map: Map<string, T>;
  private orderedKeys: string[];
  private comparator: (a: string, b: string) => number;

  constructor() {
    super();
    this.map = new Map();
    this.orderedKeys = [];
  }

  async set(key: string, value: T): Promise<void> {
    const prev = await this.get(key);
    if (_.isEqual(prev, value)) {
      return;
    }

    this.map.set(key, value);

    if (!prev) {
      const index = _.sortedIndex(this.orderedKeys, key);
      this.orderedKeys.splice(index, 0, key);
    }

    this.emit("change", key);
  }

  async get(key: string): Promise<T | undefined> {
    return this.map.get(key);
  }

  async delete(key: string): Promise<boolean> {
    if (await this.has(key)) {
      this.map.delete(key);
      const index = this.orderedKeys.indexOf(key);
      if (index === -1) return false;
      this.orderedKeys.splice(index, 1);
      this.emit("change", key);
      return true;
    }
    return false;
  }

  async has(key: string): Promise<boolean> {
    return this.map.has(key);
  }

  async clear(): Promise<void> {
    this.map.clear();
    this.orderedKeys = [];
    this.emit("change");
  }

  async prevKey(someKey: string): Promise<string | undefined> {
    const index = _.sortedIndex(this.orderedKeys, someKey) - 1;
    if (index >= 0) {
      return this.orderedKeys[index];
    }
    return undefined;
  }
  async nextKey(someKey: string): Promise<string | undefined> {
    const index = _.sortedIndex(this.orderedKeys, someKey) + 1;
    if (index < this.orderedKeys.length) {
      return this.orderedKeys[index];
    }
    return undefined;
  }

  async keyAtIndex(index: number = 0): Promise<string | undefined> {
    if (index >= 0 && index < this.orderedKeys.length) {
      return this.orderedKeys[index];
    }
    return undefined;
  }
  async closestKeyPrev(someKey: string): Promise<string | undefined> {
    if (await this.has(someKey)) return someKey;
    return this.prevKey(someKey);
  }
  async closestKeyNext(someKey: string): Promise<string | undefined> {
    if (await this.has(someKey)) return someKey;
    return this.nextKey(someKey);
  }
  async firstKey(): Promise<string | undefined> {
    return this.orderedKeys.length > 0 ? this.orderedKeys[0] : undefined;
  }
  async lastKey(): Promise<string | undefined> {
    return this.orderedKeys.length > 0
      ? this.orderedKeys[this.orderedKeys.length - 1]
      : undefined;
  }

  get size(): number {
    return this.map.size;
  }
  async keys(): Promise<string[]> {
    return this.orderedKeys;
  }

  async entries(): Promise<[string, T][]> {
    return this.orderedKeys.map((key) => [key, this.map.get(key)!]);
  }
}
