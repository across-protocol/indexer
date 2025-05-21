import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfoChainTypes1747839674610
  implements MigrationInterface
{
  name = "RelayHashInfoChainTypes1747839674610";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ALTER COLUMN "originChainId" TYPE bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ALTER COLUMN "destinationChainId" TYPE bigint`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ALTER COLUMN "originChainId" TYPE integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ALTER COLUMN "destinationChainId" TYPE integer`,
    );
  }
}
