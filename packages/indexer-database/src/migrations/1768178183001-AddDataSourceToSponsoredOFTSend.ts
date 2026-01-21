import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDataSourceToSponsoredOFTSend1768178183001
  implements MigrationInterface
{
  name = "AddDataSourceToSponsoredOFTSend1768178183001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "evm"."sponsored_oft_send"
      ADD COLUMN "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "evm"."sponsored_oft_send"
      DROP COLUMN "dataSource"
    `);
  }
}
