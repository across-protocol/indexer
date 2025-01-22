import { MigrationInterface, QueryRunner } from "typeorm";

export class RepaymentChainId1737573949409 implements MigrationInterface {
  name = "RepaymentChainId1737573949409";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `alter table evm.filled_v3_relay alter column "repaymentChainId" type numeric`,
    );
    await queryRunner.query(
      `alter table bundle_event alter column "repaymentChainId" type numeric`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" ADD "deferredRefunds" boolean`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `alter table evm.filled_v3_relay alter column "repaymentChainId" type integer`,
    );
    await queryRunner.query(
      `alter table bundle_event alter column "repaymentChainId" type integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."executed_relayer_refund_root" DROP COLUMN "deferredRefunds"`,
    );
  }
}
