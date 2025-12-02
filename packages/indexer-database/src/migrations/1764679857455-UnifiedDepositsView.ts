import { MigrationInterface, QueryRunner } from "typeorm";

export class SplitUnifiedViews1764679857455 implements MigrationInterface {
  name = "SplitUnifiedViews1764679857455";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ==========================================
    // 1. ACROSS MATERIALIZED VIEW
    // ==========================================
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW "evm"."mv_across_deposits" AS
      SELECT 
          'across' AS "type",
          d.id::text AS "unique_id",
          d."id" AS "original_id",
          d."blockTimestamp" AS "timestamp",
          d."depositor" AS "sender",
          d."recipient" AS "recipient",
          d."inputToken" AS "inputToken",
          d."outputToken" AS "outputToken",
          d."amount" AS "amount",
          d."originChainId"::text AS "originChainId",
          d."destinationChainId"::text AS "destinationChainId",
          COALESCE(rhi.status, 'Unfilled') AS "status",
          d."transactionHash" AS "depositTxHash",
          d."blockNumber" AS "blockNumber",
          fill."transactionHash" AS "fillTxHash",
          d."depositRefundTxHash" AS "refundTxHash" 
      FROM "evm"."v3_funds_deposited" d
      LEFT JOIN "relay_hash_info" rhi ON rhi."depositEventId" = d.id
      LEFT JOIN "evm"."filled_v3_relay" fill ON fill."id" = rhi."fillEventId"
    `);

    // Indices for Across MV
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UIX_mv_across_id" ON "evm"."mv_across_deposits" ("original_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_mv_across_timestamp" ON "evm"."mv_across_deposits" ("timestamp" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_mv_across_sender" ON "evm"."mv_across_deposits" ("sender")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_mv_across_recipient" ON "evm"."mv_across_deposits" ("recipient")`,
    );

    // ==========================================
    // 2. CCTP MATERIALIZED VIEW
    // ==========================================
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW "evm"."mv_cctp_deposits" AS
      SELECT 
          'cctp' AS "type",
          CONCAT('cctp_', dfB.id) AS "unique_id",
          dfB."id" AS "original_id",
          dfB."blockTimestamp" AS "timestamp",
          dfB."depositor" AS "sender",
          dfB."mintRecipient" AS "recipient",
          dfB."burnToken" AS "inputToken",
          mw."mintToken" AS "outputToken",
          dfB."amount" AS "amount",
          dfB."chainId"::text AS "originChainId",
          mr."chainId"::text AS "destinationChainId",
          CASE WHEN mw.id IS NOT NULL THEN 'Filled' ELSE 'Unfilled' END AS "status",
          dfB."transactionHash" AS "depositTxHash",
          dfB."blockNumber" AS "blockNumber",
          mw."transactionHash" AS "fillTxHash",
          NULL::text AS "refundTxHash"
      FROM "evm"."deposit_for_burn" dfB
      LEFT JOIN "evm"."message_sent" ms ON ms."transactionHash" = dfB."transactionHash" AND ms."chainId" = dfB."chainId"
      LEFT JOIN "evm"."message_received" mr ON mr."nonce" = ms."nonce" AND mr."sourceDomain" = ms."sourceDomain"
      LEFT JOIN "evm"."mint_and_withdraw" mw ON mw."transactionHash" = mr."transactionHash" AND mw."chainId" = mr."chainId"
    `);

    // Indices for CCTP MV
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UIX_mv_cctp_id" ON "evm"."mv_cctp_deposits" ("original_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_mv_cctp_timestamp" ON "evm"."mv_cctp_deposits" ("timestamp" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_mv_cctp_sender" ON "evm"."mv_cctp_deposits" ("sender")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_mv_cctp_recipient" ON "evm"."mv_cctp_deposits" ("recipient")`,
    );

    // ==========================================
    // 3. OFT MATERIALIZED VIEW
    // ==========================================
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW "evm"."mv_oft_deposits" AS
      SELECT 
        'oft' AS "type",
          CONCAT('oft_', oftS.id) AS "unique_id",
          oftS."id" AS "original_id",
          oftS."blockTimestamp" AS "timestamp",
          oftS."fromAddress" AS "sender",
          oftR."toAddress" AS "recipient", 
          oftS."token" AS "inputToken",
          oftR."token" AS "outputToken",
          oftS."amountSentLD" AS "amount",
          oftS."chainId"::text AS "originChainId",
          oftR."chainId"::text AS "destinationChainId",
          CASE WHEN oftR.id IS NOT NULL THEN 'Filled' ELSE 'Unfilled' END AS "status",
          oftS."transactionHash" AS "depositTxHash",
          oftS."blockNumber" AS "blockNumber",
          oftR."transactionHash" AS "fillTxHash",
          NULL::text AS "refundTxHash"
      FROM "evm"."oft_sent" oftS
      LEFT JOIN "evm"."oft_received" oftR ON oftR."guid" = oftS."guid"
    `);

    // Indices for OFT MV
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UIX_mv_oft_id" ON "evm"."mv_oft_deposits" ("original_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_mv_oft_timestamp" ON "evm"."mv_oft_deposits" ("timestamp" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_mv_oft_sender" ON "evm"."mv_oft_deposits" ("sender")`,
    );

    // ==========================================
    // 4. THE MASTER (STANDARD) VIEW
    // ==========================================
    await queryRunner.query(`
      CREATE VIEW "evm"."unified_deposits_view" AS
      SELECT * FROM "evm"."mv_across_deposits"
      UNION ALL
      SELECT * FROM "evm"."mv_cctp_deposits"
      UNION ALL
      SELECT * FROM "evm"."mv_oft_deposits"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW "evm"."unified_deposits_view"`);

    await queryRunner.query(`DROP MATERIALIZED VIEW "evm"."mv_oft_deposits"`);
    await queryRunner.query(`DROP MATERIALIZED VIEW "evm"."mv_cctp_deposits"`);
    await queryRunner.query(
      `DROP MATERIALIZED VIEW "evm"."mv_across_deposits"`,
    );
  }
}
