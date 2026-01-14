import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFillBlockIndexes1768178183000 implements MigrationInterface {
  name = "AddFillBlockIndexes1768178183000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_filledV3Relay_destinationChainId_blockNumber" ON "evm"."filled_v3_relay" ("destinationChainId", "blockNumber")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_oftReceived_chainId_blockNumber" ON "evm"."oft_received" ("chainId", "blockNumber")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_oftReceived_chainId_blockNumber"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_filledV3Relay_destinationChainId_blockNumber"`,
    );
  }
}
