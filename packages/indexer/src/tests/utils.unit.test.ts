import { utils } from "@across-protocol/sdk";
import { expect } from "chai";
import {
  getDstOFTHandlerAddress,
  getSponsoredCCTPDstPeripheryAddress,
  getSponsoredCCTPSrcPeripheryAddress,
  getSponsoredOFTSrcPeripheryAddress,
} from "../utils/contractUtils";

describe("Beta Contract Accessors (using provided JSON)", () => {
  describe("getSponsoredCCTPDstPeripheryAddress", () => {
    it("should return the correct address for HyperEVM (999) explicitly", () => {
      const result = getSponsoredCCTPDstPeripheryAddress(999);
      expect(utils.isValidEvmAddress(result!.toLowerCase())).to.be.true;
    });

    it("should default to HyperEVM (999) if no chainId provided", () => {
      const result = getSponsoredCCTPDstPeripheryAddress();
      expect(utils.isValidEvmAddress(result!.toLowerCase())).to.be.true;
    });

    it("should return undefined if accessed on a chain where it doesn't exist (e.g., Arbitrum 42161)", () => {
      expect(getSponsoredCCTPDstPeripheryAddress(42161)).to.be.undefined;
    });
  });

  describe("getDstOFTHandlerAddress", () => {
    it("should return the correct address for HyperEVM (999)", () => {
      const result = getDstOFTHandlerAddress(999);
      expect(utils.isValidEvmAddress(result!.toLowerCase())).to.be.true;
    });

    it("should default to HyperEVM (999)", () => {
      const result = getDstOFTHandlerAddress();
      expect(utils.isValidEvmAddress(result!.toLowerCase())).to.be.true;
    });
  });

  describe("getSponsoredCCTPSrcPeripheryAddress", () => {
    it("should return correct address for Mainnet (1)", () => {
      const result = getSponsoredCCTPSrcPeripheryAddress(1);
      expect(utils.isValidEvmAddress(result!.toLowerCase())).to.be.true;
    });

    it("should return correct address for Base (8453)", () => {
      const result = getSponsoredCCTPSrcPeripheryAddress(8453);
      expect(utils.isValidEvmAddress(result!.toLowerCase())).to.be.true;
    });
  });

  describe("getSponsoredOFTSrcPeripheryAddress", () => {
    it("should return correct address for Mainnet (1)", () => {
      const result = getSponsoredOFTSrcPeripheryAddress(1);
      expect(utils.isValidEvmAddress(result!.toLowerCase())).to.be.true;
    });

    it("should return correct address for Unichain (130)", () => {
      const result = getSponsoredOFTSrcPeripheryAddress(130);
      expect(utils.isValidEvmAddress(result!.toLowerCase())).to.be.true;
    });

    it("should return undefined if address is missing (e.g. HyperEVM 999 does not have SrcPeriphery in this JSON)", () => {
      expect(getSponsoredOFTSrcPeripheryAddress(999)).to.be.undefined;
    });
  });
});
