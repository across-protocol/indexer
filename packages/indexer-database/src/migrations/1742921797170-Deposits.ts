import { MigrationInterface, QueryRunner } from "typeorm";

export class Deposits1742921797170 implements MigrationInterface {
  name = "Deposits1742921797170";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" DROP CONSTRAINT "UK_v3FundsDeposited_relayHash_block_logIdx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ADD CONSTRAINT "UK_FundsDeposited_relayHash_block_txnHash_logIdx" UNIQUE ("relayHash", "blockNumber", "transactionHash", "logIndex")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" DROP CONSTRAINT "UK_FundsDeposited_relayHash_block_txnHash_logIdx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ADD CONSTRAINT "UK_v3FundsDeposited_relayHash_block_logIdx" UNIQUE ("relayHash", "logIndex", "blockNumber")`,
    );
  }
}
