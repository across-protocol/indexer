import { newDb, IMemoryDb } from "pg-mem";
import { DataSource } from "typeorm";
import { createDataSource as createRealDataSource } from "@repo/indexer-database";

let db: IMemoryDb;
let dataSource: DataSource;

export async function getTestDataSource(): Promise<DataSource> {
  if (dataSource) {
    return dataSource;
  }

  db = newDb();
  db.createSchema("evm");

  db.public.registerFunction({ name: "version", implementation: () => "test" });
  db.public.registerFunction({
    name: "current_database",
    implementation: () => "test",
  });

  const realDataSource = createRealDataSource({
    host: "dummy",
    port: "dummy",
    user: "dummy",
    password: "dummy",
    dbName: "dummy",
  });

  const options = realDataSource.options;

  dataSource = await db.adapters.createTypeormDataSource({
    ...options,
    type: "postgres",
    synchronize: true,
    logging: false,
  });

  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  return dataSource;
}
