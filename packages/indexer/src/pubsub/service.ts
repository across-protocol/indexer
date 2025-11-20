import { PubSub, Topic } from "@google-cloud/pubsub";
import { Config } from "../parseEnv";

/**
 * Helper class to publish messages to a GCP pubsub topic.
 */
export class PubSubService {
  private readonly pubSub: PubSub;
  private cctpFinalizerTopic: Topic;

  constructor(private readonly config: Config) {
    this.pubSub = new PubSub({
      projectId: this.config.pubSubGcpProjectId,
    });
  }

  async publishCctpFinalizerMessage(
    burnTransactionHash: string,
    sourceChainId: number,
    message: string,
    attestation: string,
    destinationChainId: number,
    signature?: string,
  ) {
    if (!this.cctpFinalizerTopic) {
      const topic = this.pubSub.topic(this.config.pubSubCctpFinalizerTopic);
      this.cctpFinalizerTopic = topic;
    }
    // the published payload is a base64 encoded JSON string. The JSON is
    // validated by the Avro schema defined in GCP
    // Avro union types must be encoded as objects with the type name as key
    const payload = Buffer.from(
      JSON.stringify({
        burnTransactionHash: burnTransactionHash,
        sourceChainId: sourceChainId,
        message: message != null ? { string: message } : null,
        attestation: attestation != null ? { string: attestation } : null,
        destinationChainId:
          destinationChainId != null ? { long: destinationChainId } : null,
        signature: signature != null ? { string: signature } : null,
      }),
    );
    await this.cctpFinalizerTopic.publishMessage({ data: payload });
  }
}
