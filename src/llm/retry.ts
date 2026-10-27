import type { FetchLike } from "./types.js";

export interface RetryOptions {
  maxRetries?: number;
  /** Injectable so tests do not really wait. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POSTs JSON and retries the failures that are normal on free or busy AI services:
 *   429 (rate limited: we wait as long as the server asks), 5xx / 529 (server trouble),
 *   and 400 "tool_use_failed" (open models sometimes write a malformed tool call; trying again usually works).
 * Anything else (bad key, bad request) fails immediately with the provider's own message.
 */
export async function postJson(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
  body: string,
  label: string,
  opts: RetryOptions = {},
): Promise<unknown> {
  const maxRetries = opts.maxRetries ?? 3;
  const sleep = opts.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, { method: "POST", headers, body, signal: AbortSignal.timeout(60_000) });
    if (res.ok) return res.json();

    const detail = (await res.text().catch(() => "")).slice(0, 240); // never contains our key
    const retriable = res.status === 429 || res.status === 529 || res.status >= 500 || (res.status === 400 && detail.includes("tool_use_failed"));
    if (!retriable || attempt >= maxRetries) throw new Error(`${label} error ${res.status}: ${detail}`);

    const asked = Number(res.headers?.get("retry-after"));
    const wait = Number.isFinite(asked) && asked > 0 ? Math.min(asked * 1000, 20_000) : (res.status === 429 ? 3000 : 1000) * (attempt + 1);
    await sleep(wait);
  }
}
