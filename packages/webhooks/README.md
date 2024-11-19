# Webhooks Module

This module provides a comprehensive system for managing webhooks within the indexer package. It includes components for creating, registering, and notifying webhooks, as well as handling notifications and retries.

# Indexer Usage

The `factory.ts` file provides a `WebhookFactory` function that sets up the webhooks system. This function initializes the necessary components and returns an object containing the webhooks manager, express application, and notifier. Here's how you can use it:

### Configuration

To use the `WebhookFactory`, you need to provide a configuration object and dependencies:

- **Config**: This object should include:
  - requireApiKey: boolean; - Should registration of new webhooks require an api key
  - enabledWebhooks: WebhookTypes[]; - What event processors should be enabled, like 'DepositStatus'

- **Dependencies**: This object should include:
  - `postgres`: An instance of `DataSource` for database interactions.
  - `logger`: An instance of `Logger` for logging purposes.

### Adding an event Example

```js
import { WebhookFactory, WebhookTypes } from "@repo/webhooks";
import { Logger } from "winston";
import { DataSource } from "@repo/indexer-database";

  const webhooks = WebhookFactory(
    {
      requireApiKey: false,
      enableWebhooks: [WebhookTypes.DepositStatus],
    },
    { postgres, logger },
  );

// respond to some event in the form:
// type EventType = {
//     type:string,
//     event:JSONValue
// }
// webhooks will be called after a successful write
webhooks.write({
  type: "DepositStatus",
  event: {
    originChainId,
    depositTxHash,
    depositId,
    status,
  },
});


// Connecting the router to express app
// It will automatically create a /webhooks route to POST to to create hook
const app = express();
app.use("/", webhooks.router);

```

# Webhooks API Documentation

This document provides an overview of how to interact with the Webhooks API provided by the indexer package.

## Base URL

The base URL for the webhooks API is determined by the express server configuration. For example, if the server is running on port 3000, the base URL would be:

```
http://localhost:3000
```

## Endpoints

### Register a New Webhook

**Endpoint:** `/webhook`  
**Method:** `POST`  
**Description:** Register a new webhook to receive notifications.

**Request Body:**

- `type` (string): The type of webhook to register, e.g., `DepositStatus`.
- `url` (string): The URL where notifications should be sent.
- `filters` (object, optional): Any filters to apply to the notifications.
- `access_token` (string, optional): A valid API key if authentication is required.

**Example Request:**

```js
{
  "type": "DepositStatus",
  "url": "https://example.com/webhook",
  "filters": {
    originChainId: number,
    depositTxHash: string,
  },
}
// Example using fetch with API key as Bearer token in header
fetch('http://localhost:3000/webhook', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-api-key'
  },
  body: JSON.stringify({
    type: 'DepositStatus',
    url: 'https://example.com/webhook',
    filters: {
      originChainId: 1,
      depositTxHash: '0x123...'
    }
  })
})
.then(response => {
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
})
.then(data => console.log('Webhook registered successfully:', data))
.catch(error => console.error('There was a problem with the fetch operation:', error));

```

**Response:**

- `200 OK`: Webhook registered successfully.
- `400 Bad Request`: Missing or invalid parameters.
- `401 Unauthorized`: Invalid API key.
