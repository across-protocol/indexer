export async function post(url: string, data: any): Promise<void> {
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
