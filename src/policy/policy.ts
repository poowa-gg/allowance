import { cents } from "../money.js";
import type { Policy } from "./types.js";

/**
 * Conservative defaults for a small merchant. Everything is in integer cents.
 * (Loading/validating user-supplied policies with zod arrives on Day 10, when
 * the LLM starts compiling plain-English rules into this shape.)
 */
export const DEFAULT_POLICY: Policy = Object.freeze({
  version: 1,
  killSwitch: false,
  currency: "USD",
  money: Object.freeze({
    autoApproveUpToCents: cents(2_000), // $20.00
    hardCapCents: cents(50_000), // $500.00
    dailyLimitCents: cents(10_000), // $100.00 per rolling 24h
    maxActionsPerHour: 10,
    maxActionsPerTargetPerHour: 3,
  }),
  approvals: Object.freeze({ maxPending: 10 }),
  customerFacing: Object.freeze({
    autoAllow: Object.freeze(["send_invoice_reminder"] as const),
    maxPerHour: 20,
  }),
}) as Policy;
