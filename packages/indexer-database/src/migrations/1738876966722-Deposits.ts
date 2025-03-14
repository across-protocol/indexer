import { MigrationInterface, QueryRunner } from "typeorm";

export class Deposits1738876966722 implements MigrationInterface {
  name = "Deposits1738876966722";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_deposits_block_chain_logIndex" ON "evm"."v3_funds_deposited" ("blockNumber", "originChainId", "logIndex") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_v3FundsDeposited_finalised" ON "evm"."v3_funds_deposited" ("finalised") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "evm"."IX_v3FundsDeposited_finalised"`);
    await queryRunner.query(
      `DROP INDEX "evm"."IX_deposits_block_chain_logIndex"`,
    );
  }
}
