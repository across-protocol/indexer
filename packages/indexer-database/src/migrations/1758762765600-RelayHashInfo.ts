import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1758762765600 implements MigrationInterface {
  name = "RelayHashInfo1758762765600";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "actionsTargetChainId" bigint`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "actionsTargetChainId"`,
    );
  }
}
