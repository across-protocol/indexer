import { expect } from "chai";
import type { Message } from "@google-cloud/pubsub";
import winston from "winston";

import {
  GaslessDepositDlqConsumer,
  GaslessDepositPubSubConsumer,
} from "./gaslessDepositConsumer";
import type { Config } from "../parseEnv";
import { getTestDataSource } from "../tests/setup";
import { entities } from "@repo/indexer-database";
import type { DataSource } from "typeorm";

/** Valid payload (BridgeWitness style) with baseDepositData.destinationChainId */
const validPayload = {
  swapTx: {
    chainId: 1,
    data: {
      depositId: "12345",
      witness: [
        {
          data: {
            baseDepositData: { destinationChainId: 10 },
          },
        },
      ],
    },
  },
};

function createFakeMessage(payload: unknown): Message {
  return {
    id: "test-msg-1",
    data: Buffer.from(JSON.stringify(payload), "utf8"),
    ack: () => {},
    nack: () => {},
  } as Message;
}

describe("GaslessDepositPubSubConsumer", () => {
  let dataSource: DataSource;
  let consumer: GaslessDepositPubSubConsumer;
  const logger = winston.createLogger({ level: "warn", transports: [] });

  before(async () => {
    dataSource = await getTestDataSource();
    consumer = new GaslessDepositPubSubConsumer(
      {} as Config,
      logger,
      dataSource,
    );
  });

  after(async () => {
    const repo = dataSource.getRepository(entities.GaslessDeposit);
    await repo.clear();
  });

  it("saves extracted fields to gasless_deposit table when message is valid", async () => {
    const message = createFakeMessage(validPayload);
    let ackCalled = false;
    message.ack = () => {
      ackCalled = true;
    };

    await (
      consumer as unknown as { handleMessage(m: Message): Promise<void> }
    ).handleMessage(message);

    expect(ackCalled).to.be.true;

    const repo = dataSource.getRepository(entities.GaslessDeposit);
    const rows = await repo.find();
    expect(rows).to.have.length(1);
    const row = rows[0]!;
    expect(row.originChainId).to.equal("1");
    expect(row.destinationChainId).to.equal("10");
    expect(row.depositId).to.equal("12345");
  });

  it("does not insert duplicate when same message is processed twice", async () => {
    const repo = dataSource.getRepository(entities.GaslessDeposit);
    await repo.clear();

    const message = createFakeMessage(validPayload);
    const consumerWithHandle = consumer as unknown as {
      handleMessage(m: Message): Promise<void>;
    };

    await consumerWithHandle.handleMessage(message);
    await consumerWithHandle.handleMessage(message);

    const rows = await repo.find();
    expect(rows).to.have.length(1);
  });
});

describe("GaslessDepositDlqConsumer", () => {
  let dataSource: DataSource;
  let consumer: GaslessDepositDlqConsumer;
  const logger = winston.createLogger({ level: "warn", transports: [] });

  before(async () => {
    dataSource = await getTestDataSource();
    consumer = new GaslessDepositDlqConsumer({} as Config, logger, dataSource);
  });

  after(async () => {
    const repo = dataSource.getRepository(entities.GaslessDeposit);
    await repo.clear();
  });

  it("updates existing gasless_deposit row to set deletedAt when message is valid", async () => {
    const repo = dataSource.getRepository(entities.GaslessDeposit);
    await repo.clear();

    const mainConsumer = new GaslessDepositPubSubConsumer(
      {} as Config,
      logger,
      dataSource,
    );
    await (
      mainConsumer as unknown as { handleMessage(m: Message): Promise<void> }
    ).handleMessage(createFakeMessage(validPayload));

    const rowsAfterMain = await repo.find();
    expect(rowsAfterMain).to.have.length(1);
    expect(rowsAfterMain[0]!.deletedAt).to.be.null;

    const dlqMessage = createFakeMessage(validPayload);
    let ackCalled = false;
    dlqMessage.ack = () => {
      ackCalled = true;
    };
    await (
      consumer as unknown as { handleMessage(m: Message): Promise<void> }
    ).handleMessage(dlqMessage);

    expect(ackCalled).to.be.true;
    const rowsAfterDlq = await repo.find();
    expect(rowsAfterDlq).to.have.length(1);
    expect(rowsAfterDlq[0]!.deletedAt).to.not.be.null;
  });

  it("inserts gasless_deposit row with deletedAt set when no row exists (upsert)", async () => {
    const repo = dataSource.getRepository(entities.GaslessDeposit);
    await repo.clear();

    const dlqMessage = createFakeMessage(validPayload);
    let ackCalled = false;
    dlqMessage.ack = () => {
      ackCalled = true;
    };
    await (
      consumer as unknown as { handleMessage(m: Message): Promise<void> }
    ).handleMessage(dlqMessage);

    expect(ackCalled).to.be.true;
    const rows = await repo.find();
    expect(rows).to.have.length(1);
    expect(rows[0]!.originChainId).to.equal("1");
    expect(rows[0]!.destinationChainId).to.equal("10");
    expect(rows[0]!.depositId).to.equal("12345");
    expect(rows[0]!.deletedAt).to.not.be.null;
  });
});
