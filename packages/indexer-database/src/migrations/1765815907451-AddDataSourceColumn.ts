import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDataSourceColumn1765815907451 implements MigrationInterface {
  name = "AddDataSourceColumn1765815907451";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "evm"."datasource_type_enum" AS ENUM('websocket', 'polling')`,
    );

    await queryRunner.query(
      `ALTER TABLE "evm"."deposit_for_burn" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."message_sent" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."message_received" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."mint_and_withdraw" ADD "dataSource" "evm"."datasource_type_enum" DEFAULT 'polling'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."message_received" DROP COLUMN "dataSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."message_sent" DROP COLUMN "dataSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."deposit_for_burn" DROP COLUMN "dataSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."mint_and_withdraw" DROP COLUMN "dataSource"`,
    );
    await queryRunner.query(`DROP TYPE "evm"."datasource_type_enum"`);
  }
}
