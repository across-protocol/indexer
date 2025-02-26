import { expect } from "chai";
import { parsePostgresConfig } from "../parseEnv";
import {
  createDataSource,
  Repository,
  entities,
  fixtures,
} from "@repo/indexer-database";

describe("example", () => {
  let repository: Repository<entities.V3FundsDeposited>;
  let depositsFixture: fixtures.FundsDepositedFixture;

  before(async () => {
    const databaseConfig = parsePostgresConfig(process.env);
    const dataSource = await createDataSource(databaseConfig).initialize();
    repository = dataSource.getRepository(entities.V3FundsDeposited);
    depositsFixture = new fixtures.FundsDepositedFixture(dataSource);
  });

  after(async () => {
    await depositsFixture.deleteAllDeposits();
  });

  it("should return true", async () => {
    expect(true).to.be.true;
  });

  // Example test showing database interaction
  it("should create an entry in the database", async () => {
    await depositsFixture.insertDeposits([]);
    const depositRows = await repository.find();
    expect(depositRows.length).to.be.equal(1);
  });
});
