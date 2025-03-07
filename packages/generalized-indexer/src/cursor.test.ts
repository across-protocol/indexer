import { expect } from "chai";
import { AsyncSortedKVStore } from "./sorted-kv";
import { Cursor } from "./cursor";

describe("Cursor", function () {
  let store: AsyncSortedKVStore<string>;
  let cursor: Cursor;

  beforeEach(async function () {
    store = new AsyncSortedKVStore<string>();
    cursor = new Cursor(store);
  });

  it("should initialize with the first key", async function () {
    await store.set("key1", "value1");
    await store.set("key2", "value2");
    const firstKey = await cursor.get();
    expect(firstKey).to.equal("key1");
  });

  it("should move to the next key", async function () {
    await store.set("key1", "value1");
    await store.set("key2", "value2");
    expect(await cursor.get()).to.equal("key1");
    expect(await cursor.increment()).to.equal("key2");
  });

  it("should return undefined if there is no next key", async function () {
    await store.set("key1", "value1");
    const nextKey = await cursor.get();
    expect(nextKey).to.equal("key1");
    expect(await cursor.increment()).to.equal(undefined);
  });

  it("should emit change event when a lower key is set", async function () {
    let rewindEventTriggered = false;
    cursor.on("change", (key) => {
      rewindEventTriggered = true;
      expect(key).to.equal("key1");
    });

    await store.set("key2", "value2");
    const n1 = await cursor.get();
    expect(n1).to.equal("key2");
    const n2 = await cursor.increment();
    expect(n2).to.equal(undefined);
    await store.set("key1", "value1"); // Setting a lower key
    expect(rewindEventTriggered).to.be.true;
    const peek = await cursor.get();
    expect(peek).to.equal("key1");
  });

  it("should not emit rewind event if cursor does not change", async function () {
    let rewindEventTriggered = false;
    cursor.on("change", () => {
      rewindEventTriggered = true;
    });

    await store.set("key1", "value1");
    await cursor.increment();
    await store.set("key1", "value1"); // Setting the same key again

    expect(rewindEventTriggered).to.be.false;
  });
});
