import { expect } from 'chai';
import { AsyncSortedKVStore } from './sorted-kv';
import { Cursor } from './cursor';

describe('Cursor', function() {
    let store: AsyncSortedKVStore<string>;
    let cursor: Cursor;

    beforeEach(async function() {
        store = new AsyncSortedKVStore<string>();
        cursor = new Cursor(store);
    });

    it('should initialize with the first key', async function() {
        await store.set('key1', 'value1');
        await store.set('key2', 'value2');
        const firstKey = await cursor.peek();
        expect(firstKey).to.equal('key1');
    });

    it('should move to the next key', async function() {
        await store.set('key1', 'value1');
        await store.set('key2', 'value2');
        await cursor.next();
        const nextKey = await cursor.next();
        expect(nextKey).to.equal('key2');
    });

    it('should return undefined if there is no next key', async function() {
        await store.set('key1', 'value1');
        await cursor.next();
        const nextKey = await cursor.next();
        expect(nextKey).to.be.undefined;
    });

    it('should emit rewind event when a lower key is set', async function() {
        let rewindEventTriggered = false;
        cursor.on('change', (prev, next) => {
            rewindEventTriggered = true;
            expect(prev).to.equal('key2');
            expect(next).to.equal('key1');
        });

        await store.set('key2', 'value2');
        await cursor.next();
        await store.set('key1', 'value1'); // Setting a lower key

        expect(rewindEventTriggered).to.be.true;
        const peek = await cursor.peek();
        expect(peek).to.equal(undefined)
    });

    it('should not emit rewind event if cursor does not change', async function() {
        let rewindEventTriggered = false;
        cursor.on('change', () => {
            rewindEventTriggered = true;
        });

        await store.set('key1', 'value1');
        await cursor.next();
        await store.set('key1', 'value1'); // Setting the same key again

        expect(rewindEventTriggered).to.be.false;
    });
});
