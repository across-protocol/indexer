import Events from 'events';
import assert from 'assert';
import { IKeyManager } from './sorted-kv';

export class Cursor extends Events {
  private table: IKeyManager;
  private cursor?: string;

  constructor(table: IKeyManager, cursor?: string) {
    super();
    this.table = table;
    this.cursor = cursor;

    // Listen to 'set' and 'delete' events from the table
    this.table.on('change', (key?: string) => {
      this.change(key);
    });
  }

  private async change(next?: string): Promise<void> {
    // cursor is at start
    if(this.cursor=== undefined) return;
    // change happened at start
    if(next === undefined){
      this.cursor = undefined
      this.emit('change', this.cursor);
      return;
    }
    // change happened before our spot
    if (next < this.cursor) {
      // we need to go back to the key before this change
      this.cursor = await this.table.prevKey(next);
      this.emit('change', this.cursor);
    }
  }

  public async next(): Promise<string | undefined> {
    this.cursor = await this.peek();
    return this.cursor;
  }

  public async peek(override: string | undefined = this.cursor): Promise<string | undefined> {
    if (override === undefined) {
      return this.table.keyAtIndex(0);
    } else {
      return this.table.nextKey(override);
    }
  }

  public setCursor(newCursor: string | undefined): void {
    this.cursor = newCursor;
  }
}
// export class CursorSequence extends Events {
//   private cursorToKey: SequencerTable;
//   private keyToCursor: AsyncSortedKVStore<number>;
//   private cursorIndex: number;

//   constructor(private table: IKeyManager) {
//     super();
//     this.table = table;
//     this.cursorToKey = new SequencerTable();
//     this.keyToCursor = new AsyncSortedKVStore<number>();
//     this.cursorIndex = 0;

//     // Listen to 'set' and 'delete' events from the table
//     this.table.on('set', (key: string) => {
//       this.keyChange(key);
//     });

//     this.table.on('delete', (key: string) => {
//       this.keyChange(key);
//     });
//   }

//   // we check if a key changed before our cursor, then make sure we revert back to that spot
//   private async keyChange(key:string){
//     const lastSeenKey = await this.cursorToKey.get(this.cursorIndex)
//     if(lastSeenKey === undefined) return;
//     if(key >= lastSeenKey) return;
//     const cursorIndex = await this.keyToCursor.get(key)
//     assert(cursorIndex !== undefined,'Unable to revert to previous cursor')
//     this.cursorIndex = cursorIndex
//     this.emit('revert',cursorIndex)
//   }

//   public async next(): Promise<string | undefined> {
//     const key = await this.peek() 
//     if (key !== undefined) {
//       this.cursorIndex++;
//       const nextKey = await this.table.nextKey(key)
//       if(nextKey!== undefined){
//         await this.keyToCursor.set(nextKey,this.cursorIndex)
//         await this.cursorToKey.set(this.cursorIndex,nextKey,)
//       }

//     }
//     return key;
//   }

//   public async peek(): Promise<string | undefined> {
//     return this.cursorToKey.get(this.cursorIndex);
//   }
// }