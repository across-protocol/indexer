import { expect } from "chai";
import request from "supertest";
import { ExpressApp } from "../express-app";
import express from "express";
import {
  createDataSource,
  DataSource,
  entities,
  fixtures,
} from "@repo/indexer-database";
import Redis from "ioredis";
import * as Indexer from "@repo/indexer";
import * as utils from "../utils";
import * as routers from "../routers";

describe("/deposit", () => {
  let app: express.Express;
  let dataSource: DataSource;
  let redis: Redis;
  let depositsFixture: fixtures.FundsDepositedFixture;
  let relayHashInfoFixture: fixtures.RelayHashInfoFixture;

  before(async () => {
    // Set up database and Redis
    const databaseConfig = utils.getPostgresConfig(process.env);
    dataSource = await createDataSource(databaseConfig).initialize();

    const redisConfig = Indexer.parseRedisConfig(process.env);
    redis = new Redis(redisConfig);

    // Initialize fixtures
    depositsFixture = new fixtures.FundsDepositedFixture(dataSource);
    relayHashInfoFixture = new fixtures.RelayHashInfoFixture(dataSource);
    await depositsFixture.deleteAllDeposits();
    await relayHashInfoFixture.deleteAllRelayHashInfoRows();

    // Initialize the Express app with the deposits router
    const depositsRouter = routers.deposits.getRouter(dataSource, redis);
    app = ExpressApp({ deposits: depositsRouter });
  });

  after(async () => {
    // Clean up resources
    await depositsFixture.deleteAllDeposits();
    await dataSource.destroy();
    await redis.quit();
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
      depositId: deposit.id,
      originChainId: deposit.originChainId,
    });
    console.log(response.body);
    expect(response.status).to.equal(200);
    expect(response.body).to.be.an("array").that.is.not.empty;
  });
});
