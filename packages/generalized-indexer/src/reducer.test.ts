import { Sequencer } from "./sequencer";
import { AsyncSortedKVStore } from "./sorted-kv";
import { Cursor } from "./cursor";
import assert from "assert";
import { Reducer } from "./reducer";
import { intToKey } from "./utils";
import { reduceRight } from "lodash";

type BalanceChange = {
  time: number;
  diff: number;
};
type Balance = number;
describe("balance diff reducer", function () {
  let balanceChangeSequencer: Sequencer;
  let balanceChanges: AsyncSortedKVStore<BalanceChange>;
  let cursor1: Cursor;

  let balanceHistoryReducer: Reducer;
  let balanceHistory: AsyncSortedKVStore<Balance>;

  beforeEach(function () {
    balanceChanges = new AsyncSortedKVStore<BalanceChange>();
    cursor1 = new Cursor(balanceChanges);
    balanceChangeSequencer = new Sequencer([cursor1], async (data) => {
      console.log("balance change sequencer", data);
      return 0;
    });

    balanceHistory = new AsyncSortedKVStore<Balance>();
    balanceHistoryReducer = new Reducer(
      balanceChangeSequencer,
      async (locator, get, index) => {
        const [, key] = locator;
        const balanceChange = await balanceChanges.get(key);
        if (balanceChange === undefined) return;
        const lastBalance = Number((await get("account")) ?? "0");
        return { account: (lastBalance + balanceChange.diff).toString() };
      },
    );
  });
  it("should process an array of balance changes correctly", async function () {
    const balanceChangesArray: BalanceChange[] = [
      { time: 1, diff: 100 },
      { time: 2, diff: -50 },
      { time: 3, diff: 200 },
      { time: 4, diff: -150 },
    ];

    for (const change of balanceChangesArray) {
      await balanceChanges.set(change.time.toString(), change);
      await new Promise((resolve) => setTimeout(resolve, 1));
      await balanceChangeSequencer.tick();
      await new Promise((resolve) => setTimeout(resolve, 1));
      await balanceHistoryReducer.tick();
    }

    const balance = await balanceHistoryReducer.get("account");
    assert.equal(balance, "100");
  });
  it("should process an array of balance changes correctly", async function () {
    const balanceChangesArray: BalanceChange[] = [
      { time: 1, diff: 100 },
      { time: 3, diff: -50 },
      { time: 2, diff: 50 },
    ];

    for (const change of balanceChangesArray) {
      await balanceChanges.set(change.time.toString(), change);
      await new Promise((resolve) => setTimeout(resolve, 1));
      await balanceChangeSequencer.tick();
      await new Promise((resolve) => setTimeout(resolve, 1));
      await balanceHistoryReducer.tick();
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    // reorg happens, so 1 and 2 are applied, but not 3 yet
    const balance = await balanceHistoryReducer.get("account");
    assert.equal(balance, "150");

    // process next value, which shoudl be 3
    await balanceChangeSequencer.tick();
    await balanceHistoryReducer.tick();
    const balance2 = await balanceHistoryReducer.get("account");
    assert.equal(balance2, "100");
  });
});
