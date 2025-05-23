import { MigrationInterface, QueryRunner } from "typeorm";

export class HistoricPrice1734616435674 implements MigrationInterface {
  name = "HistoricPrice1734616435674";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "historic_price" (
        "id" SERIAL NOT NULL, 
        "baseCurrency" character varying NOT NULL, 
        "quoteCurrency" character varying NOT NULL DEFAULT 'usd', 
        "date" date NOT NULL, 
        "price" double precision NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(), 
        CONSTRAINT "UK_hp_baseCurrency_quoteCurrency_date" UNIQUE ("baseCurrency", "quoteCurrency", "date"), 
        CONSTRAINT "PK_77dc3f4978cdfb03f1bb3a7444b" PRIMARY KEY ("id"))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "historic_price"`);
  }
}
