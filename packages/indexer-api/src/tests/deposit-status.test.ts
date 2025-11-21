import { expect } from "chai";
import request from "supertest";
import express from "express";
import Redis from "ioredis";

import { DataSource, entities, fixtures } from "@repo/indexer-database";

import { ExpressApp } from "../express-app";
import * as routers from "../routers";
import { getTestDataSource, getTestRedisInstance } from "./setup";
import { DepositStatusParams } from "../dtos/deposits.dto";

describe.only("/deposit/status", () => {
  let app: express.Express;
  let dataSource: DataSource;
  let redisClient: Redis;
  let relayHashInfoFixture: fixtures.RelayHashInfoFixture;
  let messageSentFixture: fixtures.MessageSentFixture;
  let messageReceivedFixture: fixtures.MessageReceivedFixture;
  let oftSentFixture: fixtures.OftSentFixture;
  let oftReceivedFixture: fixtures.OftReceivedFixture;

  beforeEach(async () => {
    // Set up database and Redis
    dataSource = await getTestDataSource();
    redisClient = getTestRedisInstance();

    // Initialize the Express app with the deposits router
    const depositsRouter = routers.deposits.getRouter(dataSource, redisClient);

    // Fixture classes
    relayHashInfoFixture = new fixtures.RelayHashInfoFixture(dataSource);
    messageSentFixture = new fixtures.MessageSentFixture(dataSource);
    messageReceivedFixture = new fixtures.MessageReceivedFixture(dataSource);
    oftSentFixture = new fixtures.OftSentFixture(dataSource);
    oftReceivedFixture = new fixtures.OftReceivedFixture(dataSource);
    app = ExpressApp({ deposits: depositsRouter });
  });

  afterEach(async () => {
    await dataSource.destroy();
    await redisClient.quit();
  });

  it("should return 404", async () => {
    const queryParams: DepositStatusParams = {
      depositTxnRef: "dummy-txn-ref",
      index: 0,
    };
    const response = await request(app)
      .get("/deposit/status")
      .query(queryParams);
    expect(response.status).to.equal(404);
  });

  it("?depositTxnRef across intents deposit ", async () => {
    const [deposit] = await relayHashInfoFixture.insertRelayHashInfos([
      { status: entities.RelayStatus.Filled },
    ]);
    const queryParams: DepositStatusParams = {
      depositTxnRef: deposit.depositTxHash as string,
      index: 0,
    };
    const response = await request(app)
      .get("/deposit/status")
      .query(queryParams);
    expect(response.status).to.equal(200);
    expect(response.body.status).to.equal("filled");
    expect(response.body.depositTxHash).to.equal(deposit.depositTxHash);
  });

  it("?depositTxnRef cctp mint burn deposit ", async () => {
    const [messageSentEvent] = await messageSentFixture.insertMessageSentEvents(
      [
        {
          transactionHash: "dummy-txn-ref",
          nonce: "dummy-nonce",
          sourceDomain: 1,
        },
      ],
    );
    const [messageReceivedEvent] =
      await messageReceivedFixture.insertMessageReceivedEvents([
        {
          transactionHash: "dummy-txn-ref",
          nonce: "dummy-nonce",
          sourceDomain: 1,
        },
      ]);
    const queryParams: DepositStatusParams = {
      depositTxnRef: messageSentEvent!.transactionHash,
      index: 0,
    };
    const response = await request(app)
      .get("/deposit/status")
      .query(queryParams);
    expect(response.status).to.equal(200);
    expect(response.body.status).to.equal("filled");
    expect(response.body.depositTxHash).to.equal(
      messageSentEvent!.transactionHash,
    );
  });

  it("?depositTxnRef oft mint burn deposit with multiple messages", async () => {
    const oftSentEvents = await oftSentFixture.insertOftSentEvents([
      { transactionHash: "dummy-txn-ref", guid: "dummy-guid" },
    ]);
    const oftReceivedEvents = await oftReceivedFixture.insertOftReceivedEvents([
      { transactionHash: "dummy-txn-ref", guid: "dummy-guid" },
    ]);
    const queryParams: DepositStatusParams = {
      depositTxnRef: oftSentEvents[0]!.transactionHash,
      index: 0,
    };
    const response = await request(app)
      .get("/deposit/status")
      .query(queryParams);
    expect(response.status).to.equal(200);
    expect(response.body.status).to.equal("filled");
    expect(response.body.depositTxHash).to.equal(
      oftSentEvents[0]!.transactionHash,
    );
  });

  it("?depositTxnRef multiple deposits in the same transaction", async () => {
    const txnRef = "dummy-txn-ref";
    const [deposit] = await relayHashInfoFixture.insertRelayHashInfos([
      { status: entities.RelayStatus.Filled, depositTxHash: txnRef },
    ]);
    await messageSentFixture.insertMessageSentEvents([
      { transactionHash: txnRef, nonce: "dummy-nonce", sourceDomain: 1 },
    ]);
    await messageReceivedFixture.insertMessageReceivedEvents([
      { transactionHash: txnRef, nonce: "dummy-nonce", sourceDomain: 1 },
    ]);
    await oftSentFixture.insertOftSentEvents([
      { transactionHash: txnRef, guid: "dummy-guid" },
    ]);
    await oftReceivedFixture.insertOftReceivedEvents([
      { transactionHash: txnRef, guid: "dummy-guid" },
    ]);
    const queryParams: DepositStatusParams = {
      depositTxnRef: deposit!.depositTxHash!,
      index: 0,
    };
    const response = await request(app)
      .get("/deposit/status")
      .query(queryParams);
    expect(response.status).to.equal(200);
    expect(response.body.status).to.equal("filled");
    expect(response.body.depositTxHash).to.equal(deposit.depositTxHash);
    expect(response.body.pagination.maxIndex).to.equal(2);
  });
});
