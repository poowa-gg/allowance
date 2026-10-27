import type { Cents } from "../money.js";
import type { KnownTool, RiskTier } from "./risk.js";

export type Verdict = "ALLOW" | "REQUIRE_APPROVAL" | "DENY";

/** Machine-readable reason codes. They feed the audit log, the approval card and the Red Team scoreboard. */
export type ReasonCode =
  | "KILL_SWITCH"
  | "UNKNOWN_TOOL"
  | "INVALID_ARGS"
  | "AMOUNT_UNRESOLVED"
  | "CURRENCY_MISMATCH"
  | "EXCEEDS_CAPTURE"
  | "CUMULATIVE_EXCEEDS_CAPTURE"
  | "OVER_HARD_CAP"
  | "ABOVE_AUTO_APPROVE"
  | "DAILY_LIMIT"
  | "VELOCITY"
  | "TARGET_VELOCITY"
  | "EXTERNAL_RECIPIENTS"
  | "CUSTOMER_FACING_NEEDS_APPROVAL"
  | "ADVISORY_SUSPICIOUS"
  | "APPROVAL_QUEUE_FULL"
  | "FULL_REFUND_BY_OMISSION"
  | "UNHANDLED_MONEY_TOOL"
  | "INTERNAL_ERROR"
  | "WITHIN_POLICY";

export interface Reason {
  code: ReasonCode;
  message: string;
}

export interface Decision {
  verdict: Verdict;
  tier: RiskTier | "UNKNOWN";
  toolName: string;
  amountCents?: Cents;
  targetId?: string;
  reasons: Reason[];
}

/**
 * FACTS are looked up from PayPal by the proxy BEFORE evaluation (e.g. "how big
 * is this capture?"). They are never taken from the agent. That is what lets the
 * engine stay a pure function: same input, same answer, trivially testable.
 */
export interface Facts {
  captureAmountCents?: Cents;
  captureCurrency?: string;
  disputeAmountCents?: Cents;
  disputeCurrency?: string;
  orderAmountCents?: Cents;
  orderCurrency?: string;
}

/**
 * One row per action we allowed, held for approval, or rejected.
 * Only EXECUTED rows count against budgets and velocity. An action is recorded as
 * EXECUTED the moment it is allowed (before PayPal is even called), under a lock,
 * so simultaneous calls cannot each spend the same budget. Held (PENDING_APPROVAL)
 * rows do NOT consume budget: a human decides those, and letting a compromised agent
 * reserve budget by spamming requests would let it starve legitimate work.
 * PENDING rows are only counted to cap the size of the approvals inbox.
 */
export interface LedgerEntry {
  at: Date;
  toolName: string;
  targetId?: string;
  amountCents: Cents;
  status: "PENDING_APPROVAL" | "EXECUTED" | "DENIED" | "EXPIRED" | "FAILED";
}

/** Output of the optional LLM risk reviewer. It can only make decisions STRICTER. */
export interface Advisory {
  suspicious: boolean;
  reason: string;
}

export interface Policy {
  version: 1;
  killSwitch: boolean;
  currency: "USD";
  money: {
    /** Money-out at or below this amount is auto-allowed (inclusive). */
    autoApproveUpToCents: Cents;
    /** Above this, ALWAYS denied, even with human approval. Change the policy to raise it. */
    hardCapCents: Cents;
    /** Rolling 24h total of money-out (refunds + dispute acceptances). Exceeding it needs a human. */
    dailyLimitCents: Cents;
    maxActionsPerHour: number;
    /** Many small actions on ONE target (e.g. one capture) = suspicious structuring. */
    maxActionsPerTargetPerHour: number;
  };
  approvals: {
    /** Max requests waiting for a human. More than this are DENIED, so an agent cannot flood the inbox. */
    maxPending: number;
  };
  customerFacing: {
    /** Customer-facing tools allowed without a human. Everything else needs approval. */
    autoAllow: readonly KnownTool[];
    maxPerHour: number;
  };
}

export interface EvaluationInput {
  toolName: string;
  args: unknown;
  now: Date;
  policy: Policy;
  facts: Facts;
  history: readonly LedgerEntry[];
  advisory?: Advisory;
}
