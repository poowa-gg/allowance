import { z } from "zod";
import { config } from "../config.js";

/**
 * PayPal uses OAuth2 "client credentials": we trade our client id + secret
 * for a short-lived bearer token. We cache it in memory and refresh a minute
 * early so a request never goes out with a token that dies mid-flight.
 */
const TokenResponse = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(), // seconds
});

let cached: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  const SKEW_MS = 60_000;
  if (cached && cached.expiresAt - SKEW_MS > Date.now()) return cached.token;

  const basic = Buffer.from(
    `${config.paypalClientId}:${config.paypalClientSecret}`,
  ).toString("base64");

  const res = await fetch(`${config.paypalApiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });

  if (!res.ok) {
    // Status only: the body could echo credentials back in some error paths.
    throw new Error(`PayPal auth failed: HTTP ${res.status}. Check client id/secret.`);
  }

  const data = TokenResponse.parse(await res.json());
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.token;
}
