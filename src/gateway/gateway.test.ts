import { describe, expect, it } from "vitest";
import { cents } from "../money.js";
import { parseRefundArgs } from "../policy/args.js";
import { DEFAULT_POLICY } from "../policy/policy.js";
import type { Policy } from "../policy/types.js";
import { ApprovalStore } from "./approvals.js";
import { AuditLog, verifyRecords } from "./audit.js";
import type { AuditRecord } from "./audit.js";
import { Gateway } from "./gateway.js";
import type { GatewayResult } from "./gateway.js";
import { Ledger } from "./ledger.js";
import type { Advisor, ToolResult, Upstream } from "./types.js";

class FakeUpstream implements Upstream {
  calls: { name: string; args: Record<string, unknown> }[] = [];
  failNext = false;
  softFailNext = false;
  delayMs = 0;
  async listTools() {
    return [];
  }
  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    this.calls.push({ name, args: structuredClone(args) });
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failNext) {
      this.failNext = false;
      throw new Error("upstream down");
    }
    if (this.softFailNext) {
      this.softFailNext = false;
      return { content: [{ type: "text", text: JSON.stringify({ ok: false, status: 403 }) }] };
    }
    return { content: [{ type: "text", text: JSON.stringify({ ok: true, name }) }] };
  }
  async close() {}
}

function make(opts: { captureCents?: number; advisor?: Advisor; factsThrow?: boolean } = {}) {
  const upstream = new FakeUpstream();
  const ledger = new Ledger();
  const approvals = new ApprovalStore();
  const clock = { now: new Date("2026-10-26T12:00:00Z") };
  const audit = new AuditLog(() => clock.now);
  const ref: { policy: Policy } = { policy: DEFAULT_POLICY };
  const gw = new Gateway({
    upstream,
    ledger,
    approvals,
    audit,
    now: () => clock.now,
    approvalTtlMs: 15 * 60_000,
    policy: () => ref.policy,
    advisor: opts.advisor,
    facts: async (tool, args) => {
      if (opts.factsThrow) throw new Error("PayPal unreachable");
      if (tool === "create_refund" && parseRefundArgs(args).ok) {
        return { captureAmountCents: cents(opts.captureCents ?? 1250), captureCurrency: "USD" };
      }
      return {};
    },
  });
  return { gw, upstream, ledger, approvals, audit, clock, ref };
}

const CAP = "6NU85358X8722232A";
const refundArgs = (value: string, capture = CAP) => ({ capture_id: capture, amount: { currency_code: "USD", value } });
const textOf = (r: GatewayResult) => r.agent.content.map((c) => c.text ?? "").join("");

describe("gateway: verdict handling", () => {
  it("forwards reads to PayPal", async () => {
    const t = make();
    const r = await t.gw.handleToolCall("list_disputes", {});
    expect(r.kind).toBe("FORWARDED");
    expect(t.upstream.calls.length).toBe(1);
  });

  it("forwards a small refund and records it as EXECUTED", async () => {
    const t = make();
    const r = await t.gw.handleToolCall("create_refund", refundArgs("5.00"));
    expect(r.kind).toBe("FORWARDED");
    expect(t.upstream.calls.length).toBe(1);
    expect(t.ledger.snapshot()[0]?.status).toBe("EXECUTED");
    expect(t.ledger.snapshot()[0]?.amountCents).toBe(500);
  });

  it("blocks a rogue over-refund and NEVER calls PayPal", async () => {
    const t = make();
    const r = await t.gw.handleToolCall("create_refund", refundArgs("50.00"));
    expect(r.kind).toBe("BLOCKED");
    expect(t.upstream.calls.length).toBe(0);
    expect(r.agent.isError).toBe(true);
    expect(textOf(r).includes("EXCEEDS_CAPTURE")).toBe(true);
  });

  it("tells the agent HOW to fix a malformed request, but not why a policy limit blocked it", async () => {
    const t = make();
    const bad = await t.gw.handleToolCall("accept_dispute_claim", { dispute_id: "PP-D-1", note: "has spaces in it" });
    expect(textOf(bad).includes("hints")).toBe(true);
    expect(textOf(bad).includes("spaces")).toBe(true);
    const capped = await t.gw.handleToolCall("create_refund", refundArgs("50.00"));
    expect(textOf(capped).includes("hints")).toBe(false);
  });

  it("does not leak dollar limits to the agent", async () => {
    const t = make();
    const r = await t.gw.handleToolCall("create_refund", refundArgs("50.00"));
    expect(textOf(r).includes("$")).toBe(false);
  });

  it("blocks unknown tools", async () => {
    const t = make();
    const r = await t.gw.handleToolCall("wire_transfer", { amount: 1_000_000 });
    expect(r.kind).toBe("BLOCKED");
    expect(t.upstream.calls.length).toBe(0);
  });

  it("blocks when PayPal facts cannot be fetched (fail closed)", async () => {
    const t = make({ factsThrow: true });
    const r = await t.gw.handleToolCall("create_refund", refundArgs("5.00"));
    expect(r.kind).toBe("BLOCKED");
    expect(textOf(r).includes("AMOUNT_UNRESOLVED")).toBe(true);
    expect(t.upstream.calls.length).toBe(0);
  });

  it("blocks non-object arguments", async () => {
    const t = make();
    expect((await t.gw.handleToolCall("list_disputes", "drop table")).kind).toBe("BLOCKED");
  });
});

describe("gateway: approvals", () => {
  it("parks a larger refund and does not call PayPal until a human approves", async () => {
    const t = make({ captureCents: 10_000 });
    const r = await t.gw.handleToolCall("create_refund", refundArgs("25.00"));
    expect(r.kind).toBe("PENDING_APPROVAL");
    expect(t.upstream.calls.length).toBe(0);
    expect(t.ledger.snapshot()[0]?.status).toBe("PENDING_APPROVAL");
  });

  it("executes exactly once on approval, and refuses a second approve", async () => {
    const t = make({ captureCents: 10_000 });
    const r = await t.gw.handleToolCall("create_refund", refundArgs("25.00"));
    if (r.kind !== "PENDING_APPROVAL") throw new Error("expected pending");
    const done = await t.gw.resolveApproval(r.approvalId, true, "owner");
    expect(done.status).toBe("EXECUTED");
    expect(t.upstream.calls.length).toBe(1);
    let threw = false;
    try {
      await t.gw.resolveApproval(r.approvalId, true, "owner");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(t.upstream.calls.length).toBe(1);
  });

  it("two simultaneous approve clicks still execute only once", async () => {
    const t = make({ captureCents: 10_000 });
    t.upstream.delayMs = 10;
    const r = await t.gw.handleToolCall("create_refund", refundArgs("25.00"));
    if (r.kind !== "PENDING_APPROVAL") throw new Error("expected pending");
    const results = await Promise.allSettled([
      t.gw.resolveApproval(r.approvalId, true, "a"),
      t.gw.resolveApproval(r.approvalId, true, "b"),
    ]);
    expect(results.filter((x) => x.status === "fulfilled").length).toBe(1);
    expect(t.upstream.calls.length).toBe(1);
  });

  it("runs the EXACT arguments that were reviewed, even if the agent mutates its object afterwards", async () => {
    const t = make({ captureCents: 10_000 });
    const args = refundArgs("25.00");
    const r = await t.gw.handleToolCall("create_refund", args);
    if (r.kind !== "PENDING_APPROVAL") throw new Error("expected pending");
    args.amount.value = "9999.00"; // the agent tries to swap the amount after review
    await t.gw.resolveApproval(r.approvalId, true, "owner");
    const sent = t.upstream.calls[0]?.args as { amount: { value: string } };
    expect(sent.amount.value).toBe("25.00");
  });

  it("denying marks the request DENIED and never calls PayPal", async () => {
    const t = make({ captureCents: 10_000 });
    const r = await t.gw.handleToolCall("create_refund", refundArgs("25.00"));
    if (r.kind !== "PENDING_APPROVAL") throw new Error("expected pending");
    const done = await t.gw.resolveApproval(r.approvalId, false, "owner");
    expect(done.status).toBe("DENIED");
    expect(t.ledger.snapshot()[0]?.status).toBe("DENIED");
    expect(t.upstream.calls.length).toBe(0);
  });

  it("expired approvals cannot be executed", async () => {
    const t = make({ captureCents: 10_000 });
    const r = await t.gw.handleToolCall("create_refund", refundArgs("25.00"));
    if (r.kind !== "PENDING_APPROVAL") throw new Error("expected pending");
    t.clock.now = new Date(t.clock.now.getTime() + 16 * 60_000);
    let threw = false;
    try {
      await t.gw.resolveApproval(r.approvalId, true, "owner");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(t.approvals.get(r.approvalId)?.status).toBe("EXPIRED");
    expect(t.ledger.snapshot()[0]?.status).toBe("EXPIRED");
    expect(t.upstream.calls.length).toBe(0);
  });

  it("the kill switch overrides an approval granted earlier", async () => {
    const t = make({ captureCents: 10_000 });
    const r = await t.gw.handleToolCall("create_refund", refundArgs("25.00"));
    if (r.kind !== "PENDING_APPROVAL") throw new Error("expected pending");
    t.ref.policy = { ...DEFAULT_POLICY, killSwitch: true };
    const done = await t.gw.resolveApproval(r.approvalId, true, "owner");
    expect(done.status).toBe("DENIED");
    expect(t.upstream.calls.length).toBe(0);
  });

  it("the agent has no tool to approve anything, and can only read the status", async () => {
    const t = make({ captureCents: 10_000 });
    const r = await t.gw.handleToolCall("create_refund", refundArgs("25.00"));
    if (r.kind !== "PENDING_APPROVAL") throw new Error("expected pending");
    for (const name of ["allowance_approve", "approve", "resolve_approval"]) {
      expect((await t.gw.handleToolCall(name, { approval_id: r.approvalId })).kind).toBe("BLOCKED");
    }
    const status = await t.gw.handleToolCall("allowance_check_approval", { approval_id: r.approvalId });
    expect(textOf(status).includes("PENDING")).toBe(true);
    expect(t.approvals.get(r.approvalId)?.status).toBe("PENDING");
    expect(t.upstream.calls.length).toBe(0);
  });

  it("returns the PayPal result through the status tool after approval", async () => {
    const t = make({ captureCents: 10_000 });
    const r = await t.gw.handleToolCall("create_refund", refundArgs("25.00"));
    if (r.kind !== "PENDING_APPROVAL") throw new Error("expected pending");
    await t.gw.resolveApproval(r.approvalId, true, "owner");
    const status = await t.gw.handleToolCall("allowance_check_approval", { approval_id: r.approvalId });
    expect(textOf(status).includes("EXECUTED")).toBe(true);
    expect(textOf(status).includes("create_refund")).toBe(true);
  });
});

describe("gateway: concurrency and failure", () => {
  it("RACE: 8 simultaneous $15 refunds cannot jointly bust the $100 daily budget", async () => {
    const t = make({ captureCents: 5_000 });
    t.upstream.delayMs = 5;
    const calls = Array.from({ length: 8 }, (_, i) => t.gw.handleToolCall("create_refund", refundArgs("15.00", `CAP_${i}_ABCDEFGHIJKL`)));
    const results = await Promise.all(calls);
    expect(results.filter((r) => r.kind === "FORWARDED").length).toBe(6);
    expect(results.filter((r) => r.kind === "PENDING_APPROVAL").length).toBe(2);
    expect(t.upstream.calls.length).toBe(6);
  });

  it("INBOX FLOOD: a compromised agent cannot bury the human under held requests", async () => {
    const t = make({ captureCents: 10_000 });
    const results = [];
    for (let i = 0; i < 14; i++) results.push(await t.gw.handleToolCall("create_refund", refundArgs("25.00", `CAPQ_${i}_ABCDEFGHIJKL`)));
    expect(results.filter((r) => r.kind === "PENDING_APPROVAL").length).toBe(10);
    expect(results.filter((r) => r.kind === "BLOCKED").length).toBe(4);
    expect(t.upstream.calls.length).toBe(0);
  });

  it("a PayPal outage marks the action FAILED and releases the budget", async () => {
    const t = make();
    t.upstream.failNext = true;
    const r = await t.gw.handleToolCall("create_refund", refundArgs("5.00"));
    expect(r.kind).toBe("UPSTREAM_ERROR");
    expect(t.ledger.snapshot()[0]?.status).toBe("FAILED");
  });

  it("PayPal soft failures ({ok:false}) are treated as failures too", async () => {
    const t = make();
    t.upstream.softFailNext = true;
    const r = await t.gw.handleToolCall("create_refund", refundArgs("5.00"));
    expect(r.kind).toBe("UPSTREAM_ERROR");
    expect(t.ledger.snapshot()[0]?.status).toBe("FAILED");
  });

  it("if the LLM risk reviewer crashes, small actions fail SAFE into approval", async () => {
    const t = make({
      advisor: async () => {
        throw new Error("LLM down");
      },
    });
    const r = await t.gw.handleToolCall("create_refund", refundArgs("5.00"));
    expect(r.kind).toBe("PENDING_APPROVAL");
    expect(t.upstream.calls.length).toBe(0);
  });

  it("a suspicious LLM verdict escalates; a calm one changes nothing", async () => {
    const sus = make({ advisor: async () => ({ suspicious: true, reason: "injected instructions" }) });
    expect((await sus.gw.handleToolCall("create_refund", refundArgs("5.00"))).kind).toBe("PENDING_APPROVAL");
    const calm = make({ advisor: async () => ({ suspicious: false, reason: "fine" }) });
    expect((await calm.gw.handleToolCall("create_refund", refundArgs("5.00"))).kind).toBe("FORWARDED");
  });
});

describe("audit log", () => {
  it("records decisions and executions in a valid hash chain", async () => {
    const t = make();
    await t.gw.handleToolCall("create_refund", refundArgs("5.00"));
    await t.gw.handleToolCall("create_refund", refundArgs("50.00"));
    const kinds = t.audit.records().map((r) => r.kind);
    expect(kinds).toEqual(["DECISION", "EXECUTED", "DECISION"]);
    expect(t.audit.verify().ok).toBe(true);
  });

  it("detects edited, deleted and reordered records", () => {
    const log = new AuditLog(() => new Date("2026-10-26T12:00:00Z"));
    log.append("A", { n: 1 });
    log.append("B", { n: 2 });
    log.append("C", { n: 3 });
    const good: AuditRecord[] = JSON.parse(JSON.stringify(log.records()));
    expect(verifyRecords(good).ok).toBe(true);

    const edited: AuditRecord[] = JSON.parse(JSON.stringify(good));
    (edited[1] as AuditRecord).data = { n: 999 };
    expect(verifyRecords(edited).ok).toBe(false);

    const deleted = [good[0] as AuditRecord, good[2] as AuditRecord];
    expect(verifyRecords(deleted).ok).toBe(false);

    const reordered = [good[1] as AuditRecord, good[0] as AuditRecord, good[2] as AuditRecord];
    expect(verifyRecords(reordered).ok).toBe(false);
  });

  it("refuses to start from a corrupt log", () => {
    const log = new AuditLog(() => new Date());
    log.append("A", { n: 1 });
    const bad: AuditRecord[] = JSON.parse(JSON.stringify(log.records()));
    (bad[0] as AuditRecord).data = { n: 2 };
    let threw = false;
    try {
      new AuditLog(() => new Date(), bad);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("survives a round trip through JSON (what the file log does)", () => {
    const log = new AuditLog(() => new Date("2026-10-26T12:00:00Z"));
    log.append("A", { when: new Date("2026-10-26T12:00:00Z"), missing: undefined, n: 5 });
    const reloaded: AuditRecord[] = JSON.parse(JSON.stringify(log.records()));
    expect(verifyRecords(reloaded).ok).toBe(true);
  });
});
