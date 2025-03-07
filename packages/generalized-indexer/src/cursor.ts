import Events from "events";
import assert from "assert";
import { IKeyManager } from "./sorted-kv";

// cursor tracks what key in the table we need to process next.
// internally the cursor tracks the key before the current key, and if its set to undefined, that implies its set to the start
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
    this.table.on("change", (key?: string) => {
      this.handleTableChange(key);
    });
  }

  private async handleTableChange(key?: string): Promise<void> {
    // cursor is undefined, which means we are already at beginning
    if (this.cursor === undefined) return;
    // if key undefined, that means table is empty
    if (key === undefined) {
      this.cursor = undefined;
    } else if (key <= this.cursor) {
      // if key is less than or equal to cursor, this means we need to go back
      // since we assume we have processed up to cursor
      // set cursor to the key before this one, because actually cursor points to the spot before active key
      this.cursor = await this.table.prevKey(key);
    } else {
      return;
    }
    this.emit("change", this.cursor);
  }

  public async increment(): Promise<string | undefined> {
    this.cursor = await this.get();
    return this.get();
  }
  public async get(): Promise<string | undefined> {
    // cursor is not set, return first element in table
    if (this.cursor === undefined) return this.table.firstKey();
    // otherwise return the element after the cursor
    return this.table.nextKey(this.cursor);
  }
  public async getPrev(): Promise<string | undefined> {
    return this.cursor;
  }
  public set(newCursor: string | undefined): void {
    this.cursor = newCursor;
  }
}
