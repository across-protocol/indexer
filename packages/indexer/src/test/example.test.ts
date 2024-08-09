import { expect } from "chai";

// this is in here because mocha crashes if no tests are found
describe("example", () => {
  it("should return true", async () => {
    expect(true).to.be.true;
  });
});
