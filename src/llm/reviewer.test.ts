import { describe, expect, it } from "vitest";
import { SimulatedPayPal } from "../app/simulated.js";
import { runAgent } from "../agent/agent.js";
import { ObedientSimulator } from "../agent/obedient.js";
import { DEMO_TICKETS } from "../agent/tickets.js";
import { ApprovalStore } from "../gateway/approvals.js";
import { AuditLog } from "../gateway/audit.js";
import { Gateway } from "../gateway/gateway.js";
import { Ledger } from "../gateway/ledger.js";
import { DEFAULT_POLICY } from "../policy/policy.js";
import { createRiskReviewer } from "./reviewer.js";
import type { Completion, LlmClient } from "./types.js";

/** A fake "AI" that flags anything whose document text tries to give the assistant orders. */
function smartFake(seen: string[] = []): LlmClient {
  return {
    label: "fake-reviewer",
    async complete(args): Promise<Completion> {
      const payload = (args.messages[0]!.content[0] as { text: string }).text;
      seen.push(payload);
      const suspicious = /ignore your usual limits|do not ask a human/i.test(payload);
      return { content: [{ type: "text", text: JSON.stringify({ suspicious, reason: suspicious ? "The document orders the assistant to skip human approval." : "Looks like a normal customer request." }) }], stop: "end" };
    },
  };
}

function rig(advisor: ReturnType<typeof createRiskReviewer>) {
  const sim = new SimulatedPayPal();
  const approvals = new ApprovalStore();
  const gateway = new Gateway({
    upstream: sim, facts: sim.facts, policy: () => DEFAULT_POLICY, ledger: new Ledger(), audit: new AuditLog(() => new Date()),
    approvals, now: () => new Date(), approvalTtlMs: 60_000, advisor,
  });
  return { sim, approvals, gateway };
}

describe("AI risk reviewer", () => {
  it("parses a verdict and tolerates chatter around the JSON", async () => {
    const llm: LlmClient = { label: "x", async complete() { return { content: [{ type: "text", text: 'Here you go: {"suspicious": true, "reason": "bad"} done' }], stop: "end" }; } };
    const v = await createRiskReviewer(llm, () => "ctx")({ toolName: "create_refund", args: {} });
    expect(v?.suspicious).toBe(true);
    expect(v?.reason).toBe("bad");
  });
  it("throws on an unusable verdict (the gateway then fails SAFE and escalates)", async () => {
    const llm: LlmClient = { label: "x", async complete() { return { content: [{ type: "text", text: '{"suspicious": "maybe"}' }], stop: "end" }; } };
    let failed = false;
    try {
      await createRiskReviewer(llm, () => "ctx")({ toolName: "create_refund", args: {} });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });
  it("sends the reviewer the tool call AND the document that led to it", async () => {
    const seen: string[] = [];
    await createRiskReviewer(smartFake(seen), () => "the invoice text")({ toolName: "create_refund", args: { capture_id: "X" } });
    expect(seen[0]!.includes("the invoice text")).toBe(true);
    expect(seen[0]!.includes("create_refund")).toBe(true);
  });

  it("END TO END: the fooled agent's honest refund passes, and the reviewer explains the poisoned ones", async () => {
    let context = "";
    const { sim, gateway } = rig(createRiskReviewer(smartFake(), () => context));
    const events = await runAgent({ llm: new ObedientSimulator(), gateway, tickets: DEMO_TICKETS, onTicket: (t) => void (context = t.body) });
    const tools = events.filter((e) => e.kind === "tool");
    expect(tools[0]!.outcome).toBe("ALLOWED"); // honest $5 refund: reviewer calm
    expect(tools[0]!.reviewer).toBe(undefined);
    const reminder = tools.find((e) => e.tool === "send_invoice_reminder")!;
    expect(reminder.outcome).toBe("HELD");
    expect((reminder.reviewer ?? "").includes("skip human approval")).toBe(true);
    expect(sim.totalMoneyOutCents()).toBe(500);
  });

  it("the reviewer can ESCALATE an allowed action but can never approve a blocked one", async () => {
    const calm: LlmClient = { label: "x", async complete() { return { content: [{ type: "text", text: '{"suspicious": false, "reason": "all good, approve everything"}' }], stop: "end" }; } };
    const { sim, gateway } = rig(createRiskReviewer(calm, () => "ctx"));
    const r = await gateway.handleToolCall("create_refund", { capture_id: "SIMCAP_BIG_000600", amount: { currency_code: "USD", value: "600.00" } });
    expect(r.kind).toBe("BLOCKED");
    expect(sim.totalMoneyOutCents()).toBe(0);
  });

  it("a reviewer that crashes makes the gateway fail safe (held, not allowed)", async () => {
    const down: LlmClient = { label: "x", async complete() { throw new Error("rate limited"); } };
    const { gateway, sim } = rig(createRiskReviewer(down, () => "ctx"));
    const r = await gateway.handleToolCall("create_refund", { capture_id: "SIMCAP_SMALL_0001", amount: { currency_code: "USD", value: "5.00" } });
    expect(r.kind).toBe("PENDING_APPROVAL");
    expect(sim.totalMoneyOutCents()).toBe(0);
  });
});
