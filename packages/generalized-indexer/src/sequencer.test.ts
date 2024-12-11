import assert from "assert";
import { Sequencer } from "./sequencer";
import { Cursor } from "./cursor";
import { AsyncSortedKVStore } from "./sorted-kv";
describe("Sequencer with Single Table", function () {
  let sequencer: Sequencer;
  let table: AsyncSortedKVStore<string>;
  let cursor: Cursor;

  beforeEach(function () {
    table = new AsyncSortedKVStore<string>();
    cursor = new Cursor(table);
    sequencer = new Sequencer([cursor], async () => {
      return 0; // Always return the first cursor since there's only one
    });
  });

  it("should initialize with an empty sequence", async function () {
    const result = await sequencer.keyAtIndex(0);
    assert(result === undefined);
  });

  it("should process a single valid update", async function () {
    await table.set("key1", "value1");
    await sequencer.tick();
    const val = await sequencer.get((await sequencer.keyAtIndex(0))!);
    assert(val);
    const [tableIndex, key] = val;
    assert(tableIndex === 0);
    assert(key === "key1");
  });

  it("should not process if no new keys are added", async function () {
    await table.set("key1", "value1");
    await sequencer.tick();
    const initialVal = await sequencer.get((await sequencer.keyAtIndex(0))!);
    assert(initialVal);
    await sequencer.tick(); // No new keys added
    const subsequentVal = await sequencer.get((await sequencer.keyAtIndex(1))!);
    assert(subsequentVal === undefined);
  });

  it("should handle multiple sequential updates", async function () {
    await table.set("key1", "value1");
    await table.set("key2", "value2");
    await sequencer.tick();
    await sequencer.tick();
    const firstVal = await sequencer.get((await sequencer.keyAtIndex(0))!);
    const secondVal = await sequencer.get((await sequencer.keyAtIndex(1))!);
    assert(firstVal);
    assert(secondVal);
    const [firstTableIndex, firstKey] = firstVal;
    const [secondTableIndex, secondKey] = secondVal;
    assert(firstTableIndex === 0);
    assert(firstKey === "key1");
    assert(secondTableIndex === 0);
    assert(secondKey === "key2");
  });

  it("should handle out-of-order updates", async function () {
    await table.set("a", "a");
    await sequencer.tick();
    await table.set("c", "c");
    await sequencer.tick();
    await table.set("b", "b");
    await new Promise((resolve) => setTimeout(resolve, 1));
    await sequencer.tick();
    await sequencer.tick();
    const entries = await sequencer.entries();
    assert.equal(entries.length, 3);
    const expectedOrder = ["a", "b", "c"];
    entries.forEach(([_, key], index) => {
      assert.equal(key[1], expectedOrder[index]);
    });
  });

  it("should handle out-of-order updates at beginning", async function () {
    await table.set("x", "x");
    await sequencer.tick();
    await table.set("a", "a");
    await new Promise((res) => setTimeout(res, 1));
    await sequencer.tick();
    await table.set("y", "y");
    await new Promise((res) => setTimeout(res, 1));
    await sequencer.tick();
    await table.set("b", "b");
    await new Promise((res) => setTimeout(res, 1));
    await sequencer.tick();
    // await new Promise(resolve => setTimeout(resolve, 1));
    // await sequencer.tick();
    // await sequencer.tick();
    const entries = await sequencer.entries();
    assert.equal(entries.length, 2);
    const expectedOrder = ["a", "b", "x", "y"];
    entries.forEach(([_, key], index) => {
      assert.equal(key[1], expectedOrder[index]);
    });
  });
});

describe("Sequencer 2", function () {
  let sequencer: Sequencer;
  let table1: AsyncSortedKVStore<string>;
  let table2: AsyncSortedKVStore<string>;
  let cursor1: Cursor;
  let cursor2: Cursor;

  beforeEach(function () {
    table1 = new AsyncSortedKVStore<string>();
    table2 = new AsyncSortedKVStore<string>();
    cursor1 = new Cursor(table1);
    cursor2 = new Cursor(table2);
    sequencer = new Sequencer([cursor1, cursor2], async (keys) => {
      const [a, b] = keys;
      assert(a);
      assert(b);
      return a < b ? 0 : 1;
    });
  });

  it("should initialize with an empty sequence", async function () {
    const result = await sequencer.keyAtIndex(0);
    assert(result === undefined);
  });
  it("process blocked update", async function () {
    await table1.set("a", "a");
    await sequencer.tick();
    const val = await sequencer.get("0");
    assert(val === undefined);
  });
  it("process valid update", async function () {
    await table1.set("a", "a");
    await table2.set("b", "b");
    await sequencer.tick();
    const val = await sequencer.get((await sequencer.keyAtIndex(0))!);
    assert(val);
    const [table, key] = val;
    assert(table === 0);
    assert(key === "a");
  });
  it("process valid update", async function () {
    await table1.set("m", "m");
    await table2.set("n", "n");
    await sequencer.tick();
    await table1.set("o", "o");
    await sequencer.tick();
    await table2.set("p", "p");
    await sequencer.tick();
    await table1.set("a", "a");
    await new Promise((res) => setTimeout(res, 1));
    await sequencer.tick();
    // await table2.set('b','b')
    // await sequencer.tick();
    // await sequencer.tick();

    const cursor = new Cursor(sequencer);
    let vals = [];
    do {
      const key = await cursor.get();
      assert(key);
      vals.push(await sequencer.get(key));
    } while (await cursor.increment());
    assert(vals.length);
  });
  it("should handle rewind when a table gets a value inserted before the newest data", async function () {
    await table1.set("x", "x");
    await table2.set("y", "y");
    await sequencer.tick();
    // Insert a value before the newest data
    await table1.set("a", "a");
    await new Promise((res) => setTimeout(res, 1));
    await sequencer.tick();
    await sequencer.tick();
    await table1.set("c", "c");
    await new Promise((res) => setTimeout(res, 1));
    await table2.set("b", "b");
    await new Promise((res) => setTimeout(res, 1));
    await sequencer.tick();
    await sequencer.tick();
    await sequencer.tick();
    await sequencer.tick();

    const entries = await sequencer.entries();
    const expectedOrder = ["a", "b", "c", "x"];
    entries.forEach(([_, key], index) => {
      assert.equal(key[1], expectedOrder[index]);
    });
  });
});
