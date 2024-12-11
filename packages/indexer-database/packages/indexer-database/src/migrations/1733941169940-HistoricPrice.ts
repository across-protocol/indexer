import { MigrationInterface, QueryRunner } from "typeorm";

export class HistoricPrice1733941169940 implements MigrationInterface {
    name = 'HistoricPrice1733941169940'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "historic_market_price" ("id" SERIAL NOT NULL, "baseCurrency" character varying NOT NULL, "quoteCurrency" character varying NOT NULL DEFAULT 'usd', "date" date NOT NULL, "price" numeric NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_historic_price_baseCurrency_quoteCurrency_date" UNIQUE ("baseCurrency", "quoteCurrency", "date"), CONSTRAINT "PK_b0a22436b47e742187aa7408561" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "historic_market_price"`);
    }

}
