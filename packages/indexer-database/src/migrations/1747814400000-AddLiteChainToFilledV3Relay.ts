import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLiteChainToFilledV3Relay1747814400000
  implements MigrationInterface
{
  name = "AddLiteChainToFilledV3Relay1747814400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ADD "fromLiteChain" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" ADD "toLiteChain" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" DROP COLUMN "toLiteChain"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."filled_v3_relay" DROP COLUMN "fromLiteChain"`,
    );
  }
}
