import { DateTime } from "luxon";
import { SlackMessageHeaderBlock, SlackMessageSectionBlock } from "../model";

export class SlackMessageFormatter {
  static formatMessage({
    header,
    messages,
  }: {
    header?: string;
    messages?: any[];
  }) {
    const date = DateTime.now().toFormat("yyyy-LL-dd HH:mm:ss");
    let payload = { blocks: [] as any };

    if (header) {
      const headerBlock: SlackMessageHeaderBlock = {
        type: "header",
        text: {
          type: "plain_text",
          text: header,
          emoji: true,
        },
      };
      payload.blocks.push(headerBlock);
    }

    if (messages) {
      for (const message of messages) {
        const sectionBlock: SlackMessageSectionBlock = {
          type: "section",
          text: { type: "mrkdwn", text: message },
        };
        payload.blocks.push(sectionBlock);
      }
    }

    payload.blocks.push({
      type: "context",
      elements: [
        {
          type: "plain_text",
          text: `:clock1: ${date}`,
          emoji: true,
        },
      ],
    });

    payload.blocks.push({
      type: "divider",
    });

    return payload;
  }
}
