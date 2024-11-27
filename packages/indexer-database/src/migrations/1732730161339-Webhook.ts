import { MigrationInterface, QueryRunner } from "typeorm";

export class Webhook1732730161339 implements MigrationInterface {
  name = "Webhook1732730161339";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "webhook_client" ADD CONSTRAINT "UQ_a08bea1c3eba7711301141ae001" UNIQUE ("name")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "webhook_client" DROP CONSTRAINT "UQ_a08bea1c3eba7711301141ae001"`,
    );
  }
}
