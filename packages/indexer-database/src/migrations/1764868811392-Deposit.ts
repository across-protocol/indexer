import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDepositTable1764868811392 implements MigrationInterface {
  name = "CreateDepositTable1764868811392";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create Enums
    await queryRunner.query(
      `CREATE TYPE "public"."deposit_type_enum" AS ENUM('across', 'cctp', 'oft')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."deposit_status_enum" AS ENUM('pending', 'filled')`,
    );

    // Create Table
    await queryRunner.query(
      `CREATE TABLE "public"."deposit" (
        "id" SERIAL NOT NULL,
        "uniqueId" character varying NOT NULL,
        "type" "public"."deposit_type_enum" NOT NULL,
        "status" "public"."deposit_status_enum" NOT NULL DEFAULT 'pending',
        "blockTimestamp" TIMESTAMP NOT NULL,
        "originChainId" bigint NOT NULL,
        "destinationChainId" bigint NOT NULL,
        "depositor" character varying,
        "recipient" character varying,
        "v3FundsDepositedId" integer,
        "filledV3RelayId" integer,
        "depositForBurnId" integer,
        "mintAndWithdrawId" integer,
        "oftSentId" integer,
        "oftReceivedId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UK_deposits_uniqueId" UNIQUE ("uniqueId"),
        CONSTRAINT "PK_deposit" PRIMARY KEY ("id")
      )`,
    );

    // Create Indices
    await queryRunner.query(
      `CREATE INDEX "IX_deposits_blockTimestamp" ON "public"."deposit" ("blockTimestamp")`,
    );
    // User history lookups
    await queryRunner.query(
      `CREATE INDEX "IX_deposits_depositor_timestamp" ON "public"."deposit" ("depositor", "blockTimestamp")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_deposits_recipient_timestamp" ON "public"."deposit" ("recipient", "blockTimestamp")`,
    );
    // Status lookups (for finding unfilled deposits)
    await queryRunner.query(
      `CREATE INDEX "IX_deposits_status_timestamp" ON "public"."deposit" ("status", "blockTimestamp")`,
    );

    // Add Foreign Keys
    // Note: Assuming specific table names in 'evm' schema based on TypeORM naming conventions.
    // If your table names differ (e.g., snake_case vs camelCase), you might need to adjust these names.

    // Across
    await queryRunner.query(
      `ALTER TABLE "public"."deposit" ADD CONSTRAINT "FK_deposit_v3FundsDeposited" FOREIGN KEY ("v3FundsDepositedId") REFERENCES "evm"."v3_funds_deposited"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."deposit" ADD CONSTRAINT "FK_deposit_filledV3Relay" FOREIGN KEY ("filledV3RelayId") REFERENCES "evm"."filled_v3_relay"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // CCTP
    await queryRunner.query(
      `ALTER TABLE "public"."deposit" ADD CONSTRAINT "FK_deposit_depositForBurn" FOREIGN KEY ("depositForBurnId") REFERENCES "evm"."deposit_for_burn"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."deposit" ADD CONSTRAINT "FK_deposit_mintAndWithdraw" FOREIGN KEY ("mintAndWithdrawId") REFERENCES "evm"."mint_and_withdraw"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // OFT
    await queryRunner.query(
      `ALTER TABLE "public"."deposit" ADD CONSTRAINT "FK_deposit_oftSent" FOREIGN KEY ("oftSentId") REFERENCES "evm"."oft_sent"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."deposit" ADD CONSTRAINT "FK_deposit_oftReceived" FOREIGN KEY ("oftReceivedId") REFERENCES "evm"."oft_received"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop Foreign Keys
    await queryRunner.query(
      `ALTER TABLE "public"."deposit" DROP CONSTRAINT "FK_deposit_oftReceived"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."deposit" DROP CONSTRAINT "FK_deposit_oftSent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."deposit" DROP CONSTRAINT "FK_deposit_mintAndWithdraw"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."deposit" DROP CONSTRAINT "FK_deposit_depositForBurn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."deposit" DROP CONSTRAINT "FK_deposit_filledV3Relay"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."deposit" DROP CONSTRAINT "FK_deposit_v3FundsDeposited"`,
    );

    // Drop Indices
    await queryRunner.query(
      `DROP INDEX "public"."IX_deposits_status_timestamp"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IX_deposits_recipient_timestamp"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IX_deposits_depositor_timestamp"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IX_deposits_blockTimestamp"`);

    // Drop Table
    await queryRunner.query(`DROP TABLE "public"."deposit"`);

    // Drop Enums
    await queryRunner.query(`DROP TYPE "public"."deposit_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."deposit_type_enum"`);
  }
}
