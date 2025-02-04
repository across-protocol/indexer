import Events from 'events';
import assert from 'assert';
import { IKeyManager } from './sorted-kv';

// cursor should point to the next value
// export class Cursor extends Events {

//   private table: IKeyManager;
//   private cursor?: string;
//   private bound:'start' | 'end' = 'start';

//   constructor(table: IKeyManager, cursor?: string) {
//     super();
//     this.table = table;
//     this.cursor = cursor;

//     // Listen to 'set' and 'delete' events from the table
//     this.table.on('change', (key?: string) => {
//       this.handleTableChange(key);
//     });
//   }

//   private async handleTableChange(next?: string): Promise<void> {
//     console.log('cursor table change',next)
//     const cursor = await this.get()
//     // next is undefined when table is cleared
//     if(next === undefined){
//       this.cursor = undefined
//       this.bound = 'start'
//       this.emit('change', this.cursor);
//       return;
//     }
//     if(cursor === undefined){
//       // cursor is at end, so any value would pull us back
//       if(this.bound === 'end'){
//         this.cursor = next;
//         this.emit('change', this.cursor);
//       }
//       return;
//     };
//     // change happened before our spot
//     if (next < cursor) {
//       // we need to go back to the key before this change
//       this.cursor = await this.table.closestKeyPrev(next);
//       this.emit('change', this.cursor);
//     }
//   }

//   public async increment(): Promise<string | undefined> {
//     const prevKey = await this.get();
//     // this returns undefined if there are no values in table
//     if(prevKey === undefined) return;
//     const nextKey = await this.table.nextKey(prevKey);
//     // no next key, we set cursor to undefined but switch bound to end 
//     if(nextKey === undefined){
//       this.bound = 'end'
//     }
//     this.cursor = nextKey;
//     return this.cursor
//   }
//   // if this.cursor is undefined, it means we are at start
//   // if we still return undefined, table is empty
//   public async get():Promise<string | undefined> { 
//     if(this.cursor === undefined){
//       if(this.bound === 'start'){
//         this.cursor = await this.table.firstKey()
//       }
//     }
//     console.log('bound',this.bound, this.cursor)
//     return this.cursor
//   }
//   public set(newCursor: string | undefined): void {
//     this.cursor = newCursor;
//   }
// }
// this cursor points to data we have already processed, rather than
// the next point we need to process
export class Cursor extends Events {

  private table: IKeyManager;
  // cursor represents our currently processed point
  // if undefined, we have not started it ie at beginning
  private cursor?: string;

  constructor(table: IKeyManager, cursor?: string) {
    super();
    this.table = table;
    this.cursor = cursor;

    // Listen to 'set' and 'delete' events from the table
    this.table.on('change', (key?: string) => {
      this.handleTableChange(key);
    });
  }

  private async handleTableChange(key?: string): Promise<void> {
    // cursor is undefined, which means we are already at beginning
    if(this.cursor === undefined) return;
    // if key undefined, that means table is empty
    if(key === undefined){
      this.cursor = undefined
      this.emit('change', this.cursor);
      return;
    }
    // if key is less than or equal to cursor, this means we need to go back
    // since we assume we have processed up to cursor
    if (key <= this.cursor) {
      this.cursor = await this.table.prevKey(key);
    }
    this.emit('change', this.cursor);
  }

  public async increment(): Promise<string | undefined> {
    this.cursor = await this.get()
    return this.get() 
  }
  public async get():Promise<string | undefined> { 
    // cursor is not set, return first element in table
    if(this.cursor === undefined) return this.table.firstKey();
    // otherwise return the element after the cursor
    return this.table.nextKey(this.cursor);
  }

  public set(newCursor: string | undefined): void {
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