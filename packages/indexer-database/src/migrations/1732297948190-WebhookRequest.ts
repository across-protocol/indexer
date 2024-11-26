import { MigrationInterface, QueryRunner } from "typeorm";

export class WebhookRequest1732297948190 implements MigrationInterface {
  name = "WebhookRequest1732297948190";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webhook_request" (
        "id" character varying NOT NULL, 
        "clientId" integer NOT NULL, 
        "url" character varying NOT NULL, 
        "filter" character varying NOT NULL, 
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(), 
        CONSTRAINT "UK_webhook_request_clientId_filter" UNIQUE ("clientId", "filter"), 
        CONSTRAINT "PK_67a7784045de2d1b7139b611b93" PRIMARY KEY ("id")
    )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "webhook_request"`);
  }
}
