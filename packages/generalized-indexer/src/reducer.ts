import { Sequencer } from './sequencer';
import { Cursor } from './cursor';

export type ReducerCb = (locator: [number,string], index: number) => Promise<void>

class Reducer {
  private cursor: Cursor;
  constructor(private sequencer:Sequencer,  private reducer: ReducerCb) {
    this.cursor = new Cursor(sequencer);
  }
  public async tick(){
    const cursor = await this.cursor.peek()
    if(cursor === undefined ) return
    const nextSequence = await this.sequencer.get(cursor)
    if(nextSequence === undefined) return 
    await this.reducer(nextSequence,parseInt(cursor))
    await this.cursor.next()
  }
}