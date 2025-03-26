import { expect } from "chai";
import { AsyncSortedKVStore } from "./sorted-kv";

describe("AsyncSortedKVStore", function () {
  let store: AsyncSortedKVStore<string>;

  beforeEach(async function () {
    store = new AsyncSortedKVStore<string>();
  });

  it("should set and get a value", async function () {
    await store.set("key1", "value1");
    const value = await store.get("key1");
    expect(value).to.equal("value1");
  });

  it("should return undefined for a non-existent key", async function () {
    const value = await store.get("nonExistentKey");
    expect(value).to.be.undefined;
  });

  it("should delete a key", async function () {
    await store.set("key1", "value1");
    const deleted = await store.delete("key1");
    expect(deleted).to.be.true;
    const value = await store.get("key1");
    expect(value).to.be.undefined;
  });

  it("should return false when deleting a non-existent key", async function () {
    const deleted = await store.delete("nonExistentKey");
    expect(deleted).to.be.false;
  });

  it("should check if a key exists", async function () {
    await store.set("key1", "value1");
    const exists = await store.has("key1");
    expect(exists).to.be.true;
    const notExists = await store.has("nonExistentKey");
    expect(notExists).to.be.false;
  });

  it("should clear all keys", async function () {
    await store.set("key1", "value1");
    await store.set("key2", "value2");
    await store.clear();
    const value1 = await store.get("key1");
    const value2 = await store.get("key2");
    expect(value1).to.be.undefined;
    expect(value2).to.be.undefined;
  });

  it("should return the next key", async function () {
    await store.set("key1", "value1");
    await store.set("key2", "value2");
    await store.set("key3", "value3");
    const nextKey = await store.nextKey("key1");
    expect(nextKey).to.equal("key2");
  });

  it("should return undefined if there is no next key", async function () {
    await store.set("key1", "value1");
    const nextKey = await store.nextKey("key1");
    expect(nextKey).to.be.undefined;
  });

  it("should order keys correctly when added out of order", async function () {
    await store.set("key3", "value3");
    await store.set("key1", "value1");
    await store.set("key2", "value2");
    const nextKey1 = await store.nextKey("key1");
    const nextKey2 = await store.nextKey("key2");
    expect(nextKey1).to.equal("key2");
    expect(nextKey2).to.equal("key3");
  });

  it("should return the first key", async function () {
    await store.set("key2", "value2");
    await store.set("key1", "value1");
    await store.set("key3", "value3");
    const firstKey = await store.firstKey();
    expect(firstKey).to.equal("key1");
  });
});
