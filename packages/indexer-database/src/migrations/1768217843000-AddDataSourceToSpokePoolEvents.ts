import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDataSourceToSpokePoolEvents1768217843000
  implements MigrationInterface
{
  name = "AddDataSourceToSpokePoolEvents1768217843000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."relayed_root_bundle" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" DROP COLUMN "dataSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" DROP COLUMN "dataSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."relayed_root_bundle" DROP COLUMN "dataSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" DROP COLUMN "dataSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" DROP COLUMN "dataSource"`,
    );
  }
}
