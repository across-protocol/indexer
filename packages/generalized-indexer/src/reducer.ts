import { Sequencer } from "./sequencer";
import { Cursor } from "./cursor";
import { AsyncSortedKVStore } from "./sorted-kv";
import { intToKey, makeKey, parseKey } from "./utils";

export type ReducerCb = (
  locator: [number, string],
  get: (key: string) => Promise<string | undefined>,
  index: number | undefined,
) => Promise<Record<string, string> | undefined>;

export class Reducer {
  private cursor: Cursor;
  private sortedStore: AsyncSortedKVStore<string>;

  constructor(
    private sequencer: Sequencer,
    private reducer: ReducerCb,
  ) {
    this.cursor = new Cursor(sequencer);
    this.sortedStore = new AsyncSortedKVStore();
  }
  private getPreviousCursorNumber(
    cursor: string | undefined,
  ): number | undefined {
    if (cursor === undefined) return undefined;
    const cursorNumber = parseInt(cursor);
    const prevCursorNumber = cursorNumber > 0 ? cursorNumber - 1 : undefined;
    if (prevCursorNumber === undefined) return undefined;
    return prevCursorNumber;
  }
  public async tick() {
    // cursor represents the next reducer pass we need to process in the sequence
    // at 0 this is the first value in sequence
    const cursor = await this.cursor.get();
    if (cursor === undefined) return;
    // this represents the last value we processed and stored in reducer
    const prevCursor = await this.cursor.getPrev();
    // if cursor is undefined it means we are at the end of the sequence or theres nothing in the sequence
    // we have to wait for next value
    const prevCursorNumber =
      prevCursor === undefined ? undefined : Number(prevCursor);
    // get the next values to process in reducer
    const nextSequence = await this.sequencer.get(cursor);
    if (nextSequence === undefined) return;
    // pass in previous cursor, since that represnets our last processed final state
    const result = await this.reducer(
      nextSequence,
      (key: string) => this.get(key, prevCursorNumber),
      prevCursorNumber,
    );
    await this.cursor.increment();
    if (result === undefined) return;
    for (const [key, value] of Object.entries(result)) {
      await this.set(key, value, cursor);
    }
  }
  // get the last reduced value at a cursor or before it, if not specified defualt to last processed cursor
  public async get(
    key: string,
    cursorOverride?: number,
  ): Promise<undefined | string> {
    const cursor =
      cursorOverride === undefined
        ? await this.cursor.getPrev()
        : intToKey(cursorOverride);
    // we are at the beggining, nothing stored, return undefined
    if (cursor === undefined) return undefined;
    const currentKey = makeKey([key, cursor]);
    const keyOrPrevKey = await this.sortedStore.closestKeyPrev(currentKey);
    // no history for this key exists
    if (keyOrPrevKey === undefined) return undefined;
    const [prevKey] = parseKey(keyOrPrevKey);
    // we matched a key outside of our range, that means no history for this key exists
    if (prevKey !== key) return undefined;
    // return the closest key or the one before it
    const result = await this.sortedStore.get(keyOrPrevKey);
    return result;
  }
  private async set(key: string, value: string, cursor: string): Promise<void> {
    const keyWithCursor = makeKey([key, cursor]);
    return this.sortedStore.set(keyWithCursor, value);
  }
}
