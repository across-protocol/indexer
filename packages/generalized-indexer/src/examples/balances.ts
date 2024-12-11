import { IndexerFactory } from "../factory";
import { AsyncSortedKVStore } from "../sorted-kv";
import { intToKey, sleep } from "../utils";
type BalanceChangeEvent = {
  account: string;
  time: number;
  diff: number;
};

const balanceChangeEvents: BalanceChangeEvent[] = [
  { account: "account1", time: 1, diff: 100 },
  { account: "account2", time: 2, diff: 200 },
  { account: "account1", time: 3, diff: -50 },
  { account: "account3", time: 4, diff: 300 },
  { account: "account2", time: 5, diff: -100 },
  { account: "account1", time: 6, diff: 150 },
  { account: "account3", time: 7, diff: -200 },
  { account: "account2", time: 8, diff: 50 },
  { account: "account1", time: 9, diff: 100 },
  { account: "account3", time: 10, diff: 250 },
];

const tables = [new AsyncSortedKVStore<BalanceChangeEvent>()];
async function sequencerCb(keys: string[]): Promise<number> {
  // since we are dealing with a single event stream, you will always return the first stream
  return 0;
}
async function reducerCb(
  locator: [number, string],
  get: (prop: string) => Promise<string | undefined>,
  index: number | undefined,
): Promise<Record<string, string> | undefined> {
  const [tableIndex, key] = locator;
  const event = await tables[tableIndex]?.get(key);
  // no event found do nothing
  if (event === undefined) return;
  // get previously stored balance from reducer for this account, could be undefined if never set, so assume 0
  const prevBalance = Number((await get(event.account)) ?? "0");
  // get the diff from the event
  const nextBalance = prevBalance + event.diff;
  // store account updates to teh balance
  return {
    [event.account]: nextBalance.toString(),
  };
}

// example runs through the events in order (no re-org), pushing events from the start and getting to final balances
async function run() {
  const indexer = IndexerFactory(tables, sequencerCb, reducerCb);

  for (const event of balanceChangeEvents) {
    await tables[0]?.set(intToKey(event.time), event);
    await sleep();
  }

  const balances = {
    account1: await indexer.reducer.get("account1"),
    account2: await indexer.reducer.get("account2"),
    account3: await indexer.reducer.get("account3"),
  };

  return balances;
}

run().then(console.log).catch(console.error);
