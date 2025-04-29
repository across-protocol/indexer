import {
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
} from "typeorm";
import winston from "winston";

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
  protected async saveAndHandleFinalisationBatch<Entity extends ObjectLiteral>(
    entity: EntityTarget<Entity>,
    data: Partial<Entity>[],
    uniqueKeys: (keyof Entity)[],
    comparisonKeys: (keyof Entity)[],
    transactionalEntityManager?: EntityManager,
  ): Promise<SaveQueryResult<Entity>[]> {
    return Promise.all(
      data.map((dataItem) =>
        this.saveAndHandleFinalisation(
          entity,
          dataItem,
          uniqueKeys,
          comparisonKeys,
          transactionalEntityManager,
        ),
      ),
    );
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
    transactionalEntityManager?: EntityManager,
  ): Promise<SaveQueryResult<Entity>> {
    const where = uniqueKeys.reduce(
      (acc, key) => {
        acc[key] = data[key];
        return acc;
      },
      {} as Record<keyof Entity, any>,
    );
    // If a transactional entity manager is provided, use it to execute the query.
    const repository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(entity)
      : this.postgres.getRepository(entity);
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
      await repository.update(where, data);
      return {
        data: (await repository.findOne({ where })) as Entity,
        result: SaveQueryResultType.Finalised,
      };
    }

    return {
      data: undefined,
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
    transactionalEntityManager?: EntityManager,
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

    const repository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(entity)
      : this.postgres.getRepository(entity);
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
