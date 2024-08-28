import { DataSource, EntityTarget, ObjectLiteral } from "typeorm";
import winston from "winston";

export class BaseRepository {
  constructor(
    protected postgres: DataSource,
    protected logger: winston.Logger,
  ) {}

  protected async insert<Entity extends ObjectLiteral>(
    entity: EntityTarget<Entity>,
    data: Partial<Entity>[],
    throwError = false,
  ): Promise<void> {
    const repository = this.postgres.getRepository(entity);
    try {
      await repository.insert(data);
      this.logger.info(
        `Saved ${data.length} ${repository.metadata.name} events`,
      );
    } catch (error) {
      this.logger.error(
        `There was an error while saving ${repository.metadata.name} events:`,
        error,
      );
      if (throwError) throw error;
    }
  }
}
