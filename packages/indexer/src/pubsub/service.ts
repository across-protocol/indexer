import axios from "axios";
import { Config } from "../parseEnv";

/**
 * Helper class to publish messages to a GCP pubsub topic.
 */
export class PubSubService {
  constructor(private readonly config: Config) {}

  async publishCctpFinalizerMessage(
    burnTransactionHash: string,
    sourceChainId: number,
  ) {
    // the published payload is a base64 encoded JSON string. The JSON is
    // validated by the Avro schema defined in GCP
    const payload = Buffer.from(
      JSON.stringify({
        burnTransactionHash: burnTransactionHash,
        sourceChainId,
      }),
    ).toString("base64");
    const body = { messages: [{ data: payload }] };
    const response = await axios.post(this.config.finalizerPubSubTopic, body, {
      headers: {
        "Content-Type": "application/json",
        // TODO: this authorization method is temporary for local testing.
        // It must be replaced with a proper authentication method.
        Authorization: `Bearer <AUTH_TOKEN>`,
      },
    });

    return response.data;
  }
}
