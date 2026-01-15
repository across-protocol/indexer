import { IndexerEventPayload } from "./genericEventListening";

export const extractRawArgs = <TEvent>(
  payload: IndexerEventPayload,
): TEvent => {
  const rawArgs = (payload.log as any).args;

  if (!rawArgs) {
    throw new Error(
      `Event missing 'args'. Payload: ${JSON.stringify(payload)}`,
    );
  }

  return rawArgs as TEvent;
};
