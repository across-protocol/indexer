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
  ): Promise<void> {
    const repository = this.postgres.getRepository(entity);
    try {
      await repository.insert(data);
      this.logger.info({
        message: `Saved ${data.length} ${repository.metadata.name} events`,
      });
    } catch (error) {
      this.logger.error({
        message: `There was an error while saving ${repository.metadata.name} events`,
        error,
      });
      if (throwError || this.throwError) throw error;
    }
  }
}
