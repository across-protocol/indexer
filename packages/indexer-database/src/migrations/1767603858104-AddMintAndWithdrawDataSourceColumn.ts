import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMintAndWithdrawDataSourceColumn1767603858104
  implements MigrationInterface
{
  name = "AddMintAndWithdrawDataSourceColumn1767603858104";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."mint_and_withdraw" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."mint_and_withdraw" DROP COLUMN "dataSource"`,
    );
  }
}
