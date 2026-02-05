import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDataSourceToCallsFailedAndSwapMetadata1770295743182
  implements MigrationInterface
{
  name = "AddDataSourceToCallsFailedAndSwapMetadata1770295743182";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."calls_failed" ADD "dataSource" "evm"."datasource_type_enum" NOT NULL DEFAULT 'polling'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_metadata" ADD "dataSource" "evm"."datasource_type_enum" NOT NULL DEFAULT 'polling'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_metadata" DROP COLUMN "dataSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."calls_failed" DROP COLUMN "dataSource"`,
    );
  }
}
