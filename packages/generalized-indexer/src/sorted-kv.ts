import _ from 'lodash';

import Events from 'events';

export interface IKeyManager extends Events {
    has(key: string): Promise<boolean>;
    clear(): Promise<void>;
    firstKey():Promise<string | undefined>;
    lastKey():Promise<string | undefined>;
    prevKey(someKey: string): Promise<string | undefined>;
    nextKey(someKey: string): Promise<string | undefined>;
    keyAtIndex(index?: number): Promise<string | undefined>;
    closestKeyPrev(someKey: string): Promise<string | undefined>;
    readonly size: number;
}

export interface IAsyncSortedKVStore<T> extends IKeyManager {
    set(key: string, value: T): Promise<void>;
    get(key: string): Promise<T | undefined>;
    delete(key: string): Promise<boolean>;
}

export class AsyncSortedKVStore<T> extends Events implements IAsyncSortedKVStore<T> {
    private map: Map<string, T>;
    private keys: string[];
    private comparator: (a: string, b: string) => number;

    constructor() {
        super();
        this.map = new Map();
        this.keys = [];
    }

    async set(key: string, value: T): Promise<void> {
        const isNewKey = !this.map.has(key);
        if(!isNewKey){
          const prev = await this.get(key)
          if (_.isEqual(prev, value)) return;
        }else{
          this.map.set(key, value);
          const index = _.sortedIndex(this.keys, key);
          this.keys.splice(index, 0, key);
        }
        this.emit('change', key);
    }

    async get(key: string): Promise<T | undefined> {
        return this.map.get(key);
    }

    async delete(key: string): Promise<boolean> {
        if (await this.has(key)) {
            this.map.delete(key);
            const index = this.keys.indexOf(key);
            if (index === -1) return false
            this.keys.splice(index, 1);
            this.emit('change', key);
            return true;
        }
        return false;
    }

    async has(key: string): Promise<boolean> {
        return this.map.has(key);
    }

    async clear(): Promise<void> {
        this.map.clear();
        this.keys = [];
        this.emit('change');
    }

    async prevKey(someKey: string): Promise<string | undefined> {
        const index = _.sortedIndex(this.keys, someKey) - 1;
        if (index >= 0) {
            return this.keys[index];
        }
        return undefined;
    }
    async nextKey(someKey: string): Promise<string | undefined> {
        const index = _.sortedIndex(this.keys, someKey) + 1;
        if (index < this.keys.length) {
            return this.keys[index];
        }
        return undefined;
    }

    async keyAtIndex(index: number = 0): Promise<string | undefined> {
        if (index >= 0 && index < this.keys.length) {
            return this.keys[index];
        }
        return undefined;
    }
    async closestKeyPrev(someKey: string): Promise<string | undefined> {
        if(await this.has(someKey)) return someKey
        return this.prevKey(someKey)
    }
    async closestKeyNext(someKey: string): Promise<string | undefined> {
        if(await this.has(someKey)) return someKey
        return this.nextKey(someKey)
    }
    async firstKey(): Promise<string | undefined> {
        return this.keys.length > 0 ? this.keys[0] : undefined;
    }
    async lastKey(): Promise<string | undefined> {
        return this.keys.length > 0 ? this.keys[this.keys.length - 1] : undefined;
    }

    get size(): number {
        return this.map.size;
    }
}
