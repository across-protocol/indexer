import { PubSub } from "@google-cloud/pubsub";
import type { Message } from "@google-cloud/pubsub";
import type { Logger } from "winston";

import type { Config } from "../parseEnv";

/**
 * Pull consumer for the gasless-deposit-created PubSub topic.
 * Subscribes to the configured subscription and processes each message.
 * Status tracking (deposit-pending, deposit-failed, fill-pending, filled) can be
 * implemented in the message handler once storage is ready.
 */
export class GaslessDepositPubSubConsumer {
  private subscription: ReturnType<PubSub["subscription"]> | null = null;
  private pubSub: PubSub | null = null;

  constructor(
    private readonly config: Config,
    private readonly logger: Logger,
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
   * Process a single message. Today we log and ack; later this will validate,
   * persist with status, and then ack.
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

    this.logger.debug({
      at: "GaslessDepositPubSubConsumer#handleMessage",
      message: "Received gasless deposit message",
      messageId: message.id,
      payload,
    });

    // TODO: validate payload, store gasless deposit with status (e.g. deposit-pending), then ack
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
