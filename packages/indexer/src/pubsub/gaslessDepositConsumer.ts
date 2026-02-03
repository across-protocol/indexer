import { PubSub } from "@google-cloud/pubsub";
import type { Message } from "@google-cloud/pubsub";
import type { DataSource } from "typeorm";
import type { Logger } from "winston";

import { GaslessDeposit } from "@repo/indexer-database";
import type { Config } from "../parseEnv";

interface GaslessDepositPayload {
  swapTx?: {
    chainId?: number;
    data?: {
      depositId?: string;
      witness?: unknown;
    };
  };
}

function getDestinationChainIdFromWitness(
  witness: unknown,
): number | undefined {
  if (witness == null) return undefined;

  type WitnessEntry = {
    data?: {
      baseDepositData?: { destinationChainId?: number };
      depositData?: { destinationChainId?: number };
    };
  };
  const record = witness as Record<string, WitnessEntry>;

  if (!Array.isArray(witness)) {
    return (
      record["BridgeWitness"]?.data?.baseDepositData?.destinationChainId ??
      record["BridgeAndSwapWitness"]?.data?.depositData?.destinationChainId
    );
  }

  const first = record[0];
  return (
    first?.data?.baseDepositData?.destinationChainId ??
    first?.data?.depositData?.destinationChainId
  );
}

/**
 * Pull consumer for the gasless-deposit-created PubSub topic.
 * Subscribes to the configured subscription and processes each message.
 * Persists originChainId, destinationChainId, and depositId to the gasless_deposit table.
 */
export class GaslessDepositPubSubConsumer {
  private subscription: ReturnType<PubSub["subscription"]> | null = null;
  private pubSub: PubSub | null = null;

  constructor(
    private readonly config: Config,
    private readonly logger: Logger,
    private readonly postgres: DataSource,
  ) {}

  /**
   * Start pulling messages from the gasless deposit subscription.
   * No-op if consumer is disabled or subscription name is missing.
   */
  async start(): Promise<void> {
    if (!this.config.enableGaslessDepositPubSubConsumer) {
      this.logger.info({
        at: "GaslessDepositPubSubConsumer#start",
        message: "Gasless deposit PubSub consumer is disabled",
      });
      return;
    }

    const subName = this.config.pubSubGaslessDepositSubscription?.trim();
    if (!subName) {
      this.logger.warn({
        at: "GaslessDepositPubSubConsumer#start",
        message:
          "Gasless deposit PubSub consumer enabled but PUBSUB_GASLESS_DEPOSIT_SUBSCRIPTION is not set",
      });
      return;
    }

    if (!this.config.pubSubGcpProjectId) {
      this.logger.warn({
        at: "GaslessDepositPubSubConsumer#start",
        message:
          "Gasless deposit PubSub consumer enabled but PUBSUB_GCP_PROJECT_ID is not set",
      });
      return;
    }

    this.pubSub = new PubSub({
      projectId: this.config.pubSubGcpProjectId,
    });

    this.subscription = this.pubSub.subscription(subName);

    this.subscription.on("message", (message: Message) => {
      this.handleMessage(message).catch((err) => {
        this.logger.error({
          at: "GaslessDepositPubSubConsumer#handleMessage",
          message: "Error processing gasless deposit message",
          messageId: message.id,
          error: err,
        });
        message.nack();
      });
    });

    this.subscription.on("error", (err: Error) => {
      this.logger.error({
        at: "GaslessDepositPubSubConsumer",
        message: "Subscription error",
        error: err,
      });
    });

    this.subscription.on("close", () => {
      this.logger.info({
        at: "GaslessDepositPubSubConsumer",
        message: "Gasless deposit subscription closed",
      });
    });

    this.logger.info({
      at: "GaslessDepositPubSubConsumer#start",
      message: "Gasless deposit PubSub consumer started",
      subscription: subName,
    });
  }

  /**
   * Extract originChainId, destinationChainId, and depositId from the GCP message payload.
   * Returns null if any required field is missing.
   */
  private static extractGaslessDepositFields(payload: unknown): {
    originChainId: string;
    destinationChainId: string;
    depositId: string;
  } | null {
    const p = payload as GaslessDepositPayload;
    const swapTx = p?.swapTx;
    const data = swapTx?.data;
    const originChainId = swapTx?.chainId;
    const depositId = data?.depositId;
    const destinationChainId = getDestinationChainIdFromWitness(data?.witness);
    if (
      originChainId == null ||
      depositId == null ||
      destinationChainId == null
    ) {
      return null;
    }
    return {
      originChainId: String(originChainId),
      destinationChainId: String(destinationChainId),
      depositId: String(depositId),
    };
  }

  /**
   * Process a single message: parse payload, persist to gasless_deposit table, then ack.
   */
  private async handleMessage(message: Message): Promise<void> {
    const raw = message.data?.toString("utf8") ?? "";
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      this.logger.warn({
        at: "GaslessDepositPubSubConsumer#handleMessage",
        message: "Invalid JSON in gasless deposit message",
        messageId: message.id,
        rawLength: raw.length,
      });
      message.ack();
      return;
    }

    const fields =
      GaslessDepositPubSubConsumer.extractGaslessDepositFields(payload);
    if (!fields) {
      this.logger.warn({
        at: "GaslessDepositPubSubConsumer#handleMessage",
        message:
          "Gasless deposit message missing required fields (originChainId, destinationChainId, depositId)",
        messageId: message.id,
      });
      message.ack();
      return;
    }

    this.logger.debug({
      at: "GaslessDepositPubSubConsumer#handleMessage",
      message: "Pulled gasless deposit message from Pub/Sub",
      messageId: message.id,
      ...fields,
    });

    try {
      const repo = this.postgres.getRepository(GaslessDeposit);
      await repo
        .createQueryBuilder()
        .insert()
        .into(GaslessDeposit)
        .values({
          originChainId: fields.originChainId,
          destinationChainId: fields.destinationChainId,
          depositId: fields.depositId,
        })
        .orIgnore()
        .execute();
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code: string }).code
          : undefined;
      if (code === "23505") {
        this.logger.debug({
          at: "GaslessDepositPubSubConsumer#handleMessage",
          message: "Gasless deposit already stored (duplicate), skipping",
          messageId: message.id,
          ...fields,
        });
      } else {
        throw err;
      }
    }

    this.logger.debug({
      at: "GaslessDepositPubSubConsumer#handleMessage",
      message: "Stored gasless deposit",
      messageId: message.id,
      ...fields,
    });
    message.ack();
  }

  /**
   * Stop the consumer and release the subscription. Idempotent.
   */
  async close(): Promise<void> {
    if (!this.subscription) {
      return;
    }

    try {
      await this.subscription.close();
      this.logger.info({
        at: "GaslessDepositPubSubConsumer#close",
        message: "Gasless deposit PubSub consumer closed",
      });
    } catch (err) {
      this.logger.error({
        at: "GaslessDepositPubSubConsumer#close",
        message: "Error closing gasless deposit subscription",
        error: err,
      });
    } finally {
      this.subscription = null;
      this.pubSub = null;
    }
  }
}
