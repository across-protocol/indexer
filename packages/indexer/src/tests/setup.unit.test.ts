import { expect } from "chai";
import { DataSource } from "typeorm";

import { entities } from "@repo/indexer-database";

import { getTestDataSource } from "./setup";

/**
 * Test suite for the test database setup.
 *
 * This suite verifies that the `getTestDataSource` function correctly sets up an
 * in-memory database for testing. It checks for the successful creation of the
 * data source, the presence of expected tables, and the ability to perform basic
 * CRUD (Create, Read, Update, Delete) operations.
 */
describe("Test Database Setup", () => {
  let dataSource: DataSource;

  before(async () => {
    dataSource = await getTestDataSource();
  });

  after(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  /**
   * Verifies that the `getTestDataSource` function returns a valid and initialized DataSource instance.
   */
  it("should create a data source", () => {
    expect(dataSource).to.be.an.instanceOf(DataSource);
    expect(dataSource.isInitialized).to.be.true;
  });

  /**
   * Checks if the database schema is created correctly by looking for the existence of key tables.
   */
  it("should have all tables created", async () => {
    const tables = await dataSource.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema IN ('public', 'evm')
    `);
    const tableNames = tables.map((t: any) => t.table_name);

    // Check for a few important tables
    expect(tableNames).to.include("indexer_progress_info");
    expect(tableNames).to.include("bundle");
    expect(tableNames).to.include("tokens_bridged");
  });

  /**
   * Tests the basic functionality of the database by performing insert, update, and delete operations
   * on the `IndexerProgressInfo` entity.
   */
  it("should allow basic insert and delete operations", async () => {
    const repository = dataSource.getRepository(entities.IndexerProgressInfo);
    const id = "test-indexer-progress";
    const lastFinalisedBlock = 100;
    const latestBlockNumber = 120;
    const isBackfilling = false;

    // Insert
    await repository.save({
      id,
      lastFinalisedBlock,
      latestBlockNumber,
      isBackfilling,
    });

    let savedEntry = await repository.findOneBy({ id });
    expect(savedEntry).to.exist;
    expect(savedEntry?.lastFinalisedBlock).to.equal(lastFinalisedBlock);

    // Update
    const newLatestBlockNumber = 150;
    await repository.update(
      { id },
      { latestBlockNumber: newLatestBlockNumber },
    );
    savedEntry = await repository.findOneBy({ id });
    expect(savedEntry?.latestBlockNumber).to.equal(newLatestBlockNumber);

    // Delete
    await repository.delete({ id });
    savedEntry = await repository.findOneBy({ id });
    expect(savedEntry).to.not.exist;
  });
});
