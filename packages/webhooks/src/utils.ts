import { NotificationPayload } from "./types";
export async function post(params: NotificationPayload): Promise<void> {
  const { url, data } = params;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to post to webhook: ${response.statusText}`);
  }
}

export function generateUniqueId(now = Date.now()): string {
  return `${now}-${Math.random().toString(36).substring(2, 11)}`;
}

export function asyncInterval(fn: () => Promise<void>, delay: number) {
  let isStopped = false;

  async function run() {
    while (!isStopped) {
      await fn();
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  run();

  return () => {
    isStopped = true;
  };
}
