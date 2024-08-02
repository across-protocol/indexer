// importing these from globals is optional
import {describe, expect, test} from '@jest/globals';

import * as main from './main'

describe('main',()=>{
  test("should return true",async ()=>{
    const result = await main.Main({});
    expect(result).toBe(true);
  })
})
