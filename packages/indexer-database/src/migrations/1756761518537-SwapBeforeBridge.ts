import { MigrationInterface, QueryRunner } from "typeorm";

export class SwapBeforeBridge1756761518537 implements MigrationInterface {
  name = "SwapBeforeBridge1756761518537";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_before_bridge" ADD "exchangeCalldata" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_before_bridge" DROP COLUMN "exchangeCalldata"`,
    );
  }
}
