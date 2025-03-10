import { MigrationInterface, QueryRunner } from "typeorm";

export class RequestedV3SlowFill1738886982011 implements MigrationInterface {
  name = "RequestedV3SlowFill1738886982011";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ADD "internalHash" character varying`,
    );
    await queryRunner.query(
      `update "evm"."requested_v3_slow_fill" set "internalHash" = "relayHash" where "relayHash" is not null;`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ADD CONSTRAINT "UK_requestedV3SlowFill_internalHash" UNIQUE ("internalHash")`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" DROP CONSTRAINT "UK_requestedV3SlowFill_relayHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ALTER COLUMN "relayHash" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" DROP CONSTRAINT "UK_requestedV3SlowFill_internalHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" DROP COLUMN "internalHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_v3_slow_fill" ADD CONSTRAINT "UK_requestedV3SlowFill_relayHash" UNIQUE ("relayHash")`,
    );
  }
}
