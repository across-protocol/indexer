import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDataSourceToCCTPSponsoredBridgingEvents1767870404349
  implements MigrationInterface
{
  name = "AddDataSourceToCCTPSponsoredBridgingEvents1767870404349";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_deposit_for_burn" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_account_activation" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."simple_transfer_flow_completed" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."fallback_hyper_evm_flow_completed" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."arbitrary_actions_executed" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_deposit_for_burn" DROP COLUMN "dataSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."sponsored_account_activation" DROP COLUMN "dataSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."simple_transfer_flow_completed" DROP COLUMN "dataSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."fallback_hyper_evm_flow_completed" DROP COLUMN "dataSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."arbitrary_actions_executed" DROP COLUMN "dataSource"`,
    );
  }
}
