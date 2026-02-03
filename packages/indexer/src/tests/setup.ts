import { DataType, newDb } from "pg-mem";
import { DataSource } from "typeorm";
import { createDataSource as createRealDataSource } from "@repo/indexer-database";

/**
 * Creates and initializes an in-memory TypeORM DataSource for testing.
 *
 * This function sets up an in-memory PostgreSQL database using `pg-mem`. It mimics the
 * structure of the real database by creating an 'evm' schema and registering dummy
 * functions that are expected by the application. It then uses the configuration
 * from the real data source to create a TypeORM `DataSource` that connects to this
 * in-memory database.
 *
 * The `synchronize: true` option ensures that the database schema is created based on
 * the entities, making it ready for use in tests without running migrations.
 *
 * @returns A promise that resolves to an initialized TypeORM `DataSource`.
 */
export async function getTestDataSource(): Promise<DataSource> {
  const db = newDb();
  db.createSchema("evm");

  db.public.registerFunction({ name: "version", implementation: () => "test" });
  db.public.registerFunction({
    name: "pg_advisory_xact_lock",
    args: [DataType.text, DataType.text], // or [DataType.int, DataType.int] depending on usage
    returns: DataType.null,
    implementation: () => null, // Do nothing
  });
  db.public.registerFunction({
    name: "current_database",
    implementation: () => "test",
  });
  // Override the system 'now' function directly in pg_catalog
  // This handles SQL like "WHERE date < NOW()"
  db.getSchema("pg_catalog").registerFunction({
    name: "now",
    implementation: () => new Date(),
    returns: DataType.timestamp, // Force return type to timestamp
    impure: true,
  });

  const realDataSource = createRealDataSource({
    host: "dummy",
    port: "dummy",
    user: "dummy",
    password: "dummy",
    dbName: "dummy",
  });

  const options = realDataSource.options;

  const dataSource = await db.adapters.createTypeormDataSource({
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
