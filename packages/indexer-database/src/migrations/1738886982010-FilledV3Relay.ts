import { MigrationInterface, QueryRunner } from "typeorm";

export class FilledV3Relay1738886982010 implements MigrationInterface {
  name = "FilledV3Relay1738886982010";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ADD "internalHash" character varying`,
    );
    // await queryRunner.query(`update evm.filled_v3_relay set "internalHash" = "relayHash" where "relayHash" is not null;`);
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ADD CONSTRAINT "UK_filledV3Relay_internalHash" UNIQUE ("internalHash")`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" DROP CONSTRAINT "UK_filledV3Relay_relayHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ALTER COLUMN "relayHash" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" DROP CONSTRAINT "UK_filledV3Relay_internalHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" DROP COLUMN "internalHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ADD CONSTRAINT "UK_filledV3Relay_relayHash" UNIQUE ("relayHash")`,
    );
  }
}
