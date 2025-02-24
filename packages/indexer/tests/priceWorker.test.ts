import { expect } from "chai";
import { PriceWorker } from "../src/messaging/priceWorker";

describe("PriceWorker", function () {
  describe("calculateBridgeFee", function () {
    it("should correctly calculate the bridge fee", function () {
      const inputToken = {
        amount: "1000000000000000000", // 1 token in wei
        price: 1, // $1 per token
        decimals: 18,
      };

      const outputToken = {
        amount: "500000000000000000", // 0.5 token in wei
        price: 1, // $1 per token
        decimals: 18,
      };

      const bridgeFee = PriceWorker["calculateBridgeFee"](
        inputToken,
        outputToken,
      );
      expect(bridgeFee).to.equal("0.5"); // Expecting a bridge fee of $0.5
    });

    it("should return zero bridge fee when input and output values are equal", function () {
      const inputToken = {
        amount: "1000000000000000000", // 1 token in wei
        price: 2, // $2 per token
        decimals: 18,
      };

      const outputToken = {
        amount: "1000000000000000000", // 1 token in wei
        price: 2, // $2 per token
        decimals: 18,
      };

      const bridgeFee = PriceWorker["calculateBridgeFee"](
        inputToken,
        outputToken,
      );
      expect(bridgeFee).to.equal("0.0"); // Expecting a bridge fee of $0.0
    });

    it("should correctly calculate the bridge fee with different decimals", function () {
      const inputToken = {
        amount: "10000000000000000000", // 10 token in wei
        price: 2, // $2 per token
        decimals: 18,
      };

      const outputToken = {
        amount: "5000000000", // 5 tokens in smaller unit
        price: 3, // $3 per token
        decimals: 9,
      };
      // 10 * 2 = 20
      // 5 * 3 = 15
      // 20 - 15 = 5
      const bridgeFee = PriceWorker["calculateBridgeFee"](
        inputToken,
        outputToken,
      );
      expect(bridgeFee).to.equal("5.0"); // Expecting a bridge fee of $5.0
    });
  });
});
