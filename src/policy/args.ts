import { parseAmountString } from "../money.js";
import type { Cents } from "../money.js";

/**
 * STRICT ARGUMENT PARSING (hand-written on purpose: tiny, dependency-free, auditable)
 *
 * Arguments come from an AI agent, which may have been manipulated by text it
 * read. So we never trust their shape:
 *  - must be a plain object,
 *  - unknown fields are REJECTED (an unexpected field could change what PayPal does),
 *  - IDs must match PayPal's documented patterns,
 *  - money must parse to exact integer cents.
 * Any failure becomes a DENY upstream.
 */

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export function isPlainObject(x: unknown): x is Record<string, unknown> {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

function unknownKeys(obj: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(obj).filter((k) => !allowed.includes(k));
}

const CAPTURE_ID = /^[A-Za-z0-9_-]{15,32}$/;
const DISPUTE_ID = /^[A-Za-z0-9_-]{1,255}$/;
const DISPUTE_NOTE = /^[A-Za-z0-9_-]{1,255}$/; // PayPal's own pattern: no spaces!
const ORDER_ID = /^[A-Z0-9]{17,32}$/;
const INVOICE_ID = /^[A-Za-z0-9_-]{1,127}$/;
const SUBSCRIPTION_ID = /^[A-Za-z0-9_-]{3,50}$/;
const CURRENCY = /^[A-Z]{3}$/;

// ---------- create_refund ----------
export interface RefundArgs {
  captureId: string;
  /** undefined means the agent OMITTED the amount, which PayPal treats as a FULL refund. */
  amount?: { currency: string; cents: Cents };
}

export function parseRefundArgs(args: unknown): ParseResult<RefundArgs> {
  if (!isPlainObject(args)) return fail("arguments must be an object");
  const extra = unknownKeys(args, ["capture_id", "amount", "invoice_id", "note_to_payer"]);
  if (extra.length) return fail(`unexpected fields: ${extra.join(", ")}`);

  const captureId = args["capture_id"];
  if (typeof captureId !== "string" || !CAPTURE_ID.test(captureId)) return fail("capture_id is invalid");

  const invoiceId = args["invoice_id"];
  if (invoiceId !== undefined && (typeof invoiceId !== "string" || !INVOICE_ID.test(invoiceId))) {
    return fail("invoice_id is invalid");
  }
  const note = args["note_to_payer"];
  if (note !== undefined && (typeof note !== "string" || note.length > 1000)) return fail("note_to_payer is invalid");

  const rawAmount = args["amount"];
  if (rawAmount === undefined) return { ok: true, value: { captureId } };

  if (!isPlainObject(rawAmount)) return fail("amount must be an object");
  const extraAmt = unknownKeys(rawAmount, ["currency_code", "value"]);
  if (extraAmt.length) return fail(`unexpected amount fields: ${extraAmt.join(", ")}`);
  const currency = rawAmount["currency_code"];
  const value = rawAmount["value"];
  if (typeof currency !== "string" || !CURRENCY.test(currency)) return fail("amount.currency_code is invalid");
  if (typeof value !== "string") return fail("amount.value must be a string");
  let parsed: Cents;
  try {
    parsed = parseAmountString(value);
  } catch {
    return fail("amount.value is not a valid amount");
  }
  if (parsed <= 0) return fail("amount must be greater than zero");
  return { ok: true, value: { captureId, amount: { currency, cents: parsed } } };
}

// ---------- accept_dispute_claim ----------
export interface DisputeArgs {
  disputeId: string;
}

export function parseDisputeArgs(args: unknown): ParseResult<DisputeArgs> {
  if (!isPlainObject(args)) return fail("arguments must be an object");
  const extra = unknownKeys(args, ["dispute_id", "note"]);
  if (extra.length) return fail(`unexpected fields: ${extra.join(", ")}`);
  const id = args["dispute_id"];
  const note = args["note"];
  if (typeof id !== "string" || !DISPUTE_ID.test(id)) return fail("dispute_id is invalid");
  if (typeof note !== "string" || !DISPUTE_NOTE.test(note)) {
    return fail("note must use only letters, digits, _ and - (PayPal rejects spaces)");
  }
  return { ok: true, value: { disputeId: id } };
}

// ---------- pay_order ----------
export interface PayOrderArgs {
  orderId: string;
}

export function parsePayOrderArgs(args: unknown): ParseResult<PayOrderArgs> {
  if (!isPlainObject(args)) return fail("arguments must be an object");
  const extra = unknownKeys(args, ["id"]);
  if (extra.length) return fail(`unexpected fields: ${extra.join(", ")}`);
  const id = args["id"];
  if (typeof id !== "string" || !ORDER_ID.test(id)) return fail("order id is invalid");
  return { ok: true, value: { orderId: id } };
}

// ---------- send_invoice / send_invoice_reminder / cancel_sent_invoice ----------
export interface InvoiceActionArgs {
  invoiceId: string;
  /** Extra email addresses: a data-exfiltration and spam vector, so the engine escalates these. */
  hasAdditionalRecipients: boolean;
}

const INVOICE_ALLOWED: Record<string, readonly string[]> = {
  send_invoice: ["invoice_id", "note", "send_to_recipient", "additional_recipients"],
  send_invoice_reminder: ["invoice_id", "subject", "note", "additional_recipients"],
  cancel_sent_invoice: ["invoice_id", "note", "send_to_recipient", "additional_recipients"],
};

export function parseInvoiceActionArgs(toolName: string, args: unknown): ParseResult<InvoiceActionArgs> {
  const allowed = INVOICE_ALLOWED[toolName];
  if (!allowed) return fail("not an invoice action");
  if (!isPlainObject(args)) return fail("arguments must be an object");
  const extra = unknownKeys(args, allowed);
  if (extra.length) return fail(`unexpected fields: ${extra.join(", ")}`);
  const id = args["invoice_id"];
  if (typeof id !== "string" || !INVOICE_ID.test(id)) return fail("invoice_id is invalid");
  const recipients = args["additional_recipients"];
  if (recipients !== undefined && !Array.isArray(recipients)) return fail("additional_recipients must be a list");
  return { ok: true, value: { invoiceId: id, hasAdditionalRecipients: Array.isArray(recipients) && recipients.length > 0 } };
}

// ---------- cancel_subscription ----------
export interface CancelSubscriptionArgs {
  subscriptionId: string;
}

export function parseCancelSubscriptionArgs(args: unknown): ParseResult<CancelSubscriptionArgs> {
  if (!isPlainObject(args)) return fail("arguments must be an object");
  const extra = unknownKeys(args, ["subscription_id", "payload"]);
  if (extra.length) return fail(`unexpected fields: ${extra.join(", ")}`);
  const id = args["subscription_id"];
  if (typeof id !== "string" || !SUBSCRIPTION_ID.test(id)) return fail("subscription_id is invalid");
  const payload = args["payload"];
  if (!isPlainObject(payload) || typeof payload["reason"] !== "string") return fail("payload.reason is required");
  return { ok: true, value: { subscriptionId: id } };
}
