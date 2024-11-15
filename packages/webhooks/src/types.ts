import * as ss from "superstruct";

export interface Webhook {
  id: string;
  url: string;
  filter: string;
}

export interface IEventProcessor {
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

export const RegistrationParams = ss.object({
  type: ss.string(),
  url: ss.string(),
  filter: ss.record(ss.string(), ss.unknown()),
});
export type RegistrationParams = ss.Infer<typeof RegistrationParams>;

export const UnregisterParams = ss.object({
  type: ss.string(),
  id: ss.string(),
});
export type UnregisterParams = ss.Infer<typeof UnregisterParams>;
