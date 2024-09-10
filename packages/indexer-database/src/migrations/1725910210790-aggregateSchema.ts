import { MigrationInterface, QueryRunner } from "typeorm";

export class AggregateSchema1725910210790 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS aggregate;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS aggregate;`);
  }
}
