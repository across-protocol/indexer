import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveRelayHashInfoIndexes1764347394136
  implements MigrationInterface
{
  name = "RemoveRelayHashInfoIndexes1764347394136";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IX_rhi_depositEventId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IX_rhi_fillEventId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IX_rhi_slowFillRequestEventId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IX_rhi_swapBeforeBridgeEventId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IX_rhi_callsFailedEventId"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IX_rhi_depositEventId" ON "relay_hash_info" ("depositEventId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_rhi_fillEventId" ON "relay_hash_info" ("fillEventId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_rhi_slowFillRequestEventId" ON "relay_hash_info" ("slowFillRequestEventId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_rhi_swapBeforeBridgeEventId" ON "relay_hash_info" ("swapBeforeBridgeEventId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_rhi_callsFailedEventId" ON "relay_hash_info" ("callsFailedEventId")`,
    );
  }
}
