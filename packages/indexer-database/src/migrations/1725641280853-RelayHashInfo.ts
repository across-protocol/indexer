import { MigrationInterface, QueryRunner } from "typeorm";

export class RelayHashInfo1725641280853 implements MigrationInterface {
  name = "RelayHashInfo1725641280853";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "relay_hash_info" (
          "id" SERIAL NOT NULL,
          "relayHash" character varying NOT NULL,
          "depositId" integer NOT NULL,
          "originChainId" integer NOT NULL,
          "depositEventId" integer,
          "fillEventId" integer,
          "slowFillRequestEventId" integer,
          "status" character varying,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "UK_relayHashInfo_relayHash" UNIQUE ("relayHash"),
          CONSTRAINT "REL_4e5fd1998c43638a6e836a3636" UNIQUE ("depositEventId"),
          CONSTRAINT "REL_8aec45003aaa82a8550b9a1535" UNIQUE ("fillEventId"),
          CONSTRAINT "REL_37cf938a3a02547d23e967867a" UNIQUE ("slowFillRequestEventId"),
          CONSTRAINT "PK_cb69f68900aa0ce2756f103692f" PRIMARY KEY ("id")
        )
      `,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD CONSTRAINT "FK_relayHashInfo_depositEventId" FOREIGN KEY ("depositEventId") REFERENCES "evm"."v3_funds_deposited"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD CONSTRAINT "FK_relayHashInfo_fillEventId" FOREIGN KEY ("fillEventId") REFERENCES "evm"."filled_v3_relay"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" ADD CONSTRAINT "FK_relayHashInfo_slowFillRequestEventId" FOREIGN KEY ("slowFillRequestEventId") REFERENCES "evm"."requested_v3_slow_fill"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP CONSTRAINT "FK_relayHashInfo_slowFillRequestEventId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP CONSTRAINT "FK_relayHashInfo_fillEventId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP CONSTRAINT "FK_relayHashInfo_depositEventId"`,
    );
    await queryRunner.query(`DROP TABLE "relay_hash_info"`);
  }
}
