import {
  DataSource,
  DeleteResult,
  EntityTarget,
  Repository,
  Entity,
  ObjectLiteral,
} from "typeorm";

export class GenericFixture<T extends ObjectLiteral> {
  private repository: Repository<T>;

  public constructor(
    private dataSource: DataSource,
    private entity: EntityTarget<T>,
  ) {
    this.repository = this.dataSource.getRepository(this.entity);
  }

  public async insert(items: Partial<T>[]): Promise<T[]> {
    const result = await this.repository
      .createQueryBuilder()
      .insert()
      .values(items as any)
      .returning("*")
      .execute();

    return result.generatedMaps as T[];
  }

  public deleteAll(): Promise<DeleteResult> {
    const metadata = this.repository.metadata;
    const tableName = metadata.schema
      ? `"${metadata.schema}"."${metadata.tableName}"`
      : `"${metadata.tableName}"`;

    return this.repository.query(
      `truncate table ${tableName} restart identity cascade`,
    );
  }
}
