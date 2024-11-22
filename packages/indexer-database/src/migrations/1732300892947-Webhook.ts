import { MigrationInterface, QueryRunner } from "typeorm";

export class Webhook1732300892947 implements MigrationInterface {
  name = "Webhook1732300892947";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evm"."root_bundle_canceled" ("id" SERIAL NOT NULL, "caller" character varying NOT NULL, "requestTime" TIMESTAMP NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "blockNumber" integer NOT NULL, "finalised" boolean NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_rootBundleCanceled_txHash" UNIQUE ("transactionHash"), CONSTRAINT "PK_97a84a7224c26da0f0d5dc24b6a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "evm"."root_bundle_executed" ("id" SERIAL NOT NULL, "leafId" integer NOT NULL, "groupIndex" integer NOT NULL, "chainId" integer NOT NULL, "l1Tokens" jsonb NOT NULL, "bundleLpFees" jsonb NOT NULL, "netSendAmounts" jsonb NOT NULL, "runningBalances" jsonb NOT NULL, "caller" character varying NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "blockNumber" integer NOT NULL, "finalised" boolean NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_rootBundleExecuted_chain_leaf_groupIdx_txHash" UNIQUE ("chainId", "leafId", "groupIndex", "transactionHash"), CONSTRAINT "PK_a3b0c39415b0b42afa7bd78075e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "evm"."root_bundle_disputed" ("id" SERIAL NOT NULL, "disputer" character varying NOT NULL, "requestTime" TIMESTAMP NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "blockNumber" integer NOT NULL, "finalised" boolean NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_rootBundleDisputed_txHash" UNIQUE ("transactionHash"), CONSTRAINT "PK_93937e629b5c5c1471049bce3c4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "bundle_block_range" ("id" SERIAL NOT NULL, "bundleId" integer NOT NULL, "chainId" integer NOT NULL, "startBlock" integer NOT NULL, "endBlock" integer NOT NULL, CONSTRAINT "UK_bundleBlockRange_bundleId_chainId" UNIQUE ("bundleId", "chainId"), CONSTRAINT "PK_903331c592ac44aaf237755fd8b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bundle_event_type_enum" AS ENUM('deposit', 'expiredDeposit', 'fill', 'slowFill', 'unexecutableSlowFill')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bundle_event" ("id" SERIAL NOT NULL, "bundleId" integer NOT NULL, "type" "public"."bundle_event_type_enum" NOT NULL, "relayHash" character varying NOT NULL, "repaymentChainId" integer, CONSTRAINT "UK_bundleEvent_eventType_relayHash" UNIQUE ("type", "relayHash"), CONSTRAINT "PK_d633122fa4b52768e1b588bddee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bundle_status_enum" AS ENUM('Proposed', 'Canceled', 'Disputed', 'Executed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bundle" ("id" SERIAL NOT NULL, "poolRebalanceRoot" character varying NOT NULL, "relayerRefundRoot" character varying NOT NULL, "slowRelayRoot" character varying NOT NULL, "proposalId" integer NOT NULL, "cancelationId" integer, "disputeId" integer, "status" "public"."bundle_status_enum" NOT NULL DEFAULT 'Proposed', "eventsAssociated" boolean NOT NULL DEFAULT false, CONSTRAINT "REL_a8344aa79161a63b6397cc8006" UNIQUE ("proposalId"), CONSTRAINT "REL_d728c78130d07f0857ca9d08f4" UNIQUE ("cancelationId"), CONSTRAINT "REL_707430c410bc8a69af9432bedf" UNIQUE ("disputeId"), CONSTRAINT "PK_637e3f87e837d6532109c198dea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "evm"."proposed_root_bundle" ("id" SERIAL NOT NULL, "challengePeriodEndTimestamp" TIMESTAMP NOT NULL, "poolRebalanceLeafCount" integer NOT NULL, "bundleEvaluationBlockNumbers" jsonb NOT NULL, "chainIds" jsonb NOT NULL, "poolRebalanceRoot" character varying NOT NULL, "relayerRefundRoot" character varying NOT NULL, "slowRelayRoot" character varying NOT NULL, "proposer" character varying NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "blockNumber" integer NOT NULL, "finalised" boolean NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_proposedRootBundle_txHash" UNIQUE ("transactionHash"), CONSTRAINT "PK_61f8cd3411bf1976fdb13dca607" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "evm"."set_pool_rebalance_route" ("id" SERIAL NOT NULL, "destinationChainId" integer NOT NULL, "l1Token" character varying NOT NULL, "destinationToken" character varying NOT NULL, "blockNumber" integer NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "finalised" boolean NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_spr_transactionHash_transactionIndex_logIndex" UNIQUE ("transactionHash", "transactionIndex", "logIndex"), CONSTRAINT "PK_93edcf0d94f29e5cd34513baf9d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "evm"."v3_funds_deposited" ("id" SERIAL NOT NULL, "relayHash" character varying NOT NULL, "depositId" integer NOT NULL, "originChainId" integer NOT NULL, "destinationChainId" integer NOT NULL, "fromLiteChain" boolean NOT NULL, "toLiteChain" boolean NOT NULL, "depositor" character varying NOT NULL, "recipient" character varying NOT NULL, "inputToken" character varying NOT NULL, "inputAmount" character varying NOT NULL, "outputToken" character varying NOT NULL, "outputAmount" character varying NOT NULL, "message" character varying NOT NULL, "exclusiveRelayer" character varying NOT NULL, "exclusivityDeadline" TIMESTAMP, "fillDeadline" TIMESTAMP NOT NULL, "quoteTimestamp" TIMESTAMP NOT NULL, "quoteBlockNumber" integer NOT NULL, "integratorId" character varying, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "blockNumber" integer NOT NULL, "finalised" boolean NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_v3FundsDeposited_depositId_originChainId" UNIQUE ("depositId", "originChainId"), CONSTRAINT "PK_7fb4637d005c1caba823aefdbd1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "evm"."filled_v3_relay_filltype_enum" AS ENUM('0', '1', '2')`,
    );
    await queryRunner.query(
      `CREATE TABLE "evm"."filled_v3_relay" ("id" SERIAL NOT NULL, "relayHash" character varying NOT NULL, "depositId" integer NOT NULL, "originChainId" integer NOT NULL, "destinationChainId" integer NOT NULL, "depositor" character varying NOT NULL, "recipient" character varying NOT NULL, "inputToken" character varying NOT NULL, "inputAmount" character varying NOT NULL, "outputToken" character varying NOT NULL, "outputAmount" character varying NOT NULL, "message" character varying NOT NULL, "exclusiveRelayer" character varying NOT NULL, "exclusivityDeadline" TIMESTAMP, "fillDeadline" TIMESTAMP NOT NULL, "updatedRecipient" character varying NOT NULL, "updatedMessage" character varying NOT NULL, "updatedOutputAmount" character varying NOT NULL, "fillType" "evm"."filled_v3_relay_filltype_enum" NOT NULL, "relayer" character varying NOT NULL, "repaymentChainId" integer NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "blockNumber" integer NOT NULL, "finalised" boolean NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_filledV3Relay_relayHash" UNIQUE ("relayHash"), CONSTRAINT "PK_8f1cc6f89a5ed042e3ed258d400" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "evm"."requested_v3_slow_fill" ("id" SERIAL NOT NULL, "relayHash" character varying NOT NULL, "depositId" integer NOT NULL, "originChainId" integer NOT NULL, "destinationChainId" integer NOT NULL, "depositor" character varying NOT NULL, "recipient" character varying NOT NULL, "inputToken" character varying NOT NULL, "inputAmount" character varying NOT NULL, "outputToken" character varying NOT NULL, "outputAmount" character varying NOT NULL, "message" character varying NOT NULL, "exclusiveRelayer" character varying NOT NULL, "exclusivityDeadline" TIMESTAMP, "fillDeadline" TIMESTAMP NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "blockNumber" integer NOT NULL, "finalised" boolean NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_requestedV3SlowFill_relayHash" UNIQUE ("relayHash"), CONSTRAINT "PK_ef6d61ccd9e937b8a798ad82d3c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "evm"."requested_speed_up_v3_deposit" ("id" SERIAL NOT NULL, "originChainId" integer NOT NULL, "depositId" integer NOT NULL, "depositor" character varying NOT NULL, "updatedRecipient" character varying NOT NULL, "updatedMessage" character varying NOT NULL, "updatedOutputAmount" character varying NOT NULL, "depositorSignature" character varying NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "finalised" boolean NOT NULL, "blockNumber" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_speedUpV3_depositId_originChain_txHash_logIdx" UNIQUE ("depositId", "originChainId", "transactionHash", "logIndex"), CONSTRAINT "PK_92225be4f84268c26a66b4eaa17" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "evm"."relayed_root_bundle" ("id" SERIAL NOT NULL, "chainId" integer NOT NULL, "rootBundleId" integer NOT NULL, "relayerRefundRoot" character varying NOT NULL, "slowRelayRoot" character varying NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "blockNumber" integer NOT NULL, "finalised" boolean NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_relayedRootBundle_chainId_rootBundleId" UNIQUE ("chainId", "rootBundleId"), CONSTRAINT "PK_b95beeb64004ee791b2195aaa80" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "evm"."executed_relayer_refund_root" ("id" SERIAL NOT NULL, "chainId" integer NOT NULL, "rootBundleId" integer NOT NULL, "leafId" integer NOT NULL, "l2TokenAddress" character varying NOT NULL, "amountToReturn" character varying NOT NULL, "refundAmounts" jsonb NOT NULL, "refundAddresses" jsonb NOT NULL, "caller" character varying NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "blockNumber" integer NOT NULL, "finalised" boolean NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_executedRelayerRefundRoot_chain_rootBundle_leaf" UNIQUE ("chainId", "rootBundleId", "leafId"), CONSTRAINT "PK_9785720b5a11005f37d894fd412" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "evm"."tokens_bridged" ("id" SERIAL NOT NULL, "chainId" integer NOT NULL, "leafId" integer NOT NULL, "l2TokenAddress" character varying NOT NULL, "amountToReturn" character varying NOT NULL, "caller" character varying NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "blockNumber" integer NOT NULL, "finalised" boolean NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_tokensBridged_chain_leaf_l2Token_txHash" UNIQUE ("chainId", "leafId", "l2TokenAddress", "transactionHash"), CONSTRAINT "PK_ca5a436f7fabd6c700cb7327415" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."relay_hash_info_status_enum" AS ENUM('unfilled', 'filled', 'slowFillRequested', 'slowFilled', 'expired', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "relay_hash_info" ("id" SERIAL NOT NULL, "relayHash" character varying NOT NULL, "depositId" integer NOT NULL, "originChainId" integer NOT NULL, "destinationChainId" integer NOT NULL, "depositTxHash" character varying, "depositEventId" integer, "fillTxHash" character varying, "fillEventId" integer, "slowFillRequestEventId" integer, "fillDeadline" TIMESTAMP NOT NULL, "status" "public"."relay_hash_info_status_enum" NOT NULL DEFAULT 'unfilled', "depositRefundTxHash" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UK_relayHashInfo_relayHash" UNIQUE ("relayHash"), CONSTRAINT "REL_4e5fd1998c43638a6e836a3636" UNIQUE ("depositEventId"), CONSTRAINT "REL_8aec45003aaa82a8550b9a1535" UNIQUE ("fillEventId"), CONSTRAINT "REL_37cf938a3a02547d23e967867a" UNIQUE ("slowFillRequestEventId"), CONSTRAINT "PK_cb69f68900aa0ce2756f103692f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "webhook_request" ("id" character varying NOT NULL, "url" character varying NOT NULL, "filter" character varying NOT NULL, "clientId" text, CONSTRAINT "PK_67a7784045de2d1b7139b611b93" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "webhook_client" ("name" character varying NOT NULL, "id" SERIAL NOT NULL, "apiKey" character varying NOT NULL, "domains" jsonb NOT NULL, CONSTRAINT "UQ_242a96416f14915efcdecda3bd8" UNIQUE ("apiKey"), CONSTRAINT "PK_f7330fb3bdb2e19534eae691d44" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "bundle_executions" ("bundleId" integer NOT NULL, "executionId" integer NOT NULL, CONSTRAINT "PK_d781edd9ee5d58baab40ec27585" PRIMARY KEY ("bundleId", "executionId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7ac73eb154127e8d68b3a881e7" ON "bundle_executions" ("bundleId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9551b3ed2ed4a9cf286637e51f" ON "bundle_executions" ("executionId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_block_range" ADD CONSTRAINT "FK_f5c43af2e3e71193090d4f37285" FOREIGN KEY ("bundleId") REFERENCES "bundle"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_event" ADD CONSTRAINT "FK_62dcd4f6f0d1713fab0c8542dba" FOREIGN KEY ("bundleId") REFERENCES "bundle"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle" ADD CONSTRAINT "FK_bundle_rootBundleProposeId" FOREIGN KEY ("proposalId") REFERENCES "evm"."proposed_root_bundle"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle" ADD CONSTRAINT "FK_bundle_rootBundleCanceledId" FOREIGN KEY ("cancelationId") REFERENCES "evm"."root_bundle_canceled"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle" ADD CONSTRAINT "FK_bundle_rootBundleDisputedId" FOREIGN KEY ("disputeId") REFERENCES "evm"."root_bundle_disputed"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
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
    await queryRunner.query(
      `ALTER TABLE "bundle_executions" ADD CONSTRAINT "FK_7ac73eb154127e8d68b3a881e7c" FOREIGN KEY ("bundleId") REFERENCES "bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_executions" ADD CONSTRAINT "FK_9551b3ed2ed4a9cf286637e51fa" FOREIGN KEY ("executionId") REFERENCES "evm"."root_bundle_executed"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bundle_executions" DROP CONSTRAINT "FK_9551b3ed2ed4a9cf286637e51fa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_executions" DROP CONSTRAINT "FK_7ac73eb154127e8d68b3a881e7c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP CONSTRAINT "FK_relayHashInfo_slowFillRequestEventId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP CONSTRAINT "FK_relayHashInfo_fillEventId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "relay_hash_info" DROP CONSTRAINT "FK_relayHashInfo_depositEventId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle" DROP CONSTRAINT "FK_bundle_rootBundleDisputedId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle" DROP CONSTRAINT "FK_bundle_rootBundleCanceledId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle" DROP CONSTRAINT "FK_bundle_rootBundleProposeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_event" DROP CONSTRAINT "FK_62dcd4f6f0d1713fab0c8542dba"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bundle_block_range" DROP CONSTRAINT "FK_f5c43af2e3e71193090d4f37285"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9551b3ed2ed4a9cf286637e51f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7ac73eb154127e8d68b3a881e7"`,
    );
    await queryRunner.query(`DROP TABLE "bundle_executions"`);
    await queryRunner.query(`DROP TABLE "webhook_client"`);
    await queryRunner.query(`DROP TABLE "webhook_request"`);
    await queryRunner.query(`DROP TABLE "relay_hash_info"`);
    await queryRunner.query(`DROP TYPE "public"."relay_hash_info_status_enum"`);
    await queryRunner.query(`DROP TABLE "evm"."tokens_bridged"`);
    await queryRunner.query(`DROP TABLE "evm"."executed_relayer_refund_root"`);
    await queryRunner.query(`DROP TABLE "evm"."relayed_root_bundle"`);
    await queryRunner.query(`DROP TABLE "evm"."requested_speed_up_v3_deposit"`);
    await queryRunner.query(`DROP TABLE "evm"."requested_v3_slow_fill"`);
    await queryRunner.query(`DROP TABLE "evm"."filled_v3_relay"`);
    await queryRunner.query(`DROP TYPE "evm"."filled_v3_relay_filltype_enum"`);
    await queryRunner.query(`DROP TABLE "evm"."v3_funds_deposited"`);
    await queryRunner.query(`DROP TABLE "evm"."set_pool_rebalance_route"`);
    await queryRunner.query(`DROP TABLE "evm"."proposed_root_bundle"`);
    await queryRunner.query(`DROP TABLE "bundle"`);
    await queryRunner.query(`DROP TYPE "public"."bundle_status_enum"`);
    await queryRunner.query(`DROP TABLE "bundle_event"`);
    await queryRunner.query(`DROP TYPE "public"."bundle_event_type_enum"`);
    await queryRunner.query(`DROP TABLE "bundle_block_range"`);
    await queryRunner.query(`DROP TABLE "evm"."root_bundle_disputed"`);
    await queryRunner.query(`DROP TABLE "evm"."root_bundle_executed"`);
    await queryRunner.query(`DROP TABLE "evm"."root_bundle_canceled"`);
  }
}
