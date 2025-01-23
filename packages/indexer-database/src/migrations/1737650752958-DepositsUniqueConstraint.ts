import { MigrationInterface, QueryRunner } from "typeorm";

export class DepositsUniqueConstraint1737650752958
  implements MigrationInterface
{
  name = "DepositsUniqueConstraint1737650752958";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" DROP CONSTRAINT "UK_v3FundsDeposited_depositId_originChainId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP CONSTRAINT "UK_relayHashInfo_relayHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ADD CONSTRAINT "UK_v3FundsDeposited_relayHash_block_logIdx" UNIQUE ("relayHash", "blockNumber", "logIndex")`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD CONSTRAINT "UK_relayHashInfo_relayHash_depositEvent" UNIQUE ("relayHash", "depositEventId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP CONSTRAINT "UK_relayHashInfo_relayHash_depositEvent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" DROP CONSTRAINT "UK_v3FundsDeposited_relayHash_block_logIdx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD CONSTRAINT "UK_relayHashInfo_relayHash" UNIQUE ("relayHash")`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."v3_funds_deposited" ADD CONSTRAINT "UK_v3FundsDeposited_depositId_originChainId" UNIQUE ("depositId", "originChainId")`,
    );
  }
}
