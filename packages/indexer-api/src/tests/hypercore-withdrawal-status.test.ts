import { expect } from "chai";
import request from "supertest";
import express from "express";
import Redis from "ioredis";
import { DataSource, fixtures } from "@repo/indexer-database";
import { ExpressApp } from "../express-app";
import * as routers from "../routers";
import { getTestDataSource, getTestRedisInstance } from "./setup";

describe("Hypercore Withdrawal Status", () => {
  let app: express.Express;
  let dataSource: DataSource;
  let redisClient: Redis;
  let hypercoreCctpWithdrawFixture: fixtures.HypercoreCctpWithdrawFixture;

  beforeEach(async () => {
    // Set up database and Redis
    dataSource = await getTestDataSource();

    redisClient = getTestRedisInstance();

    // Initialize fixtures
    hypercoreCctpWithdrawFixture = new fixtures.HypercoreCctpWithdrawFixture(
      dataSource,
    );

    // Initialize the Express app with the deposits router
    const depositsRouter = routers.deposits.getRouter(dataSource, redisClient);
    app = ExpressApp({ deposits: depositsRouter });
  });

  afterEach(async () => {
    await dataSource.destroy();
    await redisClient.quit();
  });

  it("should return 200", async () => {
    const withdrawals = await hypercoreCctpWithdrawFixture.insert();
    expect(withdrawals.length).to.equal(1);
    const response = await request(app).get("/deposit/status").query({
      from: withdrawals[0]!.fromAddress,
      hypercoreWithdrawalNonce: withdrawals[0]!.hypercoreNonce,
    });
    expect(response.status).to.equal(200);
    expect(response.body.status).to.equal("filled");
    expect(response.body.fillTxnRef).to.equal(withdrawals[0]!.mintTxnHash);
  });

  it("should return 400", async () => {
    const response = await request(app).get("/deposit/status").query({
      hypercoreWithdrawalNonce: "random-nonce",
    });
    expect(response.status).to.equal(400);
  });
});
