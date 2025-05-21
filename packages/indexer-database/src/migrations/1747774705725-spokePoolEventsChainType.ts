import { MigrationInterface, QueryRunner } from "typeorm";

export class SpokePoolEventsChainType1747774705725
  implements MigrationInterface
{
  name = "SpokePoolEventsChainType1747774705725";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // v3_funds_deposited
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ALTER COLUMN "originChainId" TYPE bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ALTER COLUMN "destinationChainId" TYPE bigint`,
    );
    // filled_v3_relay
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ALTER COLUMN "originChainId" TYPE bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ALTER COLUMN "destinationChainId" TYPE bigint`,
    );
    // requested_v3_slow_fill
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ALTER COLUMN "originChainId" TYPE bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ALTER COLUMN "destinationChainId" TYPE bigint`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // v3_funds_deposited
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ALTER COLUMN "originChainId" TYPE integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ALTER COLUMN "destinationChainId" TYPE integer`,
    );
    // filled_v3_relay
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ALTER COLUMN "originChainId" TYPE integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ALTER COLUMN "destinationChainId" TYPE integer`,
    );
    // requested_v3_slow_fill
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ALTER COLUMN "originChainId" TYPE integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ALTER COLUMN "destinationChainId" TYPE integer`,
    );
  }
}
