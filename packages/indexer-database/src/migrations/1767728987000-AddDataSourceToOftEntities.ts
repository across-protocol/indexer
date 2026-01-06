import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDataSourceToOftEntities1767728987000
  implements MigrationInterface
{
  name = "AddDataSourceToOftEntities1767728987000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."oft_sent" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."oft_received" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."oft_received" DROP COLUMN "dataSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."oft_sent" DROP COLUMN "dataSource"`,
    );
  }
}
