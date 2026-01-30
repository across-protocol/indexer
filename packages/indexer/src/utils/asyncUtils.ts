/**
 * Delays execution for a specified duration, but resolves immediately if the abort signal is triggered.
 * This ensures that we don't hold up the process if a shutdown is requested during a backoff or delay.
 * @param ms Duration to wait in milliseconds
 * @param signal Optional AbortSignal to listen for cancellation
 */
export function delayWithAbort(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      resolve(); // Resolve immediately on abort
    };

    signal?.addEventListener("abort", onAbort);
  });
}
