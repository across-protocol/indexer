import { MigrationInterface, QueryRunner } from "typeorm";

export class UserAccountActivated1768919556573 implements MigrationInterface {
  name = "UserAccountActivated1768919556573";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."user_account_activated" (
        "id" SERIAL NOT NULL,
        "user" character varying NOT NULL,
        "token" character varying NOT NULL,
        "amountRequiredToActivate" numeric NOT NULL,
        "blockHash" character varying NOT NULL,
        "blockNumber" integer NOT NULL,
        "transactionHash" character varying NOT NULL,
        "logIndex" integer NOT NULL,
        "chainId" integer NOT NULL,
        "finalised" boolean NOT NULL,
        "blockTimestamp" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "UK_userAccountActivated_chain_block_tx_log" UNIQUE ("chainId","blockNumber","transactionHash","logIndex"),
        CONSTRAINT "PK_43116bd9abab63a65f61df3e443" PRIMARY KEY ("id")
        )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_userAccountActivated_token" ON "evm"."user_account_activated" ("token") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_userAccountActivated_deletedAt" ON "evm"."user_account_activated" ("deletedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_userAccountActivated_finalised" ON "evm"."user_account_activated" ("finalised") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "evm"."IX_userAccountActivated_finalised"`,
    );
    await queryRunner.query(
      `DROP INDEX "evm"."IX_userAccountActivated_deletedAt"`,
    );
    await queryRunner.query(`DROP INDEX "evm"."IX_userAccountActivated_token"`);
    await queryRunner.query(`DROP TABLE "evm"."user_account_activated"`);
  }
}
