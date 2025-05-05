import { MigrationInterface, QueryRunner } from "typeorm";

export class FilledV3Relay1746458849679 implements MigrationInterface {
  name = "FilledV3Relay1746458849679";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_filledV3Relay_blockTimestamp" ON "evm"."filled_v3_relay" ("blockTimestamp") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_filledV3Relay_blockTimestamp"`,
    );
  }
}
