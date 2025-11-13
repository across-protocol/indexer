import { expect } from "chai";
import request from "supertest";
import express from "express";
import Redis from "ioredis";

import { createDataSource, DataSource, fixtures } from "@repo/indexer-database";
import * as Indexer from "@repo/indexer";

import { ExpressApp } from "../express-app";
import * as utils from "../utils";
import * as routers from "../routers";

describe("Hypercore Withdrawal Status", () => {
  let app: express.Express;
  let dataSource: DataSource;
  let redis: Redis;
  let hypercoreCctpWithdrawFixture: fixtures.HypercoreCctpWithdrawFixture;

  before(async () => {
    // Set up database and Redis
    const databaseConfig = utils.getPostgresConfig(process.env);
    dataSource = await createDataSource(databaseConfig).initialize();

    const redisConfig = Indexer.parseRedisConfig(process.env);
    redis = new Redis(redisConfig);

    // Initialize fixtures
    hypercoreCctpWithdrawFixture = new fixtures.HypercoreCctpWithdrawFixture(
      dataSource,
    );
    await hypercoreCctpWithdrawFixture.deleteAll();

    // Initialize the Express app with the deposits router
    const depositsRouter = routers.deposits.getRouter(dataSource, redis);
    app = ExpressApp({ deposits: depositsRouter });
  });

  after(async () => {
    // Clean up resources
    await hypercoreCctpWithdrawFixture.deleteAll();
    await dataSource.destroy();
    await redis.quit();
  });

  it("should return 200", async () => {
    const withdrawals = await hypercoreCctpWithdrawFixture.insert([]);
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
