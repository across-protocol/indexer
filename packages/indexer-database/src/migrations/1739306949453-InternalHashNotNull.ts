import { MigrationInterface, QueryRunner } from "typeorm";

export class InternalHashNotNull1739306949453 implements MigrationInterface {
  name = "InternalHashNotNull1739306949453";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ALTER COLUMN "internalHash" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ALTER COLUMN "internalHash" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ALTER COLUMN "internalHash" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP CONSTRAINT "UK_relayHashInfo_internalHash_depositEvent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ALTER COLUMN "internalHash" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD CONSTRAINT "UK_relayHashInfo_internalHash_depositEvent" UNIQUE ("internalHash", "depositEventId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP CONSTRAINT "UK_relayHashInfo_internalHash_depositEvent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ALTER COLUMN "internalHash" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD CONSTRAINT "UK_relayHashInfo_internalHash_depositEvent" UNIQUE ("depositEventId", "internalHash")`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ALTER COLUMN "internalHash" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ALTER COLUMN "internalHash" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ALTER COLUMN "internalHash" DROP NOT NULL`,
    );
  }
}
