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
import { Wallet } from "ethers";

describe("Sponsorships API Integration Tests", () => {
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
    finalRecipient: "0xf1D7F5C564e5c3e07d08F796c7329437156dDD39",
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
      finalRecipient: "0xf1D7F5C564e5c3e07d08F796c7329437156dDD39",
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
      finalRecipient: "0xf1D7F5C564e5c3e07d08F796c7329437156dDD39",
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
      finalRecipient: "0xf1D7F5C564e5c3e07d08F796c7329437156dDD39",
      evmAmountSponsored: "0",
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
    await dataSource.destroy();
  });

  it("should return empty stats when no data is available", async () => {
    const res = await request(app).get("/sponsorships");
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({
      totalSponsorships: [],
      userSponsorships: [],
      accountActivations: [],
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
    expect(res.body.totalSponsorships).to.be.an("array").that.is.empty;
    expect(res.body.userSponsorships).to.be.an("array").that.is.empty;
  });

  it("should correctly aggregate sponsorship data with multiple chains, tokens, and users", async () => {
    const user1 = Wallet.createRandom().address;
    const user2 = Wallet.createRandom().address;
    const user3 = Wallet.createRandom().address;
    const tokenA = Wallet.createRandom().address;
    const tokenB = Wallet.createRandom().address;
    const tokenC = Wallet.createRandom().address;
    const chain1 = 1,
      chain2 = 2,
      chain3 = 3;

    // Sponsorships
    await swapFlowFinalizedFixture.insert([
      {
        ...defaultSwapFlowFinalized,
        chainId: chain1.toString(),
        finalToken: tokenA,
        evmAmountSponsored: "100",
        finalRecipient: user1,
        transactionHash: "0x10",
      },
      {
        ...defaultSwapFlowFinalized,
        chainId: chain2.toString(),
        finalToken: tokenB,
        evmAmountSponsored: "200",
        finalRecipient: user2,
        transactionHash: "0x11",
      },
    ]);
    await simpleTransferFlowCompletedFixture.insert([
      {
        ...defaultSimpleTransferFlowCompleted,
        chainId: chain3.toString(),
        finalToken: tokenC,
        evmAmountSponsored: "300",
        finalRecipient: user3,
        transactionHash: "0x12",
      },
      {
        ...defaultSimpleTransferFlowCompleted,
        chainId: chain1.toString(),
        finalToken: tokenA,
        evmAmountSponsored: "150",
        finalRecipient: user2,
        transactionHash: "0x13",
      },
    ]);
    await fallbackHyperEVMFlowCompletedFixture.insert([
      {
        ...defaultFallbackHyperEVMFlowCompleted,
        chainId: chain2.toString(),
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
        finalRecipient: user1,
        chainId: chain1.toString(),
        fundingToken: tokenA,
      },
      {
        ...defaultSponsoredAccountActivation,
        finalRecipient: user2,
        chainId: chain2.toString(),
        transactionHash: "0x16",
        fundingToken: tokenB,
      },
      {
        ...defaultSponsoredAccountActivation,
        finalRecipient: user3,
        chainId: chain3.toString(),
        transactionHash: "0x17",
        fundingToken: tokenC,
      },
      {
        ...defaultSponsoredAccountActivation,
        finalRecipient: user1,
        chainId: chain1.toString(),
        transactionHash: "0x18",
        fundingToken: tokenA,
      }, // Duplicate user
    ]);

    const res = await request(app).get("/sponsorships");
    expect(res.status).to.equal(200);

    const { totalSponsorships, accountActivations, userSponsorships } =
      res.body;

    // Total Sponsorships (order-independent check)
    expect(totalSponsorships).to.have.deep.members([
      {
        chainId: chain1,
        finalTokens: [{ tokenAddress: tokenA, evmAmountSponsored: "250" }], // 100 + 150
      },
      {
        chainId: chain2,
        finalTokens: [{ tokenAddress: tokenB, evmAmountSponsored: "450" }], // 200 + 250
      },
      {
        chainId: chain3,
        finalTokens: [{ tokenAddress: tokenC, evmAmountSponsored: "300" }],
      },
    ]);

    // Account Activations (order-independent check)
    expect(accountActivations).to.have.deep.members([
      { finalRecipient: user1 },
      { finalRecipient: user2 },
      { finalRecipient: user3 },
    ]);
    // User-Specific Sponsorships (verbose, order-independent check)
    expect(userSponsorships).to.be.an("array").with.lengthOf(3);

    // Check User 1
    const user1Sponsorship = userSponsorships.find(
      (s: any) => s.finalRecipient === user1,
    );
    expect(user1Sponsorship, "User 1 data missing").to.exist;
    expect(user1Sponsorship.sponsorships).to.have.deep.members([
      {
        chainId: chain1,
        finalTokens: [{ tokenAddress: tokenA, evmAmountSponsored: "100" }],
      },
      {
        chainId: chain2,
        finalTokens: [{ tokenAddress: tokenB, evmAmountSponsored: "250" }],
      },
    ]);

    // Check User 2
    const user2Sponsorship = userSponsorships.find(
      (s: any) => s.finalRecipient === user2,
    );
    expect(user2Sponsorship, "User 2 data missing").to.exist;
    expect(user2Sponsorship.sponsorships).to.have.deep.members([
      {
        chainId: chain1,
        finalTokens: [{ tokenAddress: tokenA, evmAmountSponsored: "150" }],
      },
      {
        chainId: chain2,
        finalTokens: [{ tokenAddress: tokenB, evmAmountSponsored: "200" }],
      },
    ]);

    // Check User 3
    const user3Sponsorship = userSponsorships.find(
      (s: any) => s.finalRecipient === user3,
    );
    expect(user3Sponsorship, "User 3 data missing").to.exist;
    expect(user3Sponsorship.sponsorships).to.have.deep.members([
      {
        chainId: chain3,
        finalTokens: [{ tokenAddress: tokenC, evmAmountSponsored: "300" }],
      },
    ]);
  });
});
