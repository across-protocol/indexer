import { expect } from "chai";
import { DataSource } from "typeorm";
import fs from "fs";
import path from "path";

import { getTestDataSource } from "./setup";
import { entities } from "../../../indexer-database/dist/src";

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

  it("should create a data source", () => {
    expect(dataSource).to.be.an.instanceOf(DataSource);
    expect(dataSource.isInitialized).to.be.true;
  });

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
