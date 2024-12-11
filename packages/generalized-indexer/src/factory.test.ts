import { expect } from 'chai';
import { SequencerFactory } from './factory';
import { AsyncSortedKVStore } from './sorted-kv';

describe('SequencerFactory', function() {
  let tables: AsyncSortedKVStore<any>[];
  let sequencerCb: (keys: Array<string>) => Promise<number>;

  beforeEach(async function() {
    // Initialize tables and sequencer callback
    tables = [new AsyncSortedKVStore(), new AsyncSortedKVStore()];
    sequencerCb = async (keys) => {
      const values = await Promise.all(keys.map((key,i)=>tables[i]?.get(key)))
      return values[0] < values[1] ? values[0] : values[1]
    };
  });

  it('should create a sequencer with cursors for each table', async function() {
    const sequencer = await SequencerFactory(tables, sequencerCb);
    expect(sequencer).to.exist;
    const sequencerSize = await sequencer.size;
    expect(sequencerSize).to.equal(0);
  });

  // it('should trigger sequencer tick on table set', async function() {
  //   const sequencer = await SequencerFactory(tables, sequencerCb);
  //   const spy = this.sandbox.spy(sequencer, 'tick');

  //   await tables[0].set('key1', 'value1');
  //   expect(spy.calledOnce).to.be.true;
  // });

  // it('should trigger sequencer tick on table delete', async function() {
  //   const sequencer = await SequencerFactory(tables, sequencerCb);
  //   const spy = this.sandbox.spy(sequencer, 'tick');

  //   await tables[0].set('key1', 'value1');
  //   await tables[0].delete('key1');
  //   expect(spy.calledTwice).to.be.true;
  // });

  // Add more tests as needed
});
