import { MigrationInterface, QueryRunner } from "typeorm";

export class MonadPrice1763557964557 implements MigrationInterface {
  name = "MonadPrice1763557964557";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "public"."historic_price" ("baseCurrency", "quoteCurrency", date, price)
      values ('MON', 'usd', '2025-11-23', 0.03), ('MON', 'usd', '2025-11-24', 0.03);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "public"."historic_price" WHERE "baseCurrency" = 'MON' and date in ('2025-11-23', '2025-11-24');  
    `);
  }
}
