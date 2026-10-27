import { config } from "../config.js";
import { getAccessToken } from "./auth.js";

/**
 * A deliberately tiny HTTP wrapper. It does four things well:
 *  1. Always sends a bearer token.
 *  2. Always has a timeout (a hung request must never hang a payment decision).
 *  3. Attaches PayPal-Request-Id so retries are idempotent (no double charges).
 *  4. Returns `unknown`. Callers must validate with zod. We never trust
 *     external data's shape.
 */
export class PayPalError extends Error {
  constructor(
    public readonly status: number,
    public readonly debugId: string | undefined,
    public readonly body: unknown,
  ) {
    super(`PayPal API error ${status} (debug_id=${debugId ?? "n/a"})`);
    this.name = "PayPalError";
  }
}

export interface RequestOptions {
  body?: unknown;
  /** Same id on retry => PayPal treats it as the same operation. */
  requestId?: string;
}

export async function paypalRequest(
  method: "GET" | "POST",
  path: string,
  opts: RequestOptions = {},
): Promise<unknown> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;

  const res = await fetch(`${config.paypalApiBase}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });

  // 204 No Content (e.g. authorization void) has no body to parse.
  const text = await res.text();
  const json: unknown = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const debugId =
      (typeof json === "object" && json !== null && "debug_id" in json
        ? String((json as { debug_id: unknown }).debug_id)
        : undefined) ?? res.headers.get("paypal-debug-id") ?? undefined;
    throw new PayPalError(res.status, debugId, json);
  }
  return json;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
