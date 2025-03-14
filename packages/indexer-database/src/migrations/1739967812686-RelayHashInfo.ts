import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1739967812686 implements MigrationInterface {
  name = "RelayHashInfo1739967812686";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD "swapBeforeBridgeEventId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD CONSTRAINT "UQ_0e578ee118b0d02c181f4a39c71" UNIQUE ("swapBeforeBridgeEventId")`,
    );
    await queryRunner.query(`
      ALTER TABLE "relay_hash_info" 
        ADD CONSTRAINT "FK_relayHashInfo_swapBeforeBridgeEventId" 
          FOREIGN KEY ("swapBeforeBridgeEventId") REFERENCES "evm"."swap_before_bridge"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP CONSTRAINT "FK_relayHashInfo_swapBeforeBridgeEventId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP CONSTRAINT "UQ_0e578ee118b0d02c181f4a39c71"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP COLUMN "swapBeforeBridgeEventId"`,
    );
  }
}
