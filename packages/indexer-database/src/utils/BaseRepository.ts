import { DataSource, EntityTarget, ObjectLiteral } from "typeorm";
import winston from "winston";

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
}
