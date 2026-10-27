import { ApprovalStore } from "../gateway/approvals.js";
import { AuditLog, createFileAuditLog, verifyRecords } from "../gateway/audit.js";
import { Gateway } from "../gateway/gateway.js";
import { Ledger } from "../gateway/ledger.js";
import type { FactsResolver, Upstream } from "../gateway/types.js";
import { randomUUID } from "node:crypto";
import { toDecimalString, cents } from "../money.js";
import { DEFAULT_POLICY } from "../policy/policy.js";
import type { Policy } from "../policy/types.js";
import { runAgent } from "../agent/agent.js";
import type { AgentEvent } from "../agent/agent.js";
import { ObedientSimulator } from "../agent/obedient.js";
import { DEMO_TICKETS } from "../agent/tickets.js";
import type { Advisor } from "../gateway/types.js";
import { createLlmFromEnv } from "../llm/factory.js";
import { createRiskReviewer } from "../llm/reviewer.js";
import { PRESETS, compilePolicy, validateChanges } from "../policy/compile.js";
import type { LlmClient } from "../llm/types.js";
import { RateLimiter } from "./limiter.js";
import { runRedTeam } from "./attacks.js";
import type { RedTeamReport } from "./attacks.js";
import { SIM, SimulatedPayPal } from "./simulated.js";

export type Mode = "demo" | "live";

interface State {
  ledger: Ledger;
  approvals: ApprovalStore;
  audit: AuditLog;
  sim: SimulatedPayPal;
  gateway: Gateway;
}

interface LiveDeps {
  upstream: Upstream;
  facts: FactsResolver;
}

const DAY_MS = 86_400_000;
const MONEY_OUT = ["create_refund", "accept_dispute_claim"];

/** Everything the dashboard needs, in one object. Owns the gateway and its stores. */
export class AppRuntime {
  readonly mode: Mode;
  policy: Policy = DEFAULT_POLICY;
  private live: LiveDeps | undefined;
  private s: State;
  private readonly llm: LlmClient | undefined;
  private readonly limiter: RateLimiter;
  private advisorActive = false;
  private reviewContext: string | undefined;
  private readonly advisorFn: Advisor;
  private proposals = new Map<string, { raw: unknown; source: "ai" | "preset"; text?: string; at: number }>();

  constructor(mode: Mode, live?: LiveDeps, limiter?: RateLimiter) {
    this.mode = mode;
    this.live = live;
    this.limiter = limiter ?? new RateLimiter(Number(process.env["ALLOWANCE_MAX_LLM_RUNS_PER_HOUR"] ?? 30), 3_600_000);
    this.llm = createLlmFromEnv(process.env);
    const reviewer = this.llm ? createRiskReviewer(this.llm, () => this.reviewContext) : undefined;
    // The AI reviewer only runs during agent runs, so the deterministic Red Team never spends AI credits.
    this.advisorFn = async (call) => (this.advisorActive && reviewer ? reviewer(call) : undefined);
    this.s = this.build();
  }

  /** Live mode connects to the real PayPal sandbox. The imports are lazy so demo mode needs no PayPal packages at all. */
  static async create(mode: Mode): Promise<AppRuntime> {
    if (mode === "demo") return new AppRuntime("demo");
    const { PayPalMcpUpstream } = await import("../mcp/upstream.js");
    const { paypalFactsResolver } = await import("../gateway/facts.js");
    const upstream = new PayPalMcpUpstream();
    await upstream.connect();
    return new AppRuntime("live", { upstream, facts: paypalFactsResolver });
  }

  private build(): State {
    const ledger = new Ledger();
    const approvals = new ApprovalStore();
    const audit = this.mode === "live" ? createFileAuditLog("data/audit.jsonl", () => new Date()) : new AuditLog(() => new Date());
    const sim = new SimulatedPayPal();
    const gateway = new Gateway({
      upstream: this.live ? this.live.upstream : sim,
      facts: this.live ? this.live.facts : sim.facts,
      policy: () => this.policy,
      ledger,
      audit,
      approvals,
      now: () => new Date(),
      approvalTtlMs: 15 * 60_000,
      advisor: this.advisorFn,
    });
    return { ledger, approvals, audit, sim, gateway };
  }

  get gateway(): Gateway {
    return this.s.gateway;
  }

  /** Demo only: start from a clean slate. Live mode keeps its audit trail. */
  reset(): void {
    if (this.mode !== "demo") throw new Error("Reset is only available in demo mode.");
    this.policy = DEFAULT_POLICY;
    this.s = this.build();
  }

  /** Demo only: secretly edit an old audit record so the chain check can catch it. */
  tamper(): void {
    if (this.mode !== "demo") throw new Error("Tamper demo is only available in demo mode.");
    const recs = this.s.audit.records() as unknown as { data: unknown }[];
    const target = recs.find((r) => (r.data as { verdict?: string } | null)?.verdict === "DENY") ?? recs[0];
    if (!target) throw new Error("Nothing to tamper with yet. Run the Red Team first.");
    (target as { data: unknown }).data = { rewritten: "history was edited" };
  }

  setKillSwitch(on: boolean, by: string): void {
    this.policy = { ...this.policy, killSwitch: on };
    this.s.audit.append("KILL_SWITCH", { on, by });
  }

  async denyAllPending(by: string): Promise<number> {
    let n = 0;
    for (const a of this.s.approvals.pending()) {
      await this.s.gateway.resolveApproval(a.id, false, by);
      n++;
    }
    return n;
  }

  /**
   * Where hostile or automated activity runs. Demo mode uses the main gateway so the dashboard
   * fills up live. Live mode uses an ISOLATED simulated range, so no real money can ever move.
   */
  private range() {
    if (this.mode === "demo") return { gw: this.s.gateway, sim: this.s.sim, approvals: this.s.approvals, range: "main" as const };
    const iso = new SimulatedPayPal();
    const approvals = new ApprovalStore();
    const gw = new Gateway({
      upstream: iso,
      facts: iso.facts,
      policy: () => this.policy,
      ledger: new Ledger(),
      audit: new AuditLog(() => new Date()),
      approvals,
      now: () => new Date(),
      approvalTtlMs: 15 * 60_000,
      advisor: this.advisorFn,
    });
    return { gw, sim: iso, approvals, range: "isolated" as const };
  }

  async redTeam(): Promise<RedTeamReport & { range: "main" | "isolated" }> {
    const { gw, sim, approvals, range } = this.range();
    const pendingBefore = new Set(approvals.pending().map((a) => a.id));
    const report = await runRedTeam(gw, sim, this.policy);
    // Tidy up: deny the approvals the attacks created so the inbox stays clean.
    for (const a of approvals.pending()) {
      if (!pendingBefore.has(a.id)) await gw.resolveApproval(a.id, false, "red-team-cleanup");
    }
    return { ...report, range };
  }

  agentLabel(): string | null {
    return this.llm ? this.llm.label : null;
  }

  /** Runs the demo agent over the inbox. "auto" uses a real LLM if a key is configured, else the simulator. */
  async runAgent(engine: "auto" | "llm" | "obedient"): Promise<{ engine: string; reviewer: string | null; range: "main" | "isolated"; events: AgentEvent[]; moneyOutCents: number }> {
    let client: LlmClient;
    if (engine === "obedient" || (engine === "auto" && !this.llm)) client = new ObedientSimulator();
    else if (this.llm) client = this.llm;
    else throw new Error("No language-model key is configured. Add ANTHROPIC_API_KEY (or LLM_BASE_URL, LLM_API_KEY, LLM_MODEL) to .env and restart.");

    // Protect the owner's AI credits (shared across every visitor when the demo is public).
    if (this.llm && !this.limiter.tryTake()) throw new Error("This demo's AI budget for the hour is used up. Use the simulator, or come back later.");

    const { gw, sim, range } = this.range();
    const before = sim.totalMoneyOutCents();
    this.advisorActive = this.llm !== undefined;
    try {
      const events = await runAgent({ llm: client, gateway: gw, tickets: DEMO_TICKETS, onTicket: (t) => void (this.reviewContext = t.body) });
      return { engine: client.label, reviewer: this.llm ? this.llm.label : null, range, events, moneyOutCents: sim.totalMoneyOutCents() - before };
    } finally {
      this.advisorActive = false;
      this.reviewContext = undefined;
    }
  }

  // ---------------------------------------------------------------- policy in plain English
  /** Drafts a policy change (from English via the AI, or from a preset). Nothing changes until applyPolicy(). */
  async proposePolicy(input: { text?: string; preset?: string }): Promise<{ proposalId: string; source: "ai" | "preset"; explanation: string; changes: { label: string; from: string; to: string }[] }> {
    let raw: unknown;
    let explanation: string;
    let source: "ai" | "preset";
    if (input.preset !== undefined) {
      const preset = Object.hasOwn(PRESETS, input.preset) ? PRESETS[input.preset] : undefined;
      if (!preset) throw new Error("Unknown preset.");
      raw = preset.changes;
      explanation = preset.description;
      source = "preset";
    } else {
      if (!this.llm) throw new Error("Typing rules in English needs an AI key (see the setup notes). The preset buttons work without one.");
      if (!this.limiter.tryTake()) throw new Error("This demo's AI budget for the hour is used up. Try a preset, or come back later.");
      const compiled = await compilePolicy(this.llm, input.text ?? "", this.policy);
      raw = compiled.raw;
      explanation = compiled.explanation;
      source = "ai";
    }
    const check = validateChanges(raw, this.policy);
    if (!check.ok) throw new Error(check.error);
    const now = Date.now();
    for (const [k, v] of this.proposals) if (now - v.at > 600_000) this.proposals.delete(k);
    const proposalId = randomUUID();
    this.proposals.set(proposalId, { raw, source, text: input.text, at: now });
    return { proposalId, source, explanation, changes: check.changes.map((c) => ({ label: c.label, from: c.from, to: c.to })) };
  }

  /** Applies a proposal the owner confirmed. One-time use; re-validated against the CURRENT policy. */
  applyPolicy(proposalId: string, by: string): { applied: number } {
    const p = this.proposals.get(proposalId);
    if (!p || Date.now() - p.at > 600_000) throw new Error("That proposal expired. Draft it again.");
    this.proposals.delete(proposalId);
    const check = validateChanges(p.raw, this.policy);
    if (!check.ok) throw new Error(check.error);
    this.policy = check.policy; // the kill switch is never touched by this path
    this.s.audit.append("POLICY_CHANGED", { by, source: p.source, text: p.text ?? null, changes: check.changes });
    return { applied: check.changes.length };
  }

  presets(): { label: string; tool: string; args: unknown }[] {
    const cap = this.mode === "demo" ? SIM.SMALL : "YOUR_CAPTURE_ID_HERE";
    const mid = this.mode === "demo" ? SIM.MID : "YOUR_CAPTURE_ID_HERE";
    return [
      { label: "Small refund ($5.00): allowed", tool: "create_refund", args: { capture_id: cap, amount: { currency_code: "USD", value: "5.00" } } },
      { label: "Refund with NO amount: held", tool: "create_refund", args: { capture_id: mid } },
      { label: "Huge refund ($500): blocked", tool: "create_refund", args: { capture_id: cap, amount: { currency_code: "USD", value: "500.00" } } },
      { label: "Invented tool: blocked", tool: "wire_transfer", args: { amount: 1000000 } },
      { label: "Read disputes: allowed", tool: "list_disputes", args: {} },
    ];
  }

  /** One JSON snapshot for the dashboard. */
  state() {
    const { ledger, approvals, audit } = this.s;
    this.s.gateway.sweepExpired();
    const now = Date.now();
    const rows = ledger.snapshot();
    const spent = rows
      .filter((r) => r.status === "EXECUTED" && MONEY_OUT.includes(r.toolName) && now - r.at.getTime() < DAY_MS)
      .reduce((t, r) => t + r.amountCents, 0);

    const recs = audit.records();
    let allowed = 0;
    let held = 0;
    let blocked = 0;
    for (const r of recs) {
      if (r.kind !== "DECISION") continue;
      const v = (r.data as { verdict?: string } | null)?.verdict;
      if (v === "ALLOW") allowed++;
      else if (v === "REQUIRE_APPROVAL") held++;
      else if (v === "DENY") blocked++;
    }
    const chain = verifyRecords(recs);

    return {
      mode: this.mode,
      policy: {
        killSwitch: this.policy.killSwitch,
        autoApproveUpTo: `$${toDecimalString(this.policy.money.autoApproveUpToCents)}`,
        hardCap: `$${toDecimalString(this.policy.money.hardCapCents)}`,
        dailyLimit: `$${toDecimalString(this.policy.money.dailyLimitCents)}`,
        aiAvailable: this.llm !== undefined,
        presets: Object.keys(PRESETS).map((k) => ({ id: k, label: PRESETS[k]!.label, description: PRESETS[k]!.description })),
      },
      budget: { spentCents: cents(spent), limitCents: this.policy.money.dailyLimitCents },
      counts: { allowed, held, blocked },
      pending: approvals.pending().map((a) => ({
        id: a.id,
        tool: a.toolName,
        args: a.args,
        amountCents: a.decision.amountCents ?? null,
        target: a.decision.targetId ?? null,
        reasons: a.decision.reasons.map((r) => ({ code: r.code, message: r.message })),
        expiresAt: a.expiresAt.toISOString(),
      })),
      ledger: rows.map((r) => ({
        at: r.at.toISOString(),
        tool: r.toolName,
        target: r.targetId ?? "",
        amount: r.amountCents > 0 ? `$${toDecimalString(r.amountCents)}` : "",
        status: r.status,
      })).reverse().slice(0, 200),
      audit: recs
        .slice(-300)
        .map((r) => {
          const d = (r.data ?? {}) as { toolName?: string; verdict?: string; decision?: { amountCents?: number; reasons?: { code: string }[] }; approvalId?: string; outcome?: string; on?: boolean };
          const codes = (d.decision?.reasons ?? []).map((x) => x.code).filter((c) => c !== "WITHIN_POLICY").join(", ");
          return {
            seq: r.seq,
            at: r.at,
            kind: r.kind,
            tool: d.toolName ?? "",
            verdict: d.verdict ?? d.outcome ?? (r.kind === "KILL_SWITCH" ? (d.on ? "ON" : "OFF") : r.kind === "POLICY_CHANGED" ? "UPDATED" : ""),
            codes,
            amount: d.decision?.amountCents ? `$${toDecimalString(cents(d.decision.amountCents))}` : "",
            hash: r.hash.slice(0, 12),
          };
        })
        .reverse(),
      chain,
      auditCount: recs.length,
      presets: this.presets(),
      agent: { llm: this.agentLabel(), reviewer: this.agentLabel() },
    };
  }
}
