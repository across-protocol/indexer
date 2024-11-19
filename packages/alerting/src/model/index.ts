export type AlertingConfig = {
  slack: {
    webhookUrl?: string;
    enabled: boolean;
  };
};

export type SlackMessageHeaderBlock = {
  type: "header";
  text: {
    type: "plain_text";
    text: string;
    emoji: true;
  };
};

export type SlackMessageSectionBlock = {
  type: "section";
  text: {
    type: "mrkdwn";
    text: string;
  };
};

export type SlackMessageContextBlock = {
  type: "context";
  elements: {
    type: "plain_text";
    text: string;
  }[];
};

export type SlackMessageDividerBlock = {
  type: "divider";
};

export type SlackMessagePayload = {
  blocks: (
    | SlackMessageHeaderBlock
    | SlackMessageSectionBlock
    | SlackMessageContextBlock
    | SlackMessageDividerBlock
  )[];
};
