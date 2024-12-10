import { DataSource, EntityTarget, ObjectLiteral } from "typeorm";
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
  ): Promise<SaveQueryResult<Entity>[]> {
    return Promise.all(
      data.map((dataItem) =>
        this.saveAndHandleFinalisation(
          entity,
          dataItem,
          uniqueKeys,
          comparisonKeys,
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
  ): Promise<SaveQueryResult<Entity>> {
    const where = uniqueKeys.reduce(
      (acc, key) => {
        acc[key] = data[key];
        return acc;
      },
      {} as Record<keyof Entity, any>,
    );
    const dbEntity = await this.postgres
      .getRepository(entity)
      .findOne({ where });
    const repository = this.postgres.getRepository(entity);

    if (!dbEntity) {
      this.logger.debug({
        at: "BlockchainEventRepository#saveAndHandleFinalisation",
        message: `Found entity ${entity} where ${JSON.stringify(where)}`,
        dbEntity,
        data,
        where,
      });
      await repository.insert(data);
      this.logger.debug({
        at: "BlockchainEventRepository#saveAndHandleFinalisation",
        message: `Inserted entity ${entity} where ${JSON.stringify(where)}`,
        dbEntity,
        data,
        where,
      });
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
}
