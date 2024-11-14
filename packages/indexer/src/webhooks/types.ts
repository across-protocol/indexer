export interface Webhook {
  id: string;
  url: string;
  filter: string;
}

export interface IWebhook {
  write(event: JSONValue): void;
  register(url: string, params: JSONValue): Promise<string>;
  unregister(id: string): Promise<void>;
}

export type JSONValue =
  | string
  | number
  | boolean
  | { [x: string]: JSONValue }
  | Array<JSONValue>
  | null;

export type NotificationPayload = {
  url: string;
  event: JSONValue;
};
