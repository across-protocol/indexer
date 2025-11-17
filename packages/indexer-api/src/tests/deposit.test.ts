import { expect } from "chai";
import request from "supertest";
import { ExpressApp } from "../express-app";
import express from "express";
import { DataSource, entities, fixtures } from "@repo/indexer-database";
import Redis from "ioredis";
import { getTestDataSource, getTestRedisInstance } from "./setup";
import * as routers from "../routers";

describe("/deposit", () => {
  let app: express.Express;
  let dataSource: DataSource;
  let redisClient: Redis;
  let depositsFixture: fixtures.FundsDepositedFixture;
  let relayHashInfoFixture: fixtures.RelayHashInfoFixture;

  beforeEach(async () => {
    dataSource = await getTestDataSource();
    redisClient = getTestRedisInstance();

    // Initialize fixtures
    depositsFixture = new fixtures.FundsDepositedFixture(dataSource);
    relayHashInfoFixture = new fixtures.RelayHashInfoFixture(dataSource);
    await depositsFixture.deleteAllDeposits();
    await relayHashInfoFixture.deleteAllRelayHashInfoRows();

    // Initialize the Express app with the deposits router
    const depositsRouter = routers.deposits.getRouter(dataSource, redisClient);
    app = ExpressApp({ deposits: depositsRouter });
  });

  afterEach(async () => {
    // Clean up resources
    await dataSource.destroy();
    await redisClient.quit();
  });

  it("should return 200 and one deposit by depositId and originChainId", async () => {
    // Insert a test deposit
    const [deposit] = await depositsFixture.insertDeposits([]);
    const relayHashInfoData = {
      id: 1,
      depositId: deposit.depositId,
      originChainId: deposit.originChainId,
      depositEventId: deposit.id,
      status: entities.RelayStatus.Unfilled,
    };
    await relayHashInfoFixture.insertRelayHashInfos([relayHashInfoData]);
    const response = await request(app).get("/deposit").query({
      depositId: deposit.depositId,
      originChainId: deposit.originChainId,
    });
    console.log(response.body);
    expect(response.status).to.equal(200);
    expect(response.body.deposit.id).to.equal(deposit.id);
  });
});
