import { Logger } from "winston";

/**
 * Enum to simplify selecting which view to refresh from consumer code.
 * Values correspond directly to the PostgreSQL Materialized View names.
 */
export enum DepositViewType {
  ACROSS = "mv_across_deposits",
  CCTP = "mv_cctp_deposits",
  OFT = "mv_oft_deposits",
  ALL = "all",
}

/**
 * Interface representing any database connection object capable of executing raw SQL queries.
 * This matches TypeORM's DataSource, EntityManager, and QueryRunner.
 */
export interface QueryExecutor {
  query(query: string, parameters?: any[]): Promise<any>;
}

/**
 * Input parameters for refreshing a specific materialized view.
 * @template T - The type of the database connection (DataSource, EntityManager, etc.)
 */
export interface RefreshViewOptions<T extends QueryExecutor> {
  /** The database connection object (DataSource, EntityManager, QueryRunner). */
  db: T;
  /** The specific name of the materialized view to refresh (e.g., "mv_across_deposits"). */
  viewName: string;
  /** Optional logger instance. If provided, start/end/error logs will be output. */
  logger?: Logger;
}

/**
 * Core utility to execute a concurrent refresh of a PostgreSQL Materialized View.
 * * Uses `REFRESH MATERIALIZED VIEW CONCURRENTLY` to ensure the view remains readable
 * by the application while the update is being processed.
 * * @template T - The type of the database executor.
 * @param options - The configuration object containing the DB connection, view name, and logger.
 */
const refreshMaterializedView = async <T extends QueryExecutor>({
  db,
  viewName,
  logger,
}: RefreshViewOptions<T>): Promise<void> => {
  const start = Date.now();

  try {
    // CONCURRENTLY is vital for zero-downtime updates in production
    await db.query(
      `REFRESH MATERIALIZED VIEW CONCURRENTLY "evm"."${viewName}"`,
    );

    const duration = Date.now() - start;
    if (logger) {
      logger.info(`Refreshed view '${viewName}' in ${duration}ms`);
    }
  } catch (error) {
    if (logger) {
      logger.error(`Failed to refresh view '${viewName}'`, error);
    }
  }
};

/**
 * Main dispatcher to refresh a view based on the enum type provided.
 * Contains the mapping logic between Enum types and database view names.
 * @param db - The database connection.
 * @param type - The DepositViewType enum value.
 * @param logger - Optional logger.
 */
export const refreshViewByType = async <T extends QueryExecutor>(
  db: T,
  type: DepositViewType,
  logger?: Logger,
): Promise<void> => {
  // Handle ALL case (Parallel refresh)
  if (type === DepositViewType.ALL) {
    if (logger) {
      logger.info("Starting full view refresh...");
    }

    await Promise.all([
      refreshMaterializedView({
        db,
        viewName: DepositViewType.ACROSS,
        logger,
      }),
      refreshMaterializedView({
        db,
        viewName: DepositViewType.CCTP,
        logger,
      }),
      refreshMaterializedView({
        db,
        viewName: DepositViewType.OFT,
        logger,
      }),
    ]);

    if (logger) {
      logger.info("Full view refresh complete.");
    }
    return;
  }

  // Since the Enum values match the DB view names, we can use 'type' directly as 'viewName'
  await refreshMaterializedView({ db, viewName: type, logger });
};
