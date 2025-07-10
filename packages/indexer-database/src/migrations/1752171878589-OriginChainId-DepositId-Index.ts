import { MigrationInterface, QueryRunner } from "typeorm";

export class OriginChainIdDepositIdIndex1752171878589
  implements MigrationInterface
{
  name = "OriginChainIdDepositIdIndex1752171878589";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_filledV3Relay_depositId_originChainId"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_v3FundsDeposited_depositId_originChainId"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_filledV3Relay_originChainId_depositId" ON "evm"."filled_v3_relay" ("originChainId", "depositId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_v3FundsDeposited_originChainId_depositId" ON "evm"."v3_funds_deposited" ("originChainId", "depositId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_v3FundsDeposited_originChainId_depositId"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_filledV3Relay_originChainId_depositId"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_v3FundsDeposited_depositId_originChainId" ON "evm"."v3_funds_deposited" ("depositId", "originChainId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_filledV3Relay_depositId_originChainId" ON "evm"."filled_v3_relay" ("depositId", "originChainId") `,
    );
  }
}
