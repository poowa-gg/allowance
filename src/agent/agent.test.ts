import { describe, expect, it } from "vitest";
import { SimulatedPayPal } from "../app/simulated.js";
import { ApprovalStore } from "../gateway/approvals.js";
import { AuditLog } from "../gateway/audit.js";
import { Gateway } from "../gateway/gateway.js";
import { Ledger } from "../gateway/ledger.js";
import { DEFAULT_POLICY } from "../policy/policy.js";
import { runAgent } from "./agent.js";
import type { AgentEvent } from "./agent.js";
import { ObedientSimulator } from "./obedient.js";
import { DEMO_TICKETS } from "./tickets.js";
import type { Completion, LlmClient } from "../llm/types.js";

function rig() {
  const sim = new SimulatedPayPal();
  const approvals = new ApprovalStore();
  const gateway = new Gateway({
    upstream: sim,
    facts: sim.facts,
    policy: () => DEFAULT_POLICY,
    ledger: new Ledger(),
    audit: new AuditLog(() => new Date()),
    approvals,
    now: () => new Date(),
    approvalTtlMs: 15 * 60_000,
  });
  return { sim, approvals, gateway };
}

const tools = (events: AgentEvent[]) => events.filter((e) => e.kind === "tool");

describe("agent + gateway: the poisoned invoice", () => {
  it("a fully obedient agent is fooled, yet only the honest $5 refund moves money", async () => {
    const { sim, gateway, approvals } = rig();
    const events = await runAgent({ llm: new ObedientSimulator(), gateway, tickets: DEMO_TICKETS });

    const calls = tools(events);
    // T1 honest refund: allowed. T2 injected full refund of $600: blocked. T2 reminder cc attacker: held. T3 dispute: held.
    expect(calls.map((c) => `${c.ticketId}:${c.tool}:${c.outcome}`)).toEqual([
      "T1:create_refund:ALLOWED",
      "T2:create_refund:BLOCKED",
      "T2:send_invoice_reminder:HELD",
      "T3:accept_dispute_claim:HELD",
    ]);
    expect(sim.totalMoneyOutCents()).toBe(500);
    expect(approvals.pending().length).toBe(2);
  });

  it("explains WHY the injected refund was blocked", async () => {
    const { gateway } = rig();
    const events = await runAgent({ llm: new ObedientSimulator(), gateway, tickets: DEMO_TICKETS });
    const bad = tools(events).find((e) => e.ticketId === "T2" && e.tool === "create_refund");
    expect((bad?.codes ?? []).includes("OVER_HARD_CAP")).toBe(true);
    expect((bad?.codes ?? []).includes("FULL_REFUND_BY_OMISSION")).toBe(true);
    const leak = tools(events).find((e) => e.tool === "send_invoice_reminder");
    expect((leak?.codes ?? []).includes("EXTERNAL_RECIPIENTS")).toBe(true);
  });

  it("with the kill switch on, the fooled agent moves no money at all", async () => {
    const { sim, approvals } = rig();
    const gateway = new Gateway({
      upstream: sim, facts: sim.facts, policy: () => ({ ...DEFAULT_POLICY, killSwitch: true }),
      ledger: new Ledger(), audit: new AuditLog(() => new Date()), approvals, now: () => new Date(), approvalTtlMs: 60_000,
    });
    const events = await runAgent({ llm: new ObedientSimulator(), gateway, tickets: DEMO_TICKETS });
    expect(tools(events).every((e) => e.outcome === "BLOCKED")).toBe(true);
    expect(sim.totalMoneyOutCents()).toBe(0);
  });

  it("a crashing language model is reported, not fatal, and other tickets still run", async () => {
    const { gateway } = rig();
    let calls = 0;
    const flaky: LlmClient = {
      label: "flaky",
      async complete(): Promise<Completion> {
        calls++;
        if (calls === 1) throw new Error("API down");
        return { content: [{ type: "text", text: "ok" }], stop: "end" };
      },
    };
    const events = await runAgent({ llm: flaky, gateway, tickets: DEMO_TICKETS });
    expect(events.filter((e) => e.kind === "error").length).toBe(1);
    expect(events.filter((e) => e.kind === "ticket").length).toBe(3);
  });

  it("a model that never stops calling tools is cut off by the step limit", async () => {
    const { gateway } = rig();
    const looper: LlmClient = {
      label: "looper",
      async complete(): Promise<Completion> {
        return { content: [{ type: "tool_use", id: "x", name: "list_disputes", input: {} }], stop: "tool_use" };
      },
    };
    const events = await runAgent({ llm: looper, gateway, tickets: [DEMO_TICKETS[0]!], maxSteps: 3 });
    expect(tools(events).length).toBe(3);
  });
});
