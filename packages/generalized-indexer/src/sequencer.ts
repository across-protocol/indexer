import { AsyncSortedKVStore } from './sorted-kv';
import assert from 'assert'
import { Cursor } from './cursor';
import { intToKey } from './utils';

export class Sequencer extends AsyncSortedKVStore<[number,string]> {
  private sequenceIndex: number;
  private sequenceByKeyMaps: Array<AsyncSortedKVStore<number>>;
  private sequenceKeyState: AsyncSortedKVStore<Array<string>>;

  constructor(
    private cursors: Array<Cursor>,
    private callback: (keys: Array<string>) => Promise<number>
  ) {
    super();
    this.sequenceIndex = 0;
    this.sequenceByKeyMaps = this.cursors.map(() => new AsyncSortedKVStore<number>());
    this.sequenceKeyState = new AsyncSortedKVStore()

    this.cursors.forEach((cursor, index) => {
      cursor.on('change', (prev) => {
        this.handleRewind(index, prev);
      });
    });
  }

  private getCursor(index: number): Cursor {
    const cursor = this.cursors[index];
    if (!cursor) {
      throw new Error(`Cursor does not exist at index ${index}`);
    }
    return cursor;
  }
  private getSequenceByKeyMap(index: number): AsyncSortedKVStore<number> {
    const map = this.sequenceByKeyMaps[index];
    if (!map) {
      throw new Error(`SequenceByKeyMap does not exist at index ${index}`);
    }
    return map;
  }

  private async getSequenceByKey(index: number, key: string): Promise<number | undefined> {
    const map = this.getSequenceByKeyMap(index);
    return map.get(key);
  }

  private async handleRewind(tableIndex: number, prev: string): Promise<void> {
    const prevIndex = await this.getSequenceByKey(tableIndex,prev)
    if(prevIndex === undefined) return;
    const validKeys = await this.sequenceKeyState.get(intToKey(prevIndex))
    assert(validKeys,`Previous key state not found at index ${prevIndex}`)
    validKeys.forEach((key,i)=>{
      this.getCursor(i).setCursor(key)
    })
  }

  public async tick(): Promise<void> {
    const keys: Array<string | undefined> = await Promise.all(
      this.cursors.map((cursor) => cursor.peek())
    );
    if (keys.some((key) => key === undefined)) return;

    const validKeys = keys as Array<string>;
    const indexToIncrement = await this.callback(validKeys);

    // Update each sequenceByKeyMaps with the current key and the current sequence
    await Promise.all(
      validKeys.map((key, index) => {
        if (this.sequenceByKeyMaps[index]) {
          return this.sequenceByKeyMaps[index].set(key, this.sequenceIndex);
        }
      })
    );
    await this.sequenceKeyState.set(intToKey(this.sequenceIndex),validKeys)

    if (this.cursors[indexToIncrement]) {
      const currentKey = await this.cursors[indexToIncrement].peek()
      assert(currentKey !== undefined,'Unable to find key for next sequence')
      await this.cursors[indexToIncrement].next();
      await this.set(intToKey(this.sequenceIndex), [indexToIncrement,currentKey]);
      this.sequenceIndex++;
    }
  }
}
