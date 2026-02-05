import { Abi, parseEventLogs, TransactionReceipt, Log } from "viem";

/**
 * Request object for finding a preceding event.
 */
export interface FindPrecedingEventRequest<
  TMain extends { logIndex: number },
  TCandidate extends { logIndex: number },
  TBarrier extends { logIndex: number },
> {
  mainEvent: TMain;
  candidates: TCandidate[];
  barriers: TBarrier[];
}

/**
 * Finds the closest preceding candidate event where no barrier event exists in between.
 * @param request The request object containing mainEvent, candidates, and barriers.
 * @returns The matching candidate event or undefined if no match is found.
 */
export function findPrecedingEvent<
  TMain extends { logIndex: number },
  TCandidate extends { logIndex: number },
  TBarrier extends { logIndex: number },
>(
  request: FindPrecedingEventRequest<TMain, TCandidate, TBarrier>,
): TCandidate | undefined {
  const { mainEvent, candidates, barriers } = request;
  return candidates
    .filter((c) => c.logIndex < mainEvent.logIndex)
    .filter((c) => {
      // No barrier event should be between this candidate and our target main event
      return !barriers.some(
        (b) => b.logIndex > c.logIndex && b.logIndex < mainEvent.logIndex,
      );
    })
    .sort((a, b) => b.logIndex - a.logIndex)[0];
}

/**
 * Request object for finding a succeeding event.
 */
export interface FindSucceedingEventRequest<
  TMain extends { logIndex: number },
  TCandidate extends { logIndex: number },
  TBarrier extends { logIndex: number },
> {
  mainEvent: TMain;
  candidates: TCandidate[];
  barriers: TBarrier[];
}

/**
 * Finds the closest succeeding candidate event where no barrier event exists in between.
 * @param request The request object containing mainEvent, candidates, and barriers.
 * @returns The matching candidate event or undefined if no match is found.
 */
export function findSucceedingEvent<
  TMain extends { logIndex: number },
  TCandidate extends { logIndex: number },
  TBarrier extends { logIndex: number },
>(
  request: FindSucceedingEventRequest<TMain, TCandidate, TBarrier>,
): TCandidate | undefined {
  const { mainEvent, candidates, barriers } = request;
  return candidates
    .filter((c) => c.logIndex > mainEvent.logIndex)
    .filter((c) => {
      // No barrier event should be between our target main event and this candidate
      return !barriers.some(
        (b) => b.logIndex > mainEvent.logIndex && b.logIndex < c.logIndex,
      );
    })
    .sort((a, b) => a.logIndex - b.logIndex)[0];
}

/**
 * Request object for decoding events from a receipt.
 */
export interface DecodeEventsFromReceiptRequest {
  receipt: TransactionReceipt;
  abi: Abi;
  eventName: string;
}

/**
 * extracts and decodes a specific event from a transaction receipt's logs.
 * @param request The request object containing receipt, abi, and eventName.
 * @returns Array of objects containing the decoded event, log index, transaction hash, and full log.
 */
export const decodeEventsFromReceipt = <T>(
  request: DecodeEventsFromReceiptRequest,
): { event: T; logIndex: number; transactionHash: string; log: Log }[] => {
  const { receipt, abi, eventName } = request;
  const logs = parseEventLogs({
    abi,
    logs: receipt.logs,
  });
  return logs
    .filter((log) => log.eventName === eventName)
    .map((log) => ({
      event: log.args as T,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
      log: log as unknown as Log,
    }));
};

/**
 * Request object for finding a preceding event in a receipt.
 */
export interface FindPrecedingEventInReceiptRequest {
  receipt: TransactionReceipt;
  mainEvent: { logIndex: number };
  candidateAbi: Abi;
  candidateEventName: string;
  barrierAbi: Abi;
  barrierEventName: string;
}

/**
 * Generic function to find an event that occurred *before* the main event within the same transaction receipt.
 * Decodes both candidate and barrier events from the receipt.
 * @param request The request object containing receipt, mainEvent, candidate details, and barrier details.
 * @returns The matching candidate event or undefined.
 */
export const findPrecedingEventInReceipt = <TCandidateArgs, TBarrierArgs>(
  request: FindPrecedingEventInReceiptRequest,
) => {
  const {
    receipt,
    mainEvent,
    candidateAbi,
    candidateEventName,
    barrierAbi,
    barrierEventName,
  } = request;

  const candidateEvents = decodeEventsFromReceipt<TCandidateArgs>({
    receipt,
    abi: candidateAbi,
    eventName: candidateEventName,
  });

  const barrierEvents = decodeEventsFromReceipt<TBarrierArgs>({
    receipt,
    abi: barrierAbi,
    eventName: barrierEventName,
  });

  return findPrecedingEvent({
    mainEvent,
    candidates: candidateEvents,
    barriers: barrierEvents,
  });
};

/**
 * Request object for finding a succeeding event in a receipt.
 */
export interface FindSucceedingEventInReceiptRequest {
  receipt: TransactionReceipt;
  mainEvent: { logIndex: number };
  candidateAbi: Abi;
  candidateEventName: string;
  barrierAbi: Abi;
  barrierEventName: string;
}

/**
 * Generic function to find an event that occurred *after* the main event within the same transaction receipt.
 * Decodes both candidate and barrier events from the receipt.
 * @param request The request object containing receipt, mainEvent, candidate details, and barrier details.
 * @returns The matching candidate event or undefined.
 */
export const findSucceedingEventInReceipt = <TCandidateArgs, TBarrierArgs>(
  request: FindSucceedingEventInReceiptRequest,
) => {
  const {
    receipt,
    mainEvent,
    candidateAbi,
    candidateEventName,
    barrierAbi,
    barrierEventName,
  } = request;

  const candidateEvents = decodeEventsFromReceipt<TCandidateArgs>({
    receipt,
    abi: candidateAbi,
    eventName: candidateEventName,
  });

  const barrierEvents = decodeEventsFromReceipt<TBarrierArgs>({
    receipt,
    abi: barrierAbi,
    eventName: barrierEventName,
  });

  return findSucceedingEvent({
    mainEvent,
    candidates: candidateEvents,
    barriers: barrierEvents,
  });
};
