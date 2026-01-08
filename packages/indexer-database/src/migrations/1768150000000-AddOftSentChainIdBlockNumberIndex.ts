import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOftSentChainIdBlockNumberIndex1768150000000
  implements MigrationInterface
{
  name = "AddOftSentChainIdBlockNumberIndex1768150000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_oftSent_chainId_blockNumber" ON "evm"."oft_sent" ("chainId", "blockNumber") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_oftSent_chainId_blockNumber"`,
    );
  }
}
