import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDataSourceToSponsoredDepositForBurn1767709500000
  implements MigrationInterface
{
  name = "AddDataSourceToSponsoredDepositForBurn1767709500000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_deposit_for_burn" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_deposit_for_burn" DROP COLUMN "dataSource"`,
    );
  }
}
