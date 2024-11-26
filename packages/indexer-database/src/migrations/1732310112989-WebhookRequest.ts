import { MigrationInterface, QueryRunner } from "typeorm";

export class WebhookRequest1732310112989 implements MigrationInterface {
  name = "WebhookRequest1732310112989";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_webhook_request_filter" ON "webhook_request" ("filter") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IX_webhook_request_filter"`);
  }
}
