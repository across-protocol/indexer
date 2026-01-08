import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOriginChainAndBlockIndexes1766172349662
  implements MigrationInterface
{
  name = "AddOriginChainAndBlockIndexes1766172349662";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_v3FundsDeposited_originChainId_blockNumber" ON "evm"."v3_funds_deposited" ("originChainId", "blockNumber") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_v3FundsDeposited_originChainId_blockNumber"`,
    );
  }
}
