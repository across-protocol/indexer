import { MigrationInterface, QueryRunner } from "typeorm";

export class ProposedRootBundle1726249543923 implements MigrationInterface {
  name = "ProposedRootBundle1726249543923";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."proposed_root_bundle" ADD "chainIds" jsonb NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."proposed_root_bundle" DROP COLUMN "chainIds"`,
    );
  }
}
