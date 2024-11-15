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

export class BaseRepository {
  constructor(
    protected postgres: DataSource,
    protected logger: winston.Logger,
    private throwError: boolean = true,
  ) {}

  protected async insert<Entity extends ObjectLiteral>(
    entity: EntityTarget<Entity>,
    data: Partial<Entity>[],
    throwError?: boolean,
  ): Promise<Entity[]> {
    const repository = this.postgres.getRepository(entity);
    try {
      const savedData = await repository
        .createQueryBuilder()
        .insert()
        .values(data)
        .returning("*")
        .execute();
      this.logger.info({
        at: "BaseRepository#insert",
        message: `Saved ${data.length} ${repository.metadata.name} events`,
      });
      return savedData.generatedMaps as Entity[];
    } catch (error) {
      this.logger.error({
        at: "BaseRepository#insert",
        message: `There was an error while saving ${repository.metadata.name} events`,
        error,
      });
      if (throwError || this.throwError) {
        throw error;
      } else {
        return [];
      }
    }
  }

  protected async insertWithFinalisationCheck<Entity extends ObjectLiteral>(
    entity: EntityTarget<Entity>,
    data: Partial<Entity>[],
    uniqueKeys: (keyof Entity)[],
    lastFinalisedBlock: number,
  ) {
    const repository = this.postgres.getRepository(entity);
    const uniqueKeysAsStrings = uniqueKeys.map((key) => key.toString());

    const savedData = await repository
      .createQueryBuilder()
      .insert()
      .values(data)
      .orUpdate(Object.keys(data[0] as any), uniqueKeysAsStrings)
      .returning("*")
      .execute();

    return savedData.generatedMaps as Entity[];
  }

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

    if (!dbEntity) {
      await this.postgres.getRepository(entity).insert(data);
      return {
        data: (await this.postgres
          .getRepository(entity)
          .findOne({ where })) as Entity,
        result: SaveQueryResultType.Inserted,
      };
    }

    // Check if the any of values of the comparison keys have changed
    const isChanged = comparisonKeys.some((key) => data[key] !== dbEntity[key]);
    // Check if the data moved in finalised state
    const isFinalisedChanged = data.finalised && !dbEntity.finalised;

    if (isChanged) {
      await this.postgres.getRepository(entity).update(where, data);
      if (isFinalisedChanged) {
        return {
          data: (await this.postgres
            .getRepository(entity)
            .findOne({ where })) as Entity,
          result: SaveQueryResultType.UpdatedAndFinalised,
        };
      }
      return {
        data: (await this.postgres
          .getRepository(entity)
          .findOne({ where })) as Entity,
        result: SaveQueryResultType.Updated,
      };
    }

    if (isFinalisedChanged) {
      await this.postgres.getRepository(entity).update(where, data);
      return {
        data: (await this.postgres
          .getRepository(entity)
          .findOne({ where })) as Entity,
        result: SaveQueryResultType.Finalised,
      };
    }

    return {
      data: undefined,
      result: SaveQueryResultType.Nothing,
    };
  }
}
