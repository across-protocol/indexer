import { AsyncSortedKVStore, IKeyManager } from "./sorted-kv";
import { Sequencer } from "./sequencer";
import { Cursor } from "./cursor";
import * as Reducer from "./reducer";
type SequencerCb = (keys: Array<string>) => Promise<number>;

export function IndexerFactory(
  tables: IKeyManager[],
  sequencerCb: SequencerCb,
  reducerCb: Reducer.ReducerCb,
) {
  const cursors = tables.map((table) => new Cursor(table));
  const sequencer = new Sequencer(cursors, sequencerCb);
  const reducer = new Reducer.Reducer(sequencer, reducerCb);

  tables.forEach((table) => {
    table.on("change", () => {
      sequencer.tick();
    });
  });

  sequencer.on("change", () => {
    reducer.tick();
  });

  return { cursors, sequencer, reducer };
}
