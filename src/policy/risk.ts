/**
 * RISK MAP: every PayPal MCP tool, classified from the REAL tool list
 * (docs/paypal-mcp-tools.json, captured Oct 23 2026).
 *
 * TIERS
 *  READ            Only reads data. Always allowed (but still logged).
 *  WRITE           Creates/changes setup data (products, plans, drafts). Reversible, low risk.
 *  CUSTOMER_FACING Emails customers or changes their billing relationship. Embarrassing/costly to undo.
 *  MONEY           Moves funds or captures a charge. The tier Allowance exists to guard.
 *
 * THE KEY SAFETY RULE: DEFAULT DENY.
 * If PayPal adds a tool tomorrow and we haven't classified it, `classifyTool`
 * returns "UNKNOWN" and the proxy must BLOCK it. A firewall that allows
 * "things it has never heard of" is not a firewall.
 */

export type RiskTier = "READ" | "WRITE" | "CUSTOMER_FACING" | "MONEY";

export const TOOL_RISK = {
  // ---- READ ----
  list_invoices: "READ",
  get_invoice: "READ",
  generate_invoice_qr_code: "READ",
  list_products: "READ",
  show_product_details: "READ",
  list_subscription_plans: "READ",
  show_subscription_plan_details: "READ",
  show_subscription_details: "READ",
  get_shipment_tracking: "READ",
  get_order: "READ",
  list_disputes: "READ",
  get_dispute: "READ",
  list_transactions: "READ",
  get_refund: "READ",

  // ---- WRITE (setup data, reversible) ----
  create_invoice: "WRITE", // draft only; nothing is sent until send_invoice
  create_product: "WRITE",
  update_product: "WRITE",
  create_subscription_plan: "WRITE",
  create_subscription: "WRITE", // buyer must still approve, so no funds move here
  create_shipment_tracking: "WRITE",
  create_order: "WRITE", // an order is a request to pay; capture is the money step

  // ---- CUSTOMER_FACING ----
  send_invoice: "CUSTOMER_FACING",
  send_invoice_reminder: "CUSTOMER_FACING",
  cancel_sent_invoice: "CUSTOMER_FACING",
  cancel_subscription: "CUSTOMER_FACING",

  // ---- MONEY ----
  create_refund: "MONEY", // money OUT. Omitted amount = FULL refund (see policy notes)
  accept_dispute_claim: "MONEY", // PayPal auto-refunds the customer from the merchant account
  pay_order: "MONEY", // captures a payment
} as const satisfies Record<string, RiskTier>;

export type KnownTool = keyof typeof TOOL_RISK;

export function classifyTool(name: string): RiskTier | "UNKNOWN" {
  // Object.hasOwn avoids prototype tricks like "constructor" or "__proto__".
  return Object.hasOwn(TOOL_RISK, name) ? TOOL_RISK[name as KnownTool] : "UNKNOWN";
}

/** Anything that is not provably READ needs a policy decision. Unknown is guarded. */
export function needsPolicyCheck(name: string): boolean {
  return classifyTool(name) !== "READ";
}
