import { MigrationInterface, QueryRunner } from "typeorm";

export class SpeedUpV31729700385983 implements MigrationInterface {
  name = "SpeedUpV31729700385983";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_speed_up_v3_deposit" DROP CONSTRAINT "UK_requestedSpeedUpV3_depositId_originChain_txHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_speed_up_v3_deposit" ADD CONSTRAINT "UK_speedUpV3_depositId_originChain_txHash_logIdx" UNIQUE ("depositId", "originChainId", "transactionHash", "logIndex")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_speed_up_v3_deposit" DROP CONSTRAINT "UK_speedUpV3_depositId_originChain_txHash_logIdx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."requested_speed_up_v3_deposit" ADD CONSTRAINT "UK_requestedSpeedUpV3_depositId_originChain_txHash" UNIQUE ("originChainId", "depositId", "transactionHash")`,
    );
  }
}
