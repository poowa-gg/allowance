import { cents, toDecimalString } from "../money.js";
import type { Cents } from "../money.js";
import {
  isPlainObject,
  parseCancelSubscriptionArgs,
  parseDisputeArgs,
  parseInvoiceActionArgs,
  parsePayOrderArgs,
  parseRefundArgs,
} from "./args.js";
import { classifyTool } from "./risk.js";
import type { Decision, EvaluationInput, LedgerEntry, Reason, ReasonCode, Verdict } from "./types.js";

/**
 * THE POLICY ENGINE: the one function that decides ALLOW / REQUIRE_APPROVAL / DENY.
 *
 * WHY IT IS DESIGNED THIS WAY (your defence in front of judges)
 *  1. PURE: no network, no clock, no database. `now`, `facts` and `history` are passed in.
 *     Same input always gives the same output, so every decision is replayable and testable.
 *  2. FAIL CLOSED: unknown tool, bad arguments, missing facts, or ANY thrown error means DENY.
 *  3. STRICTEST WINS: every rule can only raise severity (ALLOW < REQUIRE_APPROVAL < DENY).
 *     No rule can cancel another rule's objection.
 *  4. THE LLM HAS NO AUTHORITY: the optional advisory can escalate ALLOW to REQUIRE_APPROVAL.
 *     It cannot downgrade anything, by construction.
 */

const RANK: Record<Verdict, number> = { ALLOW: 0, REQUIRE_APPROVAL: 1, DENY: 2 };
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Tools that send money AWAY from the merchant. These share the rolling daily budget. */
const MONEY_OUT_TOOLS: readonly string[] = ["create_refund", "accept_dispute_claim"];

class Verdicts {
  verdict: Verdict = "ALLOW";
  readonly reasons: Reason[] = [];

  /** Record a finding. Severity can only go UP, never down. */
  add(verdict: Verdict, code: ReasonCode, message: string): void {
    this.reasons.push({ code, message });
    if (RANK[verdict] > RANK[this.verdict]) this.verdict = verdict;
  }

  /** Record context that does not change the verdict (useful for the audit trail). */
  info(code: ReasonCode, message: string): void {
    this.reasons.push({ code, message });
  }
}

interface Outcome {
  amountCents?: Cents;
  targetId?: string;
}

const usd = (c: Cents): string => `$${toDecimalString(c)}`;

/** EXECUTED entries inside a time window (in-flight actions are recorded as EXECUTED). Future/invalid dates count (conservative). */
function counted(history: readonly LedgerEntry[], now: Date, windowMs: number): LedgerEntry[] {
  const cutoff = now.getTime() - windowMs;
  return history.filter((e) => {
    if (e.status !== "EXECUTED") return false;
    const t = e.at.getTime();
    return Number.isNaN(t) || t > cutoff;
  });
}

function sum(entries: readonly LedgerEntry[]): Cents {
  return cents(entries.reduce((total, e) => total + e.amountCents, 0));
}

// ---------------------------------------------------------------- MONEY tools
function checkMoney(input: EvaluationInput, v: Verdicts, out: Outcome): void {
  const { toolName, args, policy, facts, history, now } = input;
  let amount: Cents;
  let target: string;

  if (toolName === "create_refund") {
    const parsed = parseRefundArgs(args);
    if (!parsed.ok) return void v.add("DENY", "INVALID_ARGS", `Invalid refund arguments: ${parsed.error}.`);
    const a = parsed.value;

    const captured = facts.captureAmountCents;
    const capturedCurrency = facts.captureCurrency;
    if (captured === undefined || capturedCurrency === undefined) {
      return void v.add("DENY", "AMOUNT_UNRESOLVED", "Could not verify the original payment amount, so the refund is blocked.");
    }

    // THE KEY TRAP: if the agent omits `amount`, PayPal refunds the ENTIRE capture.
    // A naive limit check sees "no amount" and waves it through. We treat omission as the full capture.
    amount = a.amount ? a.amount.cents : captured;
    const currency = a.amount ? a.amount.currency : capturedCurrency;
    target = a.captureId;
    if (!a.amount) {
      v.info("FULL_REFUND_BY_OMISSION", `No amount given, so this is a FULL refund of ${usd(captured)}.`);
    }

    if (currency !== policy.currency || capturedCurrency !== policy.currency) {
      v.add("DENY", "CURRENCY_MISMATCH", `Only ${policy.currency} is allowed, got ${currency}/${capturedCurrency}.`);
    }
    if (amount > captured) {
      v.add("DENY", "EXCEEDS_CAPTURE", `Refund ${usd(amount)} is larger than the original payment ${usd(captured)}.`);
    }
    // Cumulative check: many partial refunds must not add up to more than was paid.
    const prior = sum(counted(history, now, Infinity).filter((e) => e.toolName === "create_refund" && e.targetId === target));
    if (prior + amount > captured) {
      v.add(
        "DENY",
        "CUMULATIVE_EXCEEDS_CAPTURE",
        `Earlier refunds (${usd(prior)}) plus this one (${usd(amount)}) exceed the original payment ${usd(captured)}.`,
      );
    }
  } else if (toolName === "accept_dispute_claim") {
    const parsed = parseDisputeArgs(args);
    if (!parsed.ok) return void v.add("DENY", "INVALID_ARGS", `Invalid dispute arguments: ${parsed.error}.`);
    if (facts.disputeAmountCents === undefined || facts.disputeCurrency === undefined) {
      return void v.add("DENY", "AMOUNT_UNRESOLVED", "Could not verify the disputed amount, so accepting is blocked.");
    }
    // Accepting a dispute makes PayPal refund the customer from the merchant account: it is a refund in disguise.
    amount = facts.disputeAmountCents;
    target = parsed.value.disputeId;
    if (facts.disputeCurrency !== policy.currency) {
      v.add("DENY", "CURRENCY_MISMATCH", `Only ${policy.currency} is allowed, got ${facts.disputeCurrency}.`);
    }
  } else if (toolName === "pay_order") {
    const parsed = parsePayOrderArgs(args);
    if (!parsed.ok) return void v.add("DENY", "INVALID_ARGS", `Invalid order arguments: ${parsed.error}.`);
    if (facts.orderAmountCents === undefined || facts.orderCurrency === undefined) {
      return void v.add("DENY", "AMOUNT_UNRESOLVED", "Could not verify the order amount, so the charge is blocked.");
    }
    amount = facts.orderAmountCents;
    target = parsed.value.orderId;
    if (facts.orderCurrency !== policy.currency) {
      v.add("DENY", "CURRENCY_MISMATCH", `Only ${policy.currency} is allowed, got ${facts.orderCurrency}.`);
    }
  } else {
    // Classified MONEY but we have no rules for it: never guess.
    return void v.add("DENY", "UNHANDLED_MONEY_TOOL", `No rules exist for ${toolName}, so it is blocked.`);
  }

  out.amountCents = amount;
  out.targetId = target;
  const m = policy.money;

  // Size limits
  if (amount > m.hardCapCents) {
    v.add("DENY", "OVER_HARD_CAP", `${usd(amount)} is above the hard cap of ${usd(m.hardCapCents)}.`);
  } else if (amount > m.autoApproveUpToCents) {
    v.add("REQUIRE_APPROVAL", "ABOVE_AUTO_APPROVE", `${usd(amount)} is above the auto-approve limit of ${usd(m.autoApproveUpToCents)}.`);
  }

  // Rolling 24h budget for money OUT (refunds + dispute acceptances). In-flight allowed actions already count.
  if (MONEY_OUT_TOOLS.includes(toolName)) {
    const spent = sum(counted(history, now, DAY_MS).filter((e) => MONEY_OUT_TOOLS.includes(e.toolName)));
    if (spent + amount > m.dailyLimitCents) {
      v.add(
        "REQUIRE_APPROVAL",
        "DAILY_LIMIT",
        `Last 24h money-out ${usd(spent)} plus this ${usd(amount)} exceeds the daily limit of ${usd(m.dailyLimitCents)}.`,
      );
    }
  }

  // Velocity: how many money actions in the last hour, overall and on this target.
  const lastHour = counted(history, now, HOUR_MS).filter((e) => classifyTool(e.toolName) === "MONEY");
  if (lastHour.length >= m.maxActionsPerHour) {
    v.add("REQUIRE_APPROVAL", "VELOCITY", `${lastHour.length} money actions in the last hour (limit ${m.maxActionsPerHour}).`);
  }
  const onTarget = lastHour.filter((e) => e.targetId === target);
  if (onTarget.length >= m.maxActionsPerTargetPerHour) {
    v.add(
      "REQUIRE_APPROVAL",
      "TARGET_VELOCITY",
      `${onTarget.length} actions on the same target in the last hour (limit ${m.maxActionsPerTargetPerHour}). Possible structuring.`,
    );
  }
}

// ------------------------------------------------------------ CUSTOMER_FACING
function checkCustomerFacing(input: EvaluationInput, v: Verdicts, out: Outcome): void {
  const { toolName, args, policy, history, now } = input;

  if (toolName === "cancel_subscription") {
    const parsed = parseCancelSubscriptionArgs(args);
    if (!parsed.ok) return void v.add("DENY", "INVALID_ARGS", `Invalid subscription arguments: ${parsed.error}.`);
    out.targetId = parsed.value.subscriptionId;
  } else {
    const parsed = parseInvoiceActionArgs(toolName, args);
    if (!parsed.ok) return void v.add("DENY", "INVALID_ARGS", `Invalid invoice arguments: ${parsed.error}.`);
    out.targetId = parsed.value.invoiceId;
    if (parsed.value.hasAdditionalRecipients) {
      v.add("REQUIRE_APPROVAL", "EXTERNAL_RECIPIENTS", "The agent is adding extra email recipients, which can leak invoice data.");
    }
  }

  const allowed = (policy.customerFacing.autoAllow as readonly string[]).includes(toolName);
  if (!allowed) {
    v.add("REQUIRE_APPROVAL", "CUSTOMER_FACING_NEEDS_APPROVAL", `${toolName} contacts or changes things for customers, so it needs a human.`);
  }

  const recent = counted(history, now, HOUR_MS).filter((e) => classifyTool(e.toolName) === "CUSTOMER_FACING");
  if (recent.length >= policy.customerFacing.maxPerHour) {
    v.add("REQUIRE_APPROVAL", "VELOCITY", `${recent.length} customer-facing actions in the last hour (limit ${policy.customerFacing.maxPerHour}).`);
  }
}

// ------------------------------------------------------------------ the entry
function evaluateInner(input: EvaluationInput): Decision {
  const { toolName, policy, advisory } = input;
  const tier = classifyTool(toolName);
  const v = new Verdicts();
  const out: Outcome = {};

  if (policy.killSwitch) {
    v.add("DENY", "KILL_SWITCH", "Kill switch is ON: every agent action is blocked.");
    return build(toolName, tier, v, out);
  }

  switch (tier) {
    case "UNKNOWN":
      v.add("DENY", "UNKNOWN_TOOL", `${toolName} is not a recognised tool, so it is blocked by default.`);
      break;
    case "READ":
      if (input.args !== undefined && !isPlainObject(input.args)) {
        v.add("DENY", "INVALID_ARGS", "Tool arguments must be an object.");
      }
      return build(toolName, tier, v, out); // reads are harmless, and the advisory is ignored for them
    case "WRITE":
      if (input.args !== undefined && !isPlainObject(input.args)) {
        v.add("DENY", "INVALID_ARGS", "Tool arguments must be an object.");
      }
      break;
    case "CUSTOMER_FACING":
      checkCustomerFacing(input, v, out);
      break;
    case "MONEY":
      checkMoney(input, v, out);
      break;
  }

  // Approval-fatigue defence: a bounded inbox. If it is full, anything that would need a human is refused instead.
  if (v.verdict === "REQUIRE_APPROVAL") {
    const pending = input.history.filter((e) => e.status === "PENDING_APPROVAL").length;
    if (pending >= policy.approvals.maxPending) {
      v.add("DENY", "APPROVAL_QUEUE_FULL", `${pending} requests are already waiting for a human (limit ${policy.approvals.maxPending}). Not adding more.`);
    }
  }

  // The LLM reviewer may only ESCALATE. RANK-based add() makes downgrading impossible.
  if (advisory?.suspicious && tier !== "UNKNOWN") {
    const text = String(advisory.reason).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 300);
    v.add("REQUIRE_APPROVAL", "ADVISORY_SUSPICIOUS", `Risk reviewer flagged this: ${text}`);
  }

  return build(toolName, tier, v, out);
}

function build(toolName: string, tier: Decision["tier"], v: Verdicts, out: Outcome): Decision {
  if (v.verdict === "ALLOW" && v.reasons.every((r) => r.code === "FULL_REFUND_BY_OMISSION")) {
    v.info("WITHIN_POLICY", "Within policy limits.");
  }
  const decision: Decision = { verdict: v.verdict, tier, toolName, reasons: v.reasons };
  if (out.amountCents !== undefined) decision.amountCents = out.amountCents;
  if (out.targetId !== undefined) decision.targetId = out.targetId;
  return decision;
}

/** Public entry point. NEVER throws: any internal failure becomes a DENY (fail closed). */
export function evaluate(input: EvaluationInput): Decision {
  try {
    return evaluateInner(input);
  } catch (err) {
    const toolName = typeof input?.toolName === "string" ? input.toolName : "unknown";
    return {
      verdict: "DENY",
      tier: "UNKNOWN",
      toolName,
      reasons: [
        {
          code: "INTERNAL_ERROR",
          message: `Policy engine error (${err instanceof Error ? err.message : "unknown"}). Blocked to be safe.`,
        },
      ],
    };
  }
}
