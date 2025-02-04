import assert from 'assert';
import {Sequencer} from './sequencer'; 
import { Cursor } from './cursor'; 
import { AsyncSortedKVStore } from './sorted-kv';

describe('Sequencer', function() {
    let sequencer: Sequencer;
    let table1: AsyncSortedKVStore<string>;
    let table2: AsyncSortedKVStore<string>;
    let cursor1: Cursor;
    let cursor2: Cursor;

    beforeEach(function() {
        table1 = new AsyncSortedKVStore<string>();
        table2 = new AsyncSortedKVStore<string>();
        cursor1 = new Cursor(table1);
        cursor2 = new Cursor(table2);
        sequencer = new Sequencer([cursor1,cursor2],async (keys)=>{
          const [a,b] = keys
          assert(a)
          assert(b)
          return a < b ? 0 : 1
        });
    });

    it('should initialize with an empty sequence', async function() {
      const result = await sequencer.keyAtIndex(0)
      assert(result === undefined)
    });
    it('process blocked update', async function() {
      await table1.set('a','a')
      await sequencer.tick();
      const val = await sequencer.get('0')
      assert(val === undefined)
    });
    it('process valid update', async function() {
      await table1.set('a','a')
      await table2.set('b','b')
      await sequencer.tick();
      const val = await sequencer.get((await sequencer.keyAtIndex(0))!)
      assert(val)
      const [table,key] = val
      assert(table === 0)
      assert(key === 'a')
    });
    it('process valid update', async function() {
      await table1.set('m','m')
      await table2.set('n','n')
      await sequencer.tick();
      await table1.set('o','o')
      await sequencer.tick();
      await table2.set('p','p')
      await sequencer.tick();
      await table1.set('a','a')
      await new Promise(res=>setTimeout(res,1))
      await sequencer.tick();
      // await table2.set('b','b')
      // await sequencer.tick();
      // await sequencer.tick();

      const cursor = new Cursor(sequencer)
      let vals = []
      do{
        const key = await cursor.get()
        console.log(key)
        assert(key)
        vals.push(await sequencer.get(key))
      }while(await cursor.increment())
      console.log(vals)
      assert(vals.length)
    });

});
