import {
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
} from "typeorm";
import winston from "winston";
import { createHash } from "crypto";

import { SaveQueryResultType, SaveQueryResult } from "../model";

export function filterSaveQueryResults<Entity extends ObjectLiteral>(
  results: SaveQueryResult<Entity>[],
  type: SaveQueryResultType,
) {
  return results
    .filter((result) => result.result === type)
    .map((result) => result.data)
    .filter((data) => data !== undefined);
}

// Helper to convert a string (e.g. uniquess key) into a 64-bit integer for Postgres
function generateAdvisoryLockId(uniqueId: string): [number, number] {
  const hash = createHash("sha256").update(uniqueId).digest("hex");
  // Take first 8 bytes (16 hex chars) to create two 32-bit integers
  const part1 = parseInt(hash.substring(0, 8), 16);
  const part2 = parseInt(hash.substring(8, 16), 16);
  // Postgres pg_advisory_xact_lock accepts two 32-bit ints to form one 64-bit key
  return [part1, part2];
}

export class BlockchainEventRepository {
  constructor(
    protected postgres: DataSource,
    protected logger: winston.Logger,
  ) {}

  /**
   * Saves the entities to the database.
   * @param entity - The entity to save.
   * @param data - The data to save.
   * @param uniqueKeys
   * The unique keys to check for. It is recommended these keys to be indexed columns, so that the query is faster.
   * @param comparisonKeys - The keys to compare for changes.
   */
  public async saveAndHandleFinalisationBatch<Entity extends ObjectLiteral>(
    entity: EntityTarget<Entity>,
    data: Partial<Entity>[],
    uniqueKeys: (keyof Entity)[],
    comparisonKeys: (keyof Entity)[],
  ): Promise<SaveQueryResult<Entity>[]> {
    return this.postgres.transaction(async (manager) => {
      return Promise.all(
        data.map((dataItem) =>
          this.saveAndHandleFinalisation(
            entity,
            dataItem,
            uniqueKeys,
            comparisonKeys,
            manager,
          ),
        ),
      );
    });
  }

  /**
   * Saves the entity to the database.
   * @param entity - The entity to save.
   * @param data - The data to save.
   * @param uniqueKeys
   * The unique keys to check for. It is recommended these keys to be indexed columns, so that the query is faster.
   * @param comparisonKeys - The keys to compare for changes.
   */
  protected async saveAndHandleFinalisation<Entity extends ObjectLiteral>(
    entity: EntityTarget<Entity>,
    data: Partial<Entity>,
    uniqueKeys: (keyof Entity)[],
    comparisonKeys: (keyof Entity)[],
    transactionalManager: EntityManager,
  ): Promise<SaveQueryResult<Entity>> {
    const where = uniqueKeys.reduce(
      (acc, key) => {
        acc[key] = data[key];
        return acc;
      },
      {} as Record<keyof Entity, any>,
    );

    // Generate a unique string ID for this event
    // e.g., if uniqueKeys is ['transactionHash'], idString is "0x123..."
    const uniqueString = uniqueKeys.map((k) => data[k]).join("-");

    // ACQUIRE ADVISORY LOCK (Virtual Mutex)
    // We generate a deterministic 64-bit hash from the unique keys of the event.
    // `pg_advisory_xact_lock` acquires an exclusive lock on this specific number number
    // for the duration of the transaction.
    //
    // How this solves Race Conditions:
    //
    // 1. Solves "Insert Race" (The Gap Problem):
    //    - In standard Postgres (Read Committed), locking a non-existent row does nothing.
    //    - By locking the *hash* of the ID instead of the row itself, we create a
    //      "Virtual Gap Lock."
    //    - If Process A and Process B both try to process the same new event, Process A
    //      gets the lock. Process B MUST wait at this line, even if the row doesn't exist yet.
    //
    // 2. Solves "Update Race":
    //    - Identical to `SELECT FOR UPDATE`, this ensures that once the row is created,
    //      only one process can read/modify it at a time.
    //
    // 3. Guarantees Atomicity:
    //    - Process B will only unfreeze after Process A commits. When Process B finally
    //      runs `findOne`, it is guaranteed to see the record inserted by Process A,
    //      preventing a "Duplicate Key" error.
    const [key1, key2] = generateAdvisoryLockId(uniqueString);

    await transactionalManager.query(`SELECT pg_advisory_xact_lock($1, $2)`, [
      key1,
      key2,
    ]);

    const repository = transactionalManager.getRepository(entity);
    // the Advisory Lock guarantees we are the only one working on this ID.
    const dbEntity = await repository.findOne({ where });

    if (!dbEntity) {
      await repository.insert(data);
      return {
        data: (await repository.findOne({ where })) as Entity,
        result: SaveQueryResultType.Inserted,
      };
    }

    // Check if any of the values of the comparison keys have changed
    const isChanged = comparisonKeys.some((key) => data[key] !== dbEntity[key]);
    // Check if the data moved in finalised state
    const isFinalisedChanged = data.finalised && !dbEntity.finalised;

    if (isChanged) {
      await repository.update(where, data);
      if (isFinalisedChanged) {
        return {
          data: (await repository.findOne({ where })) as Entity,
          result: SaveQueryResultType.UpdatedAndFinalised,
        };
      }
      return {
        data: (await repository.findOne({ where })) as Entity,
        result: SaveQueryResultType.Updated,
      };
    }

    if (isFinalisedChanged) {
      const updatedData = { finalised: data.finalised };
      await repository.update(where, updatedData);
      return {
        data: (await repository.findOne({ where })) as Entity,
        result: SaveQueryResultType.Finalised,
      };
    }

    return {
      data: dbEntity,
      result: SaveQueryResultType.Nothing,
    };
  }

  /**
   * @warning Migrating this implementation from soft delete to hard delete might have deeper implications. The raw events
   * should be deleted after their references are removed from the `relay_hash_info` table, otherwise DELETE queries will fail
   * because of foreign key constraints.
   */
  protected async deleteUnfinalisedEvents<Entity extends ObjectLiteral>(
    chainId: number,
    chainIdColumnIdentifier: string,
    lastFinalisedBlock: number,
    entity: EntityTarget<Entity>,
  ): Promise<Entity[]> {
    const entityMetadata = this.postgres.getMetadata(entity);
    const columns = entityMetadata.columns.map((column) => column.propertyName);
    const hasChainIdTargetColumn = columns.includes(chainIdColumnIdentifier);
    const hasDeletedAtColumn = columns.includes("deletedAt");

    if (
      entityMetadata.schema !== "evm" ||
      !hasChainIdTargetColumn ||
      !hasDeletedAtColumn
    ) {
      this.logger.error({
        at: "BlockchainEventRepository#deleteUnfinalisedEvents",
        message: `Cannot delete events of ${entityMetadata.name} entity`,
        schema: entityMetadata.schema,
        hasChainIdTargetColumn,
        hasDeletedAtColumn,
      });
      throw new Error(`Cannot delete events of ${entityMetadata.name} entity`);
    }

    const repository = this.postgres.getRepository(entity);
    const deletedRows = await repository
      .createQueryBuilder()
      .softDelete()
      .where(`${chainIdColumnIdentifier} = :chainId`, { chainId })
      .andWhere("blockNumber < :lastFinalisedBlock", { lastFinalisedBlock })
      .andWhere("finalised IS FALSE")
      .andWhere("deletedAt IS NULL")
      .returning("*")
      .execute();
    return deletedRows.raw;
  }
}
