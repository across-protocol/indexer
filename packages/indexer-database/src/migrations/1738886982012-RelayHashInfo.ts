import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1738886982012 implements MigrationInterface {
  name = "RelayHashInfo1738886982012";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "internalHash" character varying`,
    );
    await queryRunner.query(
      `update "relay_hash_info" set "internalHash" = "relayHash" where "relayHash" is not null;`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD CONSTRAINT "UK_relayHashInfo_internalHash_depositEvent" UNIQUE ("internalHash", "depositEventId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP CONSTRAINT "UK_relayHashInfo_relayHash_depositEvent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ALTER COLUMN "relayHash" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP CONSTRAINT "UK_relayHashInfo_internalHash_depositEvent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "internalHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD CONSTRAINT "UK_relayHashInfo_relayHash_depositEvent" UNIQUE ("relayHash", "depositEventId")`,
    );
  }
}
