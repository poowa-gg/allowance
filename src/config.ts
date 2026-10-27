import "dotenv/config";
import { z } from "zod";

/**
 * WHY THIS FILE EXISTS
 * Every bug that comes from a missing/typo'd env var shows up far from its cause.
 * We validate once, at startup, and crash loudly with a clear message.
 * This is "fail closed" applied to configuration.
 *
 * WHY z.literal("sandbox")
 * This is a payment-control product. During the hackathon it must be
 * physically impossible to point it at live money by a config mistake.
 * Judges love this kind of deliberate safety constraint; mention it in the demo.
 */
const EnvSchema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(10, "PAYPAL_CLIENT_ID missing or too short"),
  PAYPAL_CLIENT_SECRET: z.string().min(10, "PAYPAL_CLIENT_SECRET missing or too short"),
  PAYPAL_ENV: z.literal("sandbox").default("sandbox"),
});

function loadConfig() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Print field names + messages only. Never print values (they may be secrets).
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`Invalid environment configuration:\n${problems}`);
    process.exit(1);
  }
  return parsed.data;
}

const env = loadConfig();

export const config = Object.freeze({
  paypalClientId: env.PAYPAL_CLIENT_ID,
  paypalClientSecret: env.PAYPAL_CLIENT_SECRET,
  paypalApiBase: "https://api-m.sandbox.paypal.com",
  requestTimeoutMs: 30_000, // generous: slow or distant networks are normal
});
