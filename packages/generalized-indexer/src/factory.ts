import { AsyncSortedKVStore, IKeyManager } from "./sorted-kv";
import { Sequencer } from "./sequencer";
import { Cursor } from "./cursor";
type SequencerCb = (keys: Array<string>) => Promise<number>;

export async function SequencerFactory(tables:IKeyManager[],sequencerCb:SequencerCb){
  const cursors = tables.map(table=>new Cursor(table))
  const sequencer = new Sequencer(cursors,sequencerCb)
  tables.forEach(table=>{
    table.on('set',()=>sequencer.tick())
    table.on('delete',()=>sequencer.tick())
  })
  return sequencer
}