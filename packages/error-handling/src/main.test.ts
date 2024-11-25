import { describe, it } from "mocha";
import { expect } from "chai";
import assert from "assert";
import { AssertError } from "./errors";
import { isIndexerError, assert as customAssert } from "./utils";

describe("Error handling Tests", function () {
  it("should run the toJSON in Stringify", () => {
    const e = new AssertError("test");
    const jsonStringifyDirectly = JSON.stringify(e.toJSON());
    const jsonIndirectly = JSON.stringify(e);
    expect(jsonIndirectly).to.eq(jsonStringifyDirectly);
  });

  describe("typeguards", function () {
    it("should validate IndexerError", () => {
      const e = new AssertError("test");
      expect(isIndexerError(e)).to.be.true;
    });
  });

  describe("utils", () => {
    it("should run assert as expected", () => {
      expect(() => assert(false, "")).to.throw;
      expect(() => customAssert(false, "")).to.throw;

      expect(() => assert(true, "")).to.not.throw;
      expect(() => customAssert(true, "")).to.not.throw;
    });
  });
});
