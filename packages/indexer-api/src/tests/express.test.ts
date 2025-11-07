import { expect } from "chai";
import request from "supertest";
import { ExpressApp } from "../express-app";
import express from "express";
import { DataSource, fixtures } from "@repo/indexer-database";
import { getTestDataSource } from "./setup";
import Redis from "ioredis";
import * as Indexer from "@repo/indexer";
import * as routers from "../routers";

describe("Express App Tests with Deposits Endpoint", () => {
  let app: express.Express;
  let dataSource: DataSource;
  let redis: Redis;
  let depositsFixture: fixtures.FundsDepositedFixture;

  beforeEach(async () => {
    dataSource = await getTestDataSource();

    const redisConfig = Indexer.parseRedisConfig(process.env);
    redis = new Redis(redisConfig);

    // Initialize fixtures
    depositsFixture = new fixtures.FundsDepositedFixture(dataSource);
    await depositsFixture.deleteAllDeposits();

    // Initialize the Express app with the deposits router
    const depositsRouter = routers.deposits.getRouter(dataSource, redis);
    app = ExpressApp({ deposits: depositsRouter });
  });

  afterEach(async () => {
    // Clean up resources
    await dataSource.destroy();
    await redis.quit();
  });

  it("should return 200 and a success message for the /deposits route", async () => {
    // Insert a test deposit
    await depositsFixture.insertDeposits([{ depositor: "0x456" }]);

    const response = await request(app).get("/deposits");
    expect(response.status).to.equal(200);
    expect(response.body).to.be.an("array").that.is.not.empty;
  });

  it("should return 404 for an unknown route", async () => {
    const response = await request(app).get("/unknown");
    expect(response.status).to.equal(404);
    expect(response.body).to.have.property("message", "Route does not exist.");
  });

  it("should handle JSON body parsing errors", async () => {
    const response = await request(app)
      .post("/deposits")
      .set("Content-Type", "application/json")
      .send("invalid-json");
    expect(response.status).to.equal(400);
    expect(response.body).to.have.property("message");
  });

  it("should return an error for a non-existent deposit", async () => {
    const response = await request(app).get(
      `/deposits?depositId=999&originChainId=999`,
    );
    expect(response.status).to.equal(400);
  });

  it("should return an error for bad input parameters when requesting deposits", async () => {
    const response = await request(app).get(
      "/deposits?depositId=abc&originChainId=xyz",
    );
    expect(response.status).to.equal(400);
  });
});
