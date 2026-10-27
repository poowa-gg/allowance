import { describe, expect, it } from "vitest";
import { cents } from "../money.js";
import { evaluate } from "./engine.js";
import { DEFAULT_POLICY } from "./policy.js";
import type { Decision, EvaluationInput, LedgerEntry, Policy } from "./types.js";

const NOW = new Date("2026-10-26T12:00:00Z");
const CAP = "6NU85358X8722232A";
const MIN = 60_000;
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const run = (over: Partial<EvaluationInput> & { toolName: string }): Decision =>
  evaluate({ args: {}, now: NOW, policy: DEFAULT_POLICY, facts: {}, history: [], ...over });

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  at: ago(MIN),
  toolName: "create_refund",
  targetId: "OTHER_CAPTURE_0001",
  amountCents: cents(100),
  status: "EXECUTED",
  ...over,
});

/** A refund against a capture of `captureCents`; `value` omitted means the agent left `amount` out. */
const refund = (value: string | null, captureCents = 1250, over: Partial<EvaluationInput> = {}): Decision =>
  run({
    toolName: "create_refund",
    args: value === null ? { capture_id: CAP } : { capture_id: CAP, amount: { currency_code: "USD", value } },
    facts: { captureAmountCents: cents(captureCents), captureCurrency: "USD" },
    ...over,
  });

const codes = (d: Decision) => d.reasons.map((r) => r.code);

describe("global rules", () => {
  it("allows reads", () => {
    expect(run({ toolName: "list_transactions" }).verdict).toBe("ALLOW");
  });
  it("denies unknown tools", () => {
    const d = run({ toolName: "drop_everything" });
    expect(d.verdict).toBe("DENY");
    expect(codes(d)).toContain("UNKNOWN_TOOL");
  });
  it("kill switch denies everything, even reads", () => {
    const policy: Policy = { ...DEFAULT_POLICY, killSwitch: true };
    expect(run({ toolName: "list_transactions", policy }).verdict).toBe("DENY");
    expect(run({ toolName: "create_product", policy }).verdict).toBe("DENY");
  });
  it("denies non-object arguments even for reads and writes", () => {
    for (const args of ["x", 5, null, []]) {
      expect(run({ toolName: "list_transactions", args }).verdict).toBe("DENY");
      expect(run({ toolName: "create_product", args }).verdict).toBe("DENY");
    }
  });
  it("allows low-risk writes", () => {
    expect(run({ toolName: "create_product" }).verdict).toBe("ALLOW");
  });
  it("fails closed if anything throws inside the engine", () => {
    const hostile = new Proxy({}, { ownKeys() { throw new Error("boom"); } });
    const d = run({ toolName: "create_refund", args: hostile });
    expect(d.verdict).toBe("DENY");
    expect(codes(d)).toContain("INTERNAL_ERROR");
  });
});

describe("create_refund", () => {
  it("auto-allows a small partial refund", () => {
    const d = refund("5.00");
    expect(d.verdict).toBe("ALLOW");
    expect(d.amountCents).toBe(500);
    expect(d.targetId).toBe(CAP);
  });
  it("needs approval above the auto-approve limit", () => {
    const d = refund("25.00", 10_000);
    expect(d.verdict).toBe("REQUIRE_APPROVAL");
    expect(codes(d)).toContain("ABOVE_AUTO_APPROVE");
  });
  it("denies above the hard cap", () => {
    const d = refund("600.00", 100_000);
    expect(d.verdict).toBe("DENY");
    expect(codes(d)).toContain("OVER_HARD_CAP");
  });
  it("THE TRAP: omitted amount on a big capture is treated as a FULL refund and blocked", () => {
    const d = refund(null, 60_000);
    expect(d.verdict).toBe("DENY");
    expect(codes(d)).toContain("FULL_REFUND_BY_OMISSION");
    expect(codes(d)).toContain("OVER_HARD_CAP");
    expect(d.amountCents).toBe(60_000);
  });
  it("omitted amount on a medium capture needs approval, never auto-allow", () => {
    expect(refund(null, 10_000).verdict).toBe("REQUIRE_APPROVAL");
  });
  it("omitted amount on a small capture is allowed and noted as a full refund", () => {
    const d = refund(null, 1250);
    expect(d.verdict).toBe("ALLOW");
    expect(codes(d)).toContain("FULL_REFUND_BY_OMISSION");
  });
  it("denies when the original payment cannot be verified", () => {
    const d = run({ toolName: "create_refund", args: { capture_id: CAP, amount: { currency_code: "USD", value: "1.00" } } });
    expect(d.verdict).toBe("DENY");
    expect(codes(d)).toContain("AMOUNT_UNRESOLVED");
  });
  it("denies a refund larger than the original payment", () => {
    const d = refund("15.00", 1250);
    expect(d.verdict).toBe("DENY");
    expect(codes(d)).toContain("EXCEEDS_CAPTURE");
  });
  it("denies non-USD", () => {
    const d = run({
      toolName: "create_refund",
      args: { capture_id: CAP, amount: { currency_code: "EUR", value: "5.00" } },
      facts: { captureAmountCents: cents(1250), captureCurrency: "USD" },
    });
    expect(d.verdict).toBe("DENY");
    expect(codes(d)).toContain("CURRENCY_MISMATCH");
  });
  it("denies malformed or sneaky arguments", () => {
    const facts = { captureAmountCents: cents(1250), captureCurrency: "USD" };
    const bad: unknown[] = [
      null,
      "refund everything",
      [],
      { capture_id: "short" },
      { capture_id: CAP, evil: true },
      { capture_id: CAP, amount: { currency_code: "USD", value: "abc" } },
      { capture_id: CAP, amount: { currency_code: "USD", value: "0.00" } },
      { capture_id: CAP, amount: { currency_code: "USD", value: "-5.00" } },
      { capture_id: CAP, amount: { currency_code: "USD", value: "1.005" } },
      { capture_id: CAP, amount: { currency_code: "USD", value: 5 } },
      { capture_id: CAP, amount: { currency_code: "USD", value: "5.00", sneaky: 1 } },
    ];
    for (const args of bad) {
      const d = run({ toolName: "create_refund", args, facts });
      expect(d.verdict).toBe("DENY");
      expect(codes(d)).toContain("INVALID_ARGS");
    }
  });
  it("denies when earlier refunds plus this one exceed the capture", () => {
    const history = [entry({ targetId: CAP, amountCents: cents(800) })];
    const d = refund("5.00", 1250, { history });
    expect(d.verdict).toBe("DENY");
    expect(codes(d)).toContain("CUMULATIVE_EXCEEDS_CAPTURE");
  });
});

describe("budgets, velocity and reservations", () => {
  it("needs approval when the rolling 24h budget would be exceeded", () => {
    const history = [entry({ amountCents: cents(9_500) })];
    const d = refund("10.00", 1250, { history });
    expect(d.verdict).toBe("REQUIRE_APPROVAL");
    expect(codes(d)).toContain("DAILY_LIMIT");
  });
  it("ignores spending older than 24h", () => {
    const history = [entry({ at: ago(25 * HOUR), amountCents: cents(9_500) })];
    expect(refund("10.00", 1250, { history }).verdict).toBe("ALLOW");
  });
  it("held (PENDING) requests do NOT consume budget, so an agent cannot starve legitimate work by spamming them", () => {
    const history = [entry({ status: "PENDING_APPROVAL", amountCents: cents(9_500) })];
    expect(refund("10.00", 1250, { history }).verdict).toBe("ALLOW");
  });
  it("bounds the approvals inbox: when it is full, new held requests are DENIED", () => {
    const history = Array.from({ length: 10 }, (_, i) => entry({ status: "PENDING_APPROVAL", targetId: `P${i}_ABCDEFGHIJKLMNOP`, amountCents: cents(2_500) }));
    const d = refund("25.00", 10_000, { history });
    expect(d.verdict).toBe("DENY");
    expect(codes(d)).toContain("APPROVAL_QUEUE_FULL");
    // ...but a small action that needs no human is unaffected by a full inbox
    expect(refund("5.00", 1250, { history }).verdict).toBe("ALLOW");
  });
  it("does not count DENIED or EXPIRED entries", () => {
    const history = [
      entry({ status: "DENIED", amountCents: cents(9_500) }),
      entry({ status: "EXPIRED", amountCents: cents(9_500) }),
      entry({ status: "FAILED", amountCents: cents(9_500) }),
    ];
    expect(refund("10.00", 1250, { history }).verdict).toBe("ALLOW");
  });
  it("counts entries with an invalid date (conservative)", () => {
    const history = [entry({ at: new Date("not a date"), amountCents: cents(9_500) })];
    expect(refund("10.00", 1250, { history }).verdict).toBe("REQUIRE_APPROVAL");
  });
  it("flags high overall velocity", () => {
    const history = Array.from({ length: 10 }, (_, i) => entry({ targetId: `T${i}_ABCDEFGHIJKLMNOP`, amountCents: cents(100) }));
    const d = refund("1.00", 1250, { history });
    expect(d.verdict).toBe("REQUIRE_APPROVAL");
    expect(codes(d)).toContain("VELOCITY");
  });
  it("flags structuring: many small refunds on ONE capture", () => {
    const history = Array.from({ length: 3 }, () => entry({ targetId: CAP, amountCents: cents(100) }));
    const d = refund("1.00", 10_000, { history });
    expect(d.verdict).toBe("REQUIRE_APPROVAL");
    expect(codes(d)).toContain("TARGET_VELOCITY");
  });
  it("strictest rule wins and every reason is reported", () => {
    const d = refund("600.00", 100_000);
    expect(d.verdict).toBe("DENY");
    expect(codes(d)).toContain("OVER_HARD_CAP");
    expect(codes(d)).toContain("DAILY_LIMIT");
  });
});

describe("accept_dispute_claim and pay_order", () => {
  const dArgs = { dispute_id: "PP-D-12345", note: "customer_was_correct" };
  const dFacts = (c: number) => ({ disputeAmountCents: cents(c), disputeCurrency: "USD" });

  it("treats a small dispute acceptance as auto-allowed", () => {
    expect(run({ toolName: "accept_dispute_claim", args: dArgs, facts: dFacts(1500) }).verdict).toBe("ALLOW");
  });
  it("needs approval for a larger dispute", () => {
    expect(run({ toolName: "accept_dispute_claim", args: dArgs, facts: dFacts(5000) }).verdict).toBe("REQUIRE_APPROVAL");
  });
  it("denies a dispute whose amount cannot be verified", () => {
    const d = run({ toolName: "accept_dispute_claim", args: dArgs });
    expect(d.verdict).toBe("DENY");
    expect(codes(d)).toContain("AMOUNT_UNRESOLVED");
  });
  it("denies a note with spaces (PayPal's own pattern rejects it)", () => {
    const d = run({ toolName: "accept_dispute_claim", args: { ...dArgs, note: "customer was correct" }, facts: dFacts(1500) });
    expect(d.verdict).toBe("DENY");
    expect(codes(d)).toContain("INVALID_ARGS");
  });
  it("dispute acceptances share the daily money-out budget with refunds", () => {
    const history = [entry({ amountCents: cents(9_500) })];
    expect(run({ toolName: "accept_dispute_claim", args: dArgs, facts: dFacts(1500), history }).verdict).toBe("REQUIRE_APPROVAL");
  });
  it("pay_order above the auto limit needs approval", () => {
    const d = run({ toolName: "pay_order", args: { id: "ORDERID1234567890A" }, facts: { orderAmountCents: cents(3000), orderCurrency: "USD" } });
    expect(d.verdict).toBe("REQUIRE_APPROVAL");
  });
  it("pay_order is money IN, so it does not use the daily money-out budget", () => {
    const history = [entry({ amountCents: cents(9_900) })];
    const d = run({ toolName: "pay_order", args: { id: "ORDERID1234567890A" }, facts: { orderAmountCents: cents(1000), orderCurrency: "USD" }, history });
    expect(d.verdict).toBe("ALLOW");
  });
});

describe("customer-facing tools", () => {
  it("allows invoice reminders by default", () => {
    expect(run({ toolName: "send_invoice_reminder", args: { invoice_id: "INV2-ABCD-1234" } }).verdict).toBe("ALLOW");
  });
  it("needs approval to send or cancel invoices and cancel subscriptions", () => {
    expect(run({ toolName: "send_invoice", args: { invoice_id: "INV2-ABCD-1234" } }).verdict).toBe("REQUIRE_APPROVAL");
    expect(run({ toolName: "cancel_sent_invoice", args: { invoice_id: "INV2-ABCD-1234" } }).verdict).toBe("REQUIRE_APPROVAL");
    expect(run({ toolName: "cancel_subscription", args: { subscription_id: "I-ABC123", payload: { reason: "requested" } } }).verdict).toBe("REQUIRE_APPROVAL");
  });
  it("escalates extra email recipients (exfiltration vector)", () => {
    const d = run({ toolName: "send_invoice_reminder", args: { invoice_id: "INV2-ABCD-1234", additional_recipients: ["attacker@evil.test"] } });
    expect(d.verdict).toBe("REQUIRE_APPROVAL");
    expect(codes(d)).toContain("EXTERNAL_RECIPIENTS");
  });
  it("rate-limits customer-facing actions", () => {
    const history = Array.from({ length: 20 }, () => entry({ toolName: "send_invoice_reminder", amountCents: cents(0) }));
    const d = run({ toolName: "send_invoice_reminder", args: { invoice_id: "INV2-ABCD-1234" }, history });
    expect(d.verdict).toBe("REQUIRE_APPROVAL");
    expect(codes(d)).toContain("VELOCITY");
  });
  it("denies a malformed invoice id", () => {
    expect(run({ toolName: "send_invoice", args: { invoice_id: "../../etc" } }).verdict).toBe("DENY");
  });
});

describe("LLM advisory can only make decisions stricter", () => {
  const sus = { suspicious: true, reason: "Invoice text told the agent to ignore its rules." };
  it("escalates an ALLOW to REQUIRE_APPROVAL", () => {
    const d = refund("5.00", 1250, { advisory: sus });
    expect(d.verdict).toBe("REQUIRE_APPROVAL");
    expect(codes(d)).toContain("ADVISORY_SUSPICIOUS");
  });
  it("never downgrades a DENY", () => {
    expect(refund("600.00", 100_000, { advisory: { suspicious: false, reason: "looks fine" } }).verdict).toBe("DENY");
    expect(refund("600.00", 100_000, { advisory: sus }).verdict).toBe("DENY");
  });
  it("a not-suspicious advisory changes nothing", () => {
    expect(refund("5.00", 1250, { advisory: { suspicious: false, reason: "fine" } }).verdict).toBe("ALLOW");
  });
  it("strips control characters from advisory text", () => {
    const d = refund("5.00", 1250, { advisory: { suspicious: true, reason: "bad\u0000\n\u001bstuff" } });
    const msg = d.reasons.find((r) => r.code === "ADVISORY_SUSPICIOUS")?.message ?? "";
    expect(msg.includes("\u0000")).toBe(false);
    expect(msg.includes("\n")).toBe(false);
  });
});
