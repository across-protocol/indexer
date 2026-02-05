import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDataSourceToCallsFailedAndSwapMetadata1739967812687
  implements MigrationInterface
{
  name = "AddDataSourceToCallsFailedAndSwapMetadata1739967812687";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."calls_failed" ADD "dataSource" "evm"."filled_v3_relay_datasource_enum" NOT NULL DEFAULT 'polling'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_metadata" ADD "dataSource" "evm"."filled_v3_relay_datasource_enum" NOT NULL DEFAULT 'polling'`,
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
