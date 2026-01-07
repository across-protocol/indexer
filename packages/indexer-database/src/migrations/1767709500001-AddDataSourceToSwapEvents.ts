import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDataSourceToSwapEvents1767709500001
  implements MigrationInterface
{
  name = "AddDataSourceToSwapEvents1767709500001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_flow_initialized" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_flow_finalized" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_flow_finalized" DROP COLUMN "dataSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_flow_initialized" DROP COLUMN "dataSource"`,
    );
  }
}
