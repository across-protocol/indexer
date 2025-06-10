import { MigrationInterface, QueryRunner } from "typeorm";

export class MissingIndexes1749138974527 implements MigrationInterface {
  name = "MissingIndexes1749138974527";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_filledV3Relay_depositId_originChainId" ON "evm"."filled_v3_relay" ("depositId", "originChainId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_filledV3Relay_destinationChainId" ON "evm"."filled_v3_relay" ("destinationChainId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_filledV3Relay_relayer" ON "evm"."filled_v3_relay" ("relayer") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_v3FundsDeposited_depositId_originChainId" ON "evm"."v3_funds_deposited" ("depositId", "originChainId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_v3FundsDeposited_destinationChainId" ON "evm"."v3_funds_deposited" ("destinationChainId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_v3FundsDeposited_destinationChainId"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_v3FundsDeposited_depositId_originChainId"`,
    );
    await queryRunner.query(`DROP INDEX "evm"."IX_filledV3Relay_relayer"`);
    await queryRunner.query(
      `DROP INDEX "evm"."IX_filledV3Relay_destinationChainId"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_filledV3Relay_depositId_originChainId"`,
    );
  }
}
