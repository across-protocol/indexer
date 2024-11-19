# Alerting package

This package is used to send messages to a Slack channel.

## Usage

```ts
const alertingService = new AlertingService({
    slack: {
        enabled: true | false,
        webhookUrl: <SLACK_WEBHOOK_URL>
    }
}, logger);
await alertingService.postMessageOnSlack({
    header: "My custom header",
    messages: ["My custom paragraph 1", "My custom paragraph 2"]
});
```
