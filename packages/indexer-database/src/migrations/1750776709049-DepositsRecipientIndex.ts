import { MigrationInterface, QueryRunner } from "typeorm";

export class DepositsRecipientIndex1750776709049 implements MigrationInterface {
  name = "DepositsRecipientIndex1750776709049";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_v3FundsDeposited_recipient" ON "evm"."v3_funds_deposited" ("recipient") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "evm"."IX_v3FundsDeposited_recipient"`);
  }
}
