import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDataSourceToSwapBeforeBridge1768250000001
  implements MigrationInterface
{
  name = "AddDataSourceToSwapBeforeBridge1768250000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_before_bridge" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_before_bridge" DROP COLUMN "dataSource"`,
    );
  }
}
