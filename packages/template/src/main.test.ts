import { expect } from "chai";

import * as main from "./main";

describe("main", () => {
  it("should return true", async () => {
    const result = await main.Main({});
    expect(result).to.be.true;
  });
});
