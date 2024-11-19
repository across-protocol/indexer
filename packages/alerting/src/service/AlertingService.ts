import { Logger } from "winston";
import axios from "axios";
import { AlertingConfig, SlackMessagePayload } from "../model";

export class AlertingService {
  constructor(
    private config: AlertingConfig,
    private logger: Logger,
  ) {}

  public async postMessageOnSlack(payload: SlackMessagePayload) {
    const { enabled, webhookUrl } = this.config.slack;

    if (!enabled) {
      this.logger.warn({
        at: "AlertingService#postMessageOnSlack",
        message: "Slack webhook is not enabled",
      });
      return;
    }

    if (!webhookUrl) {
      this.logger.error({
        at: "AlertingService#postMessageOnSlack",
        message: "Slack webhook URL is not set",
      });
      throw new Error("Slack webhook URL is not set");
    }
    this.logger.debug({
      at: "AlertingService#postMessageOnSlack",
      message: "Posting message on slack",
      payload,
    });
    const response = await axios.post(webhookUrl, payload);
  }
}
