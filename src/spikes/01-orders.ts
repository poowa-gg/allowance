/**
 * SPIKE 01: prove the authorize -> (capture | void) lifecycle on the sandbox.
 *
 * WHY THIS MATTERS FOR ALLOWANCE
 * PayPal lets us place a HOLD on funds (intent=AUTHORIZE) without moving money.
 * That hold is the "pause" while a human taps Approve or Deny:
 *   Approve -> capture (money moves)
 *   Deny / timeout -> void (hold released, nothing moved)
 * If this works, our core architecture is validated on Day 1.
 *
 * RUN:  npm run spike:orders            (authorize, then void = the Deny path)
 *       npm run spike:orders:capture    (authorize, then capture = the Approve path)
 *
 * You must approve the order once in a browser as a SANDBOX BUYER account.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseAmountString, toDecimalString } from "../money.js";
import { paypalRequest } from "../paypal/client.js";

const OrderResponse = z.object({
  id: z.string(),
  status: z.string(),
  links: z.array(z.object({ href: z.string(), rel: z.string() })).default([]),
});

const AuthorizeResponse = z.object({
  status: z.string(),
  purchase_units: z
    .array(
      z.object({
        payments: z.object({
          authorizations: z.array(z.object({ id: z.string(), status: z.string() })),
        }),
      }),
    )
    .min(1),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const doCapture = process.argv.includes("--capture");
  // Default $12.50. For demo data use e.g.: npm run spike:orders:capture -- --amount=600.00
  const amountArg = process.argv.find((a) => a.startsWith("--amount="))?.slice("--amount=".length);
  const amount = parseAmountString(amountArg ?? "12.50");

  // Optional: resume an order you already created, e.g. --order=75T97455XG319843U
  const resumeId = process.argv.find((a) => a.startsWith("--order="))?.slice("--order=".length);

  let orderId: string;
  let status: string;

  if (resumeId) {
    const existing = OrderResponse.parse(await paypalRequest("GET", `/v2/checkout/orders/${resumeId}`));
    orderId = existing.id;
    status = existing.status;
    console.log(`Resuming order ${orderId} (status=${status})`);
    if (status !== "APPROVED") {
      console.log(`\nApprove it as your SANDBOX BUYER:\nhttps://www.sandbox.paypal.com/checkoutnow?token=${orderId}\n`);
    }
  } else {
    // 1) Create the order. One requestId for the whole operation => safe to retry.
    const order = OrderResponse.parse(
      await paypalRequest("POST", "/v2/checkout/orders", {
        requestId: randomUUID(),
        body: {
          intent: "AUTHORIZE",
          purchase_units: [
            {
              reference_id: "allowance-spike-1",
              description: "Allowance spike: office supplies",
              amount: { currency_code: "USD", value: toDecimalString(amount) },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                return_url: "https://example.com/return",
                cancel_url: "https://example.com/cancel",
                user_action: "PAY_NOW",
              },
            },
          },
        },
      }),
    );
    orderId = order.id;
    status = order.status;
    console.log(`Order created: ${orderId} (status=${status})`);

    // 2) A human must approve the order as the buyer. PayPal has used both link
    //    names over time ("payer-action" newer, "approve" older), so accept either.
    const approveUrl = order.links.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
    if (!approveUrl) throw new Error("No approval link in order response. Inspect `links`.");
    console.log(`\nOpen this in a browser and log in as your SANDBOX BUYER:\n${approveUrl}`);
    console.log(`(If this script dies, resume with: npm run spike:orders:capture -- --order=${orderId})\n`);
  }

  // 3) Poll until approved (max 5 minutes). A slow network is NOT a failed payment,
  //    so a failed poll is retried instead of aborting the whole run.
  const deadline = Date.now() + 300_000;
  while (status !== "APPROVED") {
    if (Date.now() > deadline) throw new Error("Timed out waiting for buyer approval.");
    await sleep(3_000);
    try {
      const fresh = OrderResponse.parse(await paypalRequest("GET", `/v2/checkout/orders/${orderId}`));
      status = fresh.status;
      process.stdout.write(`  order status: ${status}      \r`);
    } catch {
      process.stdout.write("  (network hiccup, retrying...)      \r");
    }
  }
  console.log("\nBuyer approved. Placing the hold (authorize)...");

  // 4) Authorize = the HOLD. Funds are reserved, nothing is paid out yet.
  const auth = AuthorizeResponse.parse(
    await paypalRequest("POST", `/v2/checkout/orders/${orderId}/authorize`, {
      requestId: randomUUID(),
      body: {},
    }),
  );
  const authorization = auth.purchase_units[0]?.payments.authorizations[0];
  if (!authorization) throw new Error("Authorize succeeded but no authorization id returned.");
  console.log(`Hold placed: authorization ${authorization.id} (status=${authorization.status})`);

  // 5) Resolve the hold, which is the human's decision.
  if (doCapture) {
    const cap = await paypalRequest("POST", `/v2/payments/authorizations/${authorization.id}/capture`, {
      requestId: randomUUID(),
      body: { final_capture: true },
    });
    console.log("APPROVE path: captured.", JSON.stringify(cap, null, 2));
  } else {
    await paypalRequest("POST", `/v2/payments/authorizations/${authorization.id}/void`, {
      requestId: randomUUID(),
    });
    console.log("DENY path: authorization voided. No money moved.");
  }
}

main().catch((err) => {
  console.error("\nSpike failed:", err instanceof Error ? err.message : err);
  if (err && typeof err === "object" && "body" in err) {
    console.error(JSON.stringify((err as { body: unknown }).body, null, 2));
  }
  process.exit(1);
});
