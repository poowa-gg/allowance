import { z } from "zod";
import { parseAmountString } from "../money.js";
import { paypalRequest } from "../paypal/client.js";
import { parseDisputeArgs, parsePayOrderArgs, parseRefundArgs } from "../policy/args.js";
import type { Facts } from "../policy/types.js";
import type { FactsResolver } from "./types.js";

/**
 * REAL facts from PayPal's REST API. The agent can claim anything; we ask PayPal.
 * SAFETY: ids go into URLs, so they are validated by the SAME strict patterns
 * the policy engine uses BEFORE we build a URL (no path tricks like "../..").
 * If anything fails, we throw, the gateway catches it, facts stay empty, and the engine DENIES.
 */
const Money = z.object({ currency_code: z.string(), value: z.string() });
const CaptureResp = z.object({ amount: Money });
const DisputeResp = z.object({ dispute_amount: Money });
const OrderResp = z.object({ purchase_units: z.array(z.object({ amount: Money })).min(1) });

export const paypalFactsResolver: FactsResolver = async (toolName, args): Promise<Facts> => {
  if (toolName === "create_refund") {
    const p = parseRefundArgs(args);
    if (!p.ok) return {};
    const r = CaptureResp.parse(await paypalRequest("GET", `/v2/payments/captures/${encodeURIComponent(p.value.captureId)}`));
    return { captureAmountCents: parseAmountString(r.amount.value), captureCurrency: r.amount.currency_code };
  }
  if (toolName === "accept_dispute_claim") {
    const p = parseDisputeArgs(args);
    if (!p.ok) return {};
    const r = DisputeResp.parse(await paypalRequest("GET", `/v1/customer/disputes/${encodeURIComponent(p.value.disputeId)}`));
    return { disputeAmountCents: parseAmountString(r.dispute_amount.value), disputeCurrency: r.dispute_amount.currency_code };
  }
  if (toolName === "pay_order") {
    const p = parsePayOrderArgs(args);
    if (!p.ok) return {};
    const r = OrderResp.parse(await paypalRequest("GET", `/v2/checkout/orders/${encodeURIComponent(p.value.orderId)}`));
    if (r.purchase_units.length !== 1) throw new Error("Orders with several purchase units are not supported");
    const unit = r.purchase_units[0]!;
    return { orderAmountCents: parseAmountString(unit.amount.value), orderCurrency: unit.amount.currency_code };
  }
  return {};
};
