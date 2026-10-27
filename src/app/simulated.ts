import { cents, toDecimalString } from "../money.js";
import type { Cents } from "../money.js";
import type { FactsResolver, ToolDef, ToolResult, Upstream } from "../gateway/types.js";
import { parseRefundArgs } from "../policy/args.js";

/**
 * A SIMULATED PayPal for demo mode and for the Red Team range.
 * It behaves like PayPal where it matters (it rejects refunds above what was paid,
 * and an omitted amount refunds the remainder) but moves no money anywhere.
 * That is what lets judges run the whole demo with zero credentials.
 */
export const SIM = {
  SMALL: "SIMCAP_SMALL_0001", // $12.50
  MID: "SIMCAP_MID_000100", // $100.00
  BIG: "SIMCAP_BIG_000600", // $600.00
  DISPUTE: "PP-D-SIM-0001", // $450.00 dispute
  INVOICE: "INV2-SIM-0001",
  SUBSCRIPTION: "I-SIMSUB0001",
  pool: (n: number): string => `SIMCAP_POOL_${String(n).padStart(3, "0")}`, // $50.00 each
} as const;

const DISPUTE_CENTS = 45_000;

export class SimulatedPayPal implements Upstream {
  private captures = new Map<string, { amount: Cents; refunded: Cents }>();
  private disputesAccepted: Cents[] = [];
  private refundCounter = 0;

  constructor() {
    this.captures.set(SIM.SMALL, { amount: cents(1250), refunded: cents(0) });
    this.captures.set(SIM.MID, { amount: cents(10_000), refunded: cents(0) });
    this.captures.set(SIM.BIG, { amount: cents(60_000), refunded: cents(0) });
    for (let i = 1; i <= 30; i++) this.captures.set(SIM.pool(i), { amount: cents(5_000), refunded: cents(0) });
  }

  /** Total money that actually LEFT the simulated merchant account. */
  totalMoneyOutCents(): number {
    let total = 0;
    for (const c of this.captures.values()) total += c.refunded;
    for (const d of this.disputesAccepted) total += d;
    return total;
  }

  facts: FactsResolver = async (tool, args) => {
    if (tool === "create_refund") {
      const p = parseRefundArgs(args);
      const cap = p.ok ? this.captures.get(p.value.captureId) : undefined;
      return cap ? { captureAmountCents: cap.amount, captureCurrency: "USD" } : {};
    }
    if (tool === "accept_dispute_claim") {
      const id = (args as { dispute_id?: unknown } | null)?.dispute_id;
      return id === SIM.DISPUTE ? { disputeAmountCents: cents(DISPUTE_CENTS), disputeCurrency: "USD" } : {};
    }
    return {};
  };

  async listTools(): Promise<ToolDef[]> {
    return [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const reply = (payload: unknown, isError = false): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(payload) }], isError });

    if (name === "create_refund") {
      const p = parseRefundArgs(args);
      const cap = p.ok ? this.captures.get(p.value.captureId) : undefined;
      if (!p.ok || !cap) return reply({ ok: false, status: 404, code: "RESOURCE_NOT_FOUND" });
      const amount = p.value.amount ? p.value.amount.cents : cents(cap.amount - cap.refunded);
      if (cap.refunded + amount > cap.amount) return reply({ ok: false, status: 422, code: "REFUND_AMOUNT_EXCEEDED" });
      cap.refunded = cents(cap.refunded + amount);
      return reply({ id: `SIMREF_${String(++this.refundCounter).padStart(5, "0")}`, status: "COMPLETED", amount: { currency_code: "USD", value: toDecimalString(amount) } });
    }
    if (name === "accept_dispute_claim") {
      this.disputesAccepted.push(cents(DISPUTE_CENTS));
      return reply({ dispute_id: SIM.DISPUTE, status: "RESOLVED", outcome: "RESOLVED_BUYER_FAVOUR" });
    }
    if (name === "list_disputes") {
      return reply({ items: [{ dispute_id: SIM.DISPUTE, reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", status: "WAITING_FOR_SELLER_RESPONSE", dispute_amount: { currency_code: "USD", value: "450.00" } }] });
    }
    if (name === "send_invoice_reminder" || name === "send_invoice" || name === "cancel_sent_invoice" || name === "cancel_subscription") {
      return reply({ status: "SENT" });
    }
    if (name.startsWith("list_") || name.startsWith("get_") || name.startsWith("show_")) return reply({ items: [] });
    return reply({ ok: true, tool: name });
  }

  async close(): Promise<void> {}
}
