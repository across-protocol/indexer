import { MigrationInterface, QueryRunner } from "typeorm";

export class SwapMetadata1762205239010 implements MigrationInterface {
  name = "SwapMetadata1762205239010";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "evm"."swap_metadata_type_enum" AS ENUM('0', '1', '2')`,
    );
    await queryRunner.query(
      `CREATE TYPE "evm"."swap_metadata_side_enum" AS ENUM('0', '1')`,
    );
    await queryRunner.query(
      `CREATE TABLE "evm"."swap_metadata" (
        "id" SERIAL NOT NULL,
        "version" character varying NOT NULL,
        "type" "evm"."swap_metadata_type_enum" NOT NULL,
        "side" "evm"."swap_metadata_side_enum" NOT NULL,
        "address" character varying NOT NULL,
        "maximumAmountIn" numeric NOT NULL,
        "minAmountOut" numeric NOT NULL,
        "expectedAmountOut" numeric NOT NULL,
        "expectedAmountIn" numeric NOT NULL,
        "swapProvider" character varying NOT NULL,
        "slippage" numeric NOT NULL,
        "autoSlippage" boolean NOT NULL,
        "recipient" character varying NOT NULL,
        "appFeeRecipient" character varying,
        "blockHash" character varying NOT NULL,
        "blockNumber" integer NOT NULL,
        "transactionHash" character varying NOT NULL,
        "logIndex" integer NOT NULL,
        "chainId" integer NOT NULL,
        "finalised" boolean NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "blockTimestamp" TIMESTAMP,
        "deletedAt" TIMESTAMP,
        "relayHashInfoId" integer,
        CONSTRAINT "UK_swapMetadata_chainId_blockNumber_transactionHash_logIndex" UNIQUE ("chainId", "blockNumber", "transactionHash", "logIndex"),
        CONSTRAINT "PK_fc1feb55bb87c274f0bb676fb5c" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_swapMetadata_address" ON "evm"."swap_metadata" ("address") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_swapMetadata_recipient" ON "evm"."swap_metadata" ("recipient") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_swapMetadata_swapProvider" ON "evm"."swap_metadata" ("swapProvider") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_swapMetadata_deletedAt" ON "evm"."swap_metadata" ("deletedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_swapMetadata_finalised" ON "evm"."swap_metadata" ("finalised") `,
    );
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_metadata" ADD CONSTRAINT "FK_swapMetadata_relayHashInfoId" FOREIGN KEY ("relayHashInfoId") REFERENCES "relay_hash_info"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evm"."swap_metadata" DROP CONSTRAINT "FK_swapMetadata_relayHashInfoId"`,
    );
    await queryRunner.query(`DROP INDEX "evm"."IX_swapMetadata_finalised"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_swapMetadata_deletedAt"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_swapMetadata_swapProvider"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_swapMetadata_recipient"`);
    await queryRunner.query(`DROP INDEX "evm"."IX_swapMetadata_address"`);
    await queryRunner.query(`DROP TABLE "evm"."swap_metadata"`);
    await queryRunner.query(`DROP TYPE "evm"."swap_metadata_side_enum"`);
    await queryRunner.query(`DROP TYPE "evm"."swap_metadata_type_enum"`);
  }
}
