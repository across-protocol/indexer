import { MigrationInterface, QueryRunner } from "typeorm";

export class DepositId1737488614951 implements MigrationInterface {
  name = "DepositId1737488614951";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `alter table relay_hash_info alter column "depositId" type numeric`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `alter table relay_hash_info alter column "depositId" type integer`,
    );
  }
}
