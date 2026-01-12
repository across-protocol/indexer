import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDataSourceToFilledV3Relay1768217843000
  implements MigrationInterface
{
  name = "AddDataSourceToFilledV3Relay1768217843000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" DROP COLUMN "dataSource"`,
    );
  }
}
