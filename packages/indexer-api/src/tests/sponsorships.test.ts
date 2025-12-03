import { expect } from "chai";
import winston from "winston";
import { DataSource } from "typeorm";
import { getTestDataSource } from "./setup";
import { ExpressApp } from "../express-app";
import * as routers from "../routers";
import request from "supertest";
import { Application } from "express";
import { entities } from "@repo/indexer-database";
import { fixtures } from "@repo/indexer-database";
import { SponsorshipDto } from "../dtos/sponsorships.dto";

describe("Sponsorships API Integration Tests", () => {
  const logger = winston.createLogger({
    transports: [new winston.transports.Console()],
  });

  let dataSource: DataSource;
  let app: Application;

  let swapFlowFinalizedFixture: fixtures.GenericFixture<entities.SwapFlowFinalized>;
  let simpleTransferFlowCompletedFixture: fixtures.GenericFixture<entities.SimpleTransferFlowCompleted>;
  let fallbackHyperEVMFlowCompletedFixture: fixtures.GenericFixture<entities.FallbackHyperEVMFlowCompleted>;
  let sponsoredAccountActivationFixture: fixtures.GenericFixture<entities.SponsoredAccountActivation>;

  const now = Date.now();
  const blockTimestamp = new Date(now - 1000);

  const defaultSwapFlowFinalized: Partial<entities.SwapFlowFinalized> = {
    blockTimestamp,
    transactionHash: "0x1",
    logIndex: 1,
    blockNumber: 1,
    finalRecipient: "0x1",
    quoteNonce: "0x1",
    totalSent: "0",
    finalised: true,
    transactionIndex: 1,
  };

  const defaultSimpleTransferFlowCompleted: Partial<entities.SimpleTransferFlowCompleted> =
    {
      blockTimestamp,
      transactionHash: "0x2",
      logIndex: 1,
      blockNumber: 1,
      finalRecipient: "0x1",
      evmAmountIn: "0",
      bridgingFeesIncurred: "0",
      finalised: true,
      transactionIndex: 1,
      quoteNonce: "0x1",
    };

  const defaultFallbackHyperEVMFlowCompleted: Partial<entities.FallbackHyperEVMFlowCompleted> =
    {
      blockTimestamp,
      transactionHash: "0x3",
      logIndex: 1,
      blockNumber: 1,
      finalRecipient: "0x1",
      evmAmountIn: "0",
      bridgingFeesIncurred: "0",
      finalised: true,
      transactionIndex: 1,
      quoteNonce: "0x1",
    };

  const defaultSponsoredAccountActivation: Partial<entities.SponsoredAccountActivation> =
    {
      blockTimestamp,
      transactionHash: "0x4",
      logIndex: 1,
      blockNumber: 1,
      quoteNonce: "0x1",
      finalised: true,
      transactionIndex: 1,
    };

  beforeEach(async () => {
    dataSource = await getTestDataSource();

    const sponsorshipsRouter = routers.sponsorships.getRouter(dataSource);
    app = ExpressApp({ sponsorships: sponsorshipsRouter });

    swapFlowFinalizedFixture = new fixtures.GenericFixture(
      dataSource,
      entities.SwapFlowFinalized,
    );
    simpleTransferFlowCompletedFixture = new fixtures.GenericFixture(
      dataSource,
      entities.SimpleTransferFlowCompleted,
    );
    fallbackHyperEVMFlowCompletedFixture = new fixtures.GenericFixture(
      dataSource,
      entities.FallbackHyperEVMFlowCompleted,
    );
    sponsoredAccountActivationFixture = new fixtures.GenericFixture(
      dataSource,
      entities.SponsoredAccountActivation,
    );
  });

  afterEach(async () => {
    await swapFlowFinalizedFixture.deleteAll();
    await simpleTransferFlowCompletedFixture.deleteAll();
    await fallbackHyperEVMFlowCompletedFixture.deleteAll();
    await sponsoredAccountActivationFixture.deleteAll();
    await dataSource.destroy();
  });

  it("should return empty stats when no data is available", async () => {
    const res = await request(app).get("/sponsorships");
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({
      sponsorships: [],
      accountActivations: [],
      perChain: {},
    });
  });

  it("should respect the 24-hour window limit", async () => {
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);
    await swapFlowFinalizedFixture.insert([
      {
        ...defaultSwapFlowFinalized,
        chainId: "1",
        finalToken: "tokenA",
        evmAmountSponsored: "100",
        blockTimestamp: twoDaysAgo,
      },
    ]);

    const fromTimestamp = now - 3 * 24 * 60 * 60 * 1000;
    const toTimestamp = now;

    const res = await request(app).get(
      `/sponsorships?fromTimestamp=${fromTimestamp}&toTimestamp=${toTimestamp}`,
    );

    expect(res.status).to.equal(200);
    expect(res.body.sponsorships).to.be.an("array").that.is.empty;
  });

  context("Complex Aggregation with Multiple Chains, Tokens, and Users", () => {
    const user1 = "0xuser1",
      user2 = "0xuser2",
      user3 = "0xuser3";
    const tokenA = "0xtokena",
      tokenB = "0xtokenb",
      tokenC = "0xtokenc";
    const chain1 = "1",
      chain2 = "2",
      chain3 = "3";

    beforeEach(async () => {
      // Sponsorships
      await swapFlowFinalizedFixture.insert([
        {
          ...defaultSwapFlowFinalized,
          chainId: chain1,
          finalToken: tokenA,
          evmAmountSponsored: "100",
          finalRecipient: user1,
          transactionHash: "0x10",
        },
        {
          ...defaultSwapFlowFinalized,
          chainId: chain2,
          finalToken: tokenB,
          evmAmountSponsored: "200",
          finalRecipient: user2,
          transactionHash: "0x11",
        },
      ]);
      await simpleTransferFlowCompletedFixture.insert([
        {
          ...defaultSimpleTransferFlowCompleted,
          chainId: chain3,
          finalToken: tokenC,
          evmAmountSponsored: "300",
          finalRecipient: user3,
          transactionHash: "0x12",
        },
        {
          ...defaultSimpleTransferFlowCompleted,
          chainId: chain1,
          finalToken: tokenA,
          evmAmountSponsored: "150",
          finalRecipient: user2,
          transactionHash: "0x13",
        },
      ]);
      await fallbackHyperEVMFlowCompletedFixture.insert([
        {
          ...defaultFallbackHyperEVMFlowCompleted,
          chainId: chain2,
          finalToken: tokenB,
          evmAmountSponsored: "250",
          finalRecipient: user1,
          transactionHash: "0x14",
        },
      ]);

      // Account Activations
      await sponsoredAccountActivationFixture.insert([
        {
          ...defaultSponsoredAccountActivation,
          chainId: chain1,
          fundingToken: tokenA,
          evmAmountSponsored: "500",
          finalRecipient: user1,
          transactionHash: "0x15",
        },
        {
          ...defaultSponsoredAccountActivation,
          chainId: chain2,
          fundingToken: tokenB,
          evmAmountSponsored: "600",
          finalRecipient: user2,
          transactionHash: "0x16",
        },
        {
          ...defaultSponsoredAccountActivation,
          chainId: chain3,
          fundingToken: tokenC,
          evmAmountSponsored: "700",
          finalRecipient: user3,
          transactionHash: "0x17",
        },
      ]);
    });

    it("should correctly aggregate data globally and per chain", async () => {
      const res = await request(app).get("/sponsorships");
      expect(res.status).to.equal(200);

      const expected: SponsorshipDto = {
        sponsorships: [
          { sponsoredAmount: "250", tokenAddress: tokenA }, // 100 + 150
          { sponsoredAmount: "450", tokenAddress: tokenB }, // 200 + 250
          { sponsoredAmount: "300", tokenAddress: tokenC },
        ],
        userSponsorships: [],
        accountActivations: [
          { userAddress: user1, sponsoredAmount: "500", tokenAddress: tokenA },
          { userAddress: user2, sponsoredAmount: "600", tokenAddress: tokenB },
          { userAddress: user3, sponsoredAmount: "700", tokenAddress: tokenC },
        ],
        perChain: {
          [chain1]: {
            sponsorships: [{ sponsoredAmount: "250", tokenAddress: tokenA }],
            accountActivations: [
              {
                userAddress: user1,
                sponsoredAmount: "500",
                tokenAddress: tokenA,
              },
            ],
          },
          [chain2]: {
            sponsorships: [{ sponsoredAmount: "450", tokenAddress: tokenB }],
            accountActivations: [
              {
                userAddress: user2,
                sponsoredAmount: "600",
                tokenAddress: tokenB,
              },
            ],
          },
          [chain3]: {
            sponsorships: [{ sponsoredAmount: "300", tokenAddress: tokenC }],
            accountActivations: [
              {
                userAddress: user3,
                sponsoredAmount: "700",
                tokenAddress: tokenC,
              },
            ],
          },
        },
      };

      // Verify Global Arrays (Order independent)
      // .deep.members checks that the array contains the same objects, regardless of order
      expect(res.body.sponsorships).to.have.deep.members(expected.sponsorships);
      expect(res.body.userSponsorships).to.be.undefined;
      expect(res.body.accountActivations).to.have.deep.members(
        expected.accountActivations,
      );

      // Verify Per-Chain keys exist
      const chainIds = Object.keys(expected.perChain);
      expect(Object.keys(res.body.perChain)).to.have.members(chainIds);

      // Verify Per-Chain contents (Order independent)
      for (const chainId of chainIds) {
        const actualChain = res.body.perChain[chainId];
        const expectedChain = expected.perChain[chainId];
        expect(expectedChain).to.exist;
        // Check strict string equality inside these arrays
        expect(actualChain.sponsorships).to.have.deep.members(
          expectedChain!.sponsorships,
        );
        expect(actualChain.accountActivations).to.have.deep.members(
          expectedChain!.accountActivations,
        );
      }
    });

    it("should correctly filter by a user address", async () => {
      const res = await request(app).get(`/sponsorships?address=${user1}`);
      expect(res.status).to.equal(200);

      const expectedUserSponsorships = [
        {
          userAddress: user1,
          userSponsoredAmount: "100",
          tokenAddress: tokenA,
        },
        {
          userAddress: user1,
          userSponsoredAmount: "250",
          tokenAddress: tokenB,
        },
      ];

      res.body.userSponsorships.sort(
        (a: { tokenAddress: string }, b: { tokenAddress: string }) =>
          a.tokenAddress.localeCompare(b.tokenAddress),
      );
      expectedUserSponsorships.sort((a, b) =>
        a.tokenAddress.localeCompare(b.tokenAddress),
      );

      expect(res.body.userSponsorships).to.deep.equal(expectedUserSponsorships);

      // non-user specific data should be unaffected
      expect(res.body.sponsorships).to.have.lengthOf(3);
      expect(res.body.accountActivations).to.have.lengthOf(3);
    });
  });
});
