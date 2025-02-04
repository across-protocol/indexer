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
    // this is called whenever a cursor gets data behind it
    // we have the cursor table index and the changed key
    const prevIndex = await this.getSequenceByKey(tableIndex,prev)
    console.log('rewinding',{tableIndex,prev,prevIndex})

    if(prevIndex === undefined) return;
    const validKeys = await this.sequenceKeyState.get(intToKey(prevIndex))
    assert(validKeys,`Previous key state not found at index ${prevIndex}`)
    validKeys.forEach((key,i)=>{
      this.getCursor(i).set(key)
    })
  }

  public async tick(): Promise<void> {
    const keys: Array<string | undefined> = await Promise.all(
      this.cursors.map((cursor) => cursor.get())
    );
    if (keys.some((key) => key === undefined)) return;

    console.log(keys)
    const validKeys = keys as Array<string>;
    const keyIndex = await this.callback(validKeys);
    const nextKey = validKeys[keyIndex]
    const cursorToIncrement = this.cursors[keyIndex]
    assert(cursorToIncrement !== undefined,'Returned invalid key index from comparator')
    assert(nextKey !== undefined,'Invalid index into key array')

    // Update each sequenceByKeyMaps with the current key and the current sequence
    await Promise.all(
      validKeys.map((key, index) => {
        if (this.sequenceByKeyMaps[index]) {
          return this.sequenceByKeyMaps[index].set(key, this.sequenceIndex);
        }
      })
    );
    await this.sequenceKeyState.set(intToKey(this.sequenceIndex),validKeys)
    await this.set(intToKey(this.sequenceIndex), [keyIndex,nextKey]);
    const result = await cursorToIncrement.increment()
    this.sequenceIndex++;
    // console.log('seq tick',{keyIndex,nextKey,result,sequenceIndex:this.sequenceIndex})
  }
}
