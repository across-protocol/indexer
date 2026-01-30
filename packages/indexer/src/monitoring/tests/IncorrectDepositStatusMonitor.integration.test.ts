import { expect } from "chai";
import sinon from "sinon";
import { Logger } from "winston";
import { DataSource, entities, fixtures } from "@repo/indexer-database";
import { getTestDataSource } from "../../tests/setup";
import { IncorrectDepositStatusMonitor } from "../IncorrectDepositStatusMonitor";

describe("IncorrectDepositStatusMonitor", () => {
  let dataSource: DataSource;
  let monitor: IncorrectDepositStatusMonitor;
  let logger: Logger;
  let depositsFixture: fixtures.FundsDepositedFixture;
  let relayHashInfoFixture: fixtures.RelayHashInfoFixture;
  let loggerDebugSpy: sinon.SinonSpy;
  let loggerWarnSpy: sinon.SinonSpy;
  let loggerErrorSpy: sinon.SinonSpy;

  beforeEach(async () => {
    dataSource = await getTestDataSource();
    depositsFixture = new fixtures.FundsDepositedFixture(dataSource);
    relayHashInfoFixture = new fixtures.RelayHashInfoFixture(dataSource);

    loggerDebugSpy = sinon.spy();
    loggerWarnSpy = sinon.spy();
    loggerErrorSpy = sinon.spy();

    logger = {
      debug: loggerDebugSpy,
      info: sinon.spy(),
      warn: loggerWarnSpy,
      error: loggerErrorSpy,
    } as unknown as Logger;

    monitor = new IncorrectDepositStatusMonitor(logger, dataSource);
  });

  afterEach(async () => {
    sinon.restore();
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  describe("Baseline Cases", () => {
    it("should log debug when no problematic deposits found", async () => {
      await monitor.taskLogic();

      const logCall = loggerDebugSpy.lastCall.args[0];
      expect(logCall.deposits).to.be.an("array").that.is.empty;
    });

    it("should log debug when all deposits have correct status (filled/refunded)", async () => {
      // Create deposit with filled status
      const [deposit] = await depositsFixture.insertDeposits([
        {
          blockTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          fillDeadline: new Date(Date.now() - 120 * 60 * 1000), // 2 hours ago
        },
      ]);

      await relayHashInfoFixture.insertRelayHashInfos([
        {
          depositEventId: deposit!.id,
          depositId: deposit!.depositId,
          originChainId: deposit!.originChainId,
          destinationChainId: deposit!.destinationChainId,
          fillDeadline: deposit!.fillDeadline,
          status: entities.RelayStatus.Filled,
        },
      ]);

      await monitor.taskLogic();

      const logCall = loggerDebugSpy.lastCall.args[0];
      expect(logCall.deposits).to.be.an("array").that.is.empty;
    });

    it("should NOT detect deposits with inputAmount = 0", async () => {
      const [deposit] = await depositsFixture.insertDeposits([
        {
          blockTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          fillDeadline: new Date(Date.now() - 120 * 60 * 1000), // 2 hours ago
          inputAmount: "0",
        },
      ]);

      await relayHashInfoFixture.insertRelayHashInfos([
        {
          depositEventId: deposit!.id,
          depositId: deposit!.depositId,
          originChainId: deposit!.originChainId,
          destinationChainId: deposit!.destinationChainId,
          fillDeadline: deposit!.fillDeadline,
          status: entities.RelayStatus.Expired,
        },
      ]);

      await monitor.taskLogic();

      const logCall = loggerDebugSpy.lastCall.args[0];
      expect(logCall.deposits).to.be.an("array").that.is.empty;
    });
  });

  describe("Status Detection Cases", () => {
    it("should detect expired deposits past 90-minute deadline", async () => {
      const [deposit] = await depositsFixture.insertDeposits([
        {
          blockTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          fillDeadline: new Date(Date.now() - 120 * 60 * 1000), // 2 hours ago
        },
      ]);

      await relayHashInfoFixture.insertRelayHashInfos([
        {
          depositEventId: deposit!.id,
          depositId: deposit!.depositId,
          originChainId: deposit!.originChainId,
          destinationChainId: deposit!.destinationChainId,
          fillDeadline: deposit!.fillDeadline,
          status: entities.RelayStatus.Expired,
        },
      ]);

      await monitor.taskLogic();
      const logCall = loggerWarnSpy.lastCall.args[0];
      expect(logCall.deposits).to.have.lengthOf(1);
      expect(logCall.deposits[0].deposit.status).to.equal("expired");
    });

    it("should detect unfilled deposits past 90-minute deadline", async () => {
      const [deposit] = await depositsFixture.insertDeposits([
        {
          blockTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          fillDeadline: new Date(Date.now() - 95 * 60 * 1000), // 95 minutes ago
        },
      ]);

      await relayHashInfoFixture.insertRelayHashInfos([
        {
          depositEventId: deposit!.id,
          depositId: deposit!.depositId,
          originChainId: deposit!.originChainId,
          destinationChainId: deposit!.destinationChainId,
          fillDeadline: deposit!.fillDeadline,
          status: entities.RelayStatus.Unfilled,
        },
      ]);

      await monitor.taskLogic();

      const logCall = loggerWarnSpy.lastCall.args[0];
      expect(logCall.deposits).to.have.lengthOf(1);
      expect(logCall.deposits[0].deposit.status).to.equal("unfilled");
    });

    it("should detect slowFillRequested deposits past 90-minute deadline", async () => {
      const [deposit] = await depositsFixture.insertDeposits([
        {
          blockTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          fillDeadline: new Date(Date.now() - 100 * 60 * 1000), // 100 minutes ago
        },
      ]);

      await relayHashInfoFixture.insertRelayHashInfos([
        {
          depositEventId: deposit!.id,
          depositId: deposit!.depositId,
          originChainId: deposit!.originChainId,
          destinationChainId: deposit!.destinationChainId,
          fillDeadline: deposit!.fillDeadline,
          status: entities.RelayStatus.SlowFillRequested,
        },
      ]);

      await monitor.taskLogic();

      const logCall = loggerWarnSpy.lastCall.args[0];
      expect(logCall.deposits).to.have.lengthOf(1);
      expect(logCall.deposits[0].deposit.status).to.equal("slowFillRequested");
    });

    it("should detect multiple deposits with mixed statuses", async () => {
      const deposits = await depositsFixture.insertDeposits([
        {
          blockTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          fillDeadline: new Date(Date.now() - 120 * 60 * 1000),
        },
        {
          blockTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          fillDeadline: new Date(Date.now() - 110 * 60 * 1000),
        },
        {
          blockTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          fillDeadline: new Date(Date.now() - 100 * 60 * 1000),
        },
      ]);

      await relayHashInfoFixture.insertRelayHashInfos([
        {
          depositEventId: deposits[0]!.id,
          depositId: deposits[0]!.depositId,
          originChainId: deposits[0]!.originChainId,
          destinationChainId: deposits[0]!.destinationChainId,
          fillDeadline: deposits[0]!.fillDeadline,
          status: entities.RelayStatus.Expired,
        },
        {
          depositEventId: deposits[1]!.id,
          depositId: deposits[1]!.depositId,
          originChainId: deposits[1]!.originChainId,
          destinationChainId: deposits[1]!.destinationChainId,
          fillDeadline: deposits[1]!.fillDeadline,
          status: entities.RelayStatus.Unfilled,
        },
        {
          depositEventId: deposits[2]!.id,
          depositId: deposits[2]!.depositId,
          originChainId: deposits[2]!.originChainId,
          destinationChainId: deposits[2]!.destinationChainId,
          fillDeadline: deposits[2]!.fillDeadline,
          status: entities.RelayStatus.SlowFillRequested,
        },
      ]);

      await monitor.taskLogic();

      const logCall = loggerWarnSpy.lastCall.args[0];
      expect(logCall.deposits).to.have.lengthOf(3);
    });
  });

  describe("Time Window Filtering", () => {
    it("should NOT detect deposits within 90-minute threshold", async () => {
      const [deposit] = await depositsFixture.insertDeposits([
        {
          blockTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          fillDeadline: new Date(Date.now() - 80 * 60 * 1000), // 80 minutes ago (< 90)
        },
      ]);

      await relayHashInfoFixture.insertRelayHashInfos([
        {
          depositEventId: deposit!.id,
          depositId: deposit!.depositId,
          originChainId: deposit!.originChainId,
          destinationChainId: deposit!.destinationChainId,
          fillDeadline: deposit!.fillDeadline,
          status: entities.RelayStatus.Unfilled,
        },
      ]);

      await monitor.taskLogic();

      const logCall = loggerDebugSpy.lastCall.args[0];
      expect(logCall.deposits).to.be.an("array").that.is.empty;
    });
  });

  describe("Data Integrity", () => {
    it("should correctly join with V3FundsDeposited and populate all required fields", async () => {
      const [deposit] = await depositsFixture.insertDeposits([
        {
          blockTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          fillDeadline: new Date(Date.now() - 120 * 60 * 1000), // 2 hours ago
        },
      ]);
      await relayHashInfoFixture.insertRelayHashInfos([
        {
          depositEventId: deposit!.id,
          depositId: deposit!.depositId,
          originChainId: deposit!.originChainId,
          destinationChainId: deposit!.destinationChainId,
          fillDeadline: deposit!.fillDeadline,
          status: entities.RelayStatus.Expired,
          internalHash: deposit!.internalHash,
        },
      ]);

      await monitor.taskLogic();

      const logCall = loggerWarnSpy.lastCall.args[0];
      expect(logCall.deposits).to.have.lengthOf(1);

      const loggedDeposit = logCall.deposits[0];
      // Verify all fields from the join
      expect(loggedDeposit.deposit.depositId).to.equal(
        deposit!.depositId.toString(),
      );
      expect(loggedDeposit.deposit.originChainId).to.equal(
        deposit!.originChainId,
      );
      expect(loggedDeposit.deposit.destinationChainId).to.equal(
        deposit!.destinationChainId,
      );
      expect(loggedDeposit.deposit.status).to.equal(
        entities.RelayStatus.Expired,
      );
      expect(loggedDeposit.deposit.internalHash).to.equal(
        deposit!.internalHash,
      );
      expect(loggedDeposit.deposit.depositTxHash).to.equal(
        deposit!.transactionHash,
      );
      expect(loggedDeposit.deposit.fillDeadline).to.equal(
        deposit!.fillDeadline.toISOString(),
      );

      // Verify minutesPastDeadline is calculated
      expect(loggedDeposit.minutesPastDeadline).to.be.greaterThan(90);

      // Verify task duration
      expect(logCall.task.duration).to.be.a("number");
    });
  });
});
