import { MigrationInterface, QueryRunner } from "typeorm";

export class WebhookClient1732297474910 implements MigrationInterface {
  name = "WebhookClient1732297474910";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webhook_client" (
        "id" SERIAL NOT NULL, 
        "name" character varying NOT NULL, 
        "apiKey" character varying NOT NULL, 
        "domains" jsonb NOT NULL, 
        CONSTRAINT "UK_webhook_client_api_key" UNIQUE ("apiKey"), 
        CONSTRAINT "PK_f7330fb3bdb2e19534eae691d44" PRIMARY KEY ("id")
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "webhook_client"`);
  }
}
