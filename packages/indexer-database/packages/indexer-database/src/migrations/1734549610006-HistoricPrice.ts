import { MigrationInterface, QueryRunner } from "typeorm";

export class HistoricPrice1734549610006 implements MigrationInterface {
    name = 'HistoricPrice1734549610006'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "historic_price" ("id" SERIAL NOT NULL, "baseCurrency" character varying NOT NULL, "quoteCurrency" character varying NOT NULL DEFAULT 'usd', "date" character varying NOT NULL, "price" numeric NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_historic_price_baseCurrency_quoteCurrency_date" UNIQUE ("baseCurrency", "quoteCurrency", "date"), CONSTRAINT "PK_77dc3f4978cdfb03f1bb3a7444b" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "historic_price"`);
    }

}
