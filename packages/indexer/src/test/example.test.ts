import { expect } from "chai";
import { parsePostgresConfig } from "../parseEnv";
import { createDataSource, entities, fixtures } from "@repo/indexer-database";

// this is in here because mocha crashes if no tests are found
describe("example", () => {
  it("should return true", async () => {
    console.log("this is running");
    console.log("this is running with a change in the test file");
    expect(true).to.be.true;
  });

  it("should create an entry in the database", async () => {
    console.log(process.env);
    const databaseConfig = parsePostgresConfig(process.env);
    const dataSource = await createDataSource(databaseConfig).initialize();
    const repository = dataSource.getRepository(entities.V3FundsDeposited);
    const fixture = new fixtures.FundsDepositedFixture(dataSource);
    const mockedDeposit = fixture.mockFundsDeposited({});
    await fixture.insertDeposits([mockedDeposit]);
    const depositRows = await repository.find();
    console.log(depositRows);
    expect(depositRows.length).to.be.equal(1);
  });
});
