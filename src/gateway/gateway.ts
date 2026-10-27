import { randomUUID } from "node:crypto";
import { cents } from "../money.js";
import { isPlainObject } from "../policy/args.js";
import { evaluate } from "../policy/engine.js";
import { classifyTool } from "../policy/risk.js";
import type { Advisory, Decision, Facts, Policy } from "../policy/types.js";
import type { ApprovalRequest, ApprovalStore } from "./approvals.js";
import type { AuditLog } from "./audit.js";
import type { Ledger } from "./ledger.js";
import { Mutex } from "./mutex.js";
import { CHECK_APPROVAL_TOOL } from "./types.js";
import type { Advisor, FactsResolver, ToolResult, Upstream } from "./types.js";

/**
 * THE GATEWAY: the only door between an AI agent and PayPal.
 *
 * What happens to every tool call the agent makes:
 *   1. Look up trusted FACTS from PayPal (never from the agent).
 *   2. Optionally ask the LLM reviewer for a second opinion (it can only escalate).
 *   3. Under a lock: evaluate the policy AND reserve budget as one step.
 *   4. ALLOW -> forward to PayPal. REQUIRE_APPROVAL -> park it for a human. DENY -> never call PayPal.
 *   5. Record everything in the hash-chained audit log.
 *
 * SECURITY INVARIANTS (your defence points)
 *   - The agent has NO way to approve anything: approval is a method on this class,
 *     exposed to the human dashboard only, never as an MCP tool.
 *   - What the human approves is a private copy of the arguments, so the agent
 *     cannot change the request after it was reviewed.
 *   - The agent is told WHY something was blocked by code, not by numbers, so it
 *     cannot tune its attacks against our exact limits.
 */

export class GatewayError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
  }
}

export interface GatewayDeps {
  upstream: Upstream;
  facts: FactsResolver;
  /** A getter, so the dashboard can flip the kill switch or swap the policy live. */
  policy: () => Policy;
  ledger: Ledger;
  audit: AuditLog;
  approvals: ApprovalStore;
  now: () => Date;
  approvalTtlMs: number;
  advisor?: Advisor;
}

export type GatewayResult =
  | { kind: "FORWARDED"; decision: Decision; agent: ToolResult }
  | { kind: "BLOCKED"; decision: Decision; agent: ToolResult }
  | { kind: "PENDING_APPROVAL"; decision: Decision; approvalId: string; expiresAt: Date; agent: ToolResult }
  | { kind: "UPSTREAM_ERROR"; decision: Decision; agent: ToolResult }
  | { kind: "APPROVAL_STATUS"; agent: ToolResult };

const textResult = (payload: unknown, isError = false): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(payload) }],
  isError,
});

/** PayPal's MCP server sometimes reports failure as {"ok":false,...} text without setting isError. */
function looksFailed(result: ToolResult): boolean {
  if (result.isError === true) return true;
  const text = result.content.find((c) => typeof c.text === "string")?.text;
  if (!text) return false;
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && (parsed as { ok?: unknown }).ok === false;
  } catch {
    return false;
  }
}

export class Gateway {
  private readonly deps: GatewayDeps;
  private readonly lock = new Mutex();

  constructor(deps: GatewayDeps) {
    this.deps = deps;
  }

  // ---------------------------------------------------------------- agent side
  async handleToolCall(toolName: string, rawArgs: unknown): Promise<GatewayResult> {
    const d = this.deps;
    this.sweepExpired();

    if (toolName === CHECK_APPROVAL_TOOL) return this.checkApproval(rawArgs);

    const args: unknown = rawArgs === undefined ? {} : rawArgs;
    const tier = classifyTool(toolName);

    // 1) Trusted facts, fetched OUTSIDE the lock (network can be slow). Failure => no facts => engine denies.
    let facts: Facts = {};
    if (tier === "MONEY") {
      try {
        facts = await d.facts(toolName, args);
      } catch {
        facts = {};
      }
    }

    // 2) Optional LLM second opinion. If the reviewer itself fails, fail SAFE (escalate).
    let advisory: Advisory | undefined;
    if (d.advisor && (tier === "MONEY" || tier === "CUSTOMER_FACING")) {
      try {
        advisory = await d.advisor({ toolName, args });
      } catch {
        advisory = { suspicious: true, reason: "Risk reviewer unavailable; failing safe." };
      }
    }

    // 3) Evaluate AND reserve as one atomic step.
    const step = await this.lock.run(async () => {
      const now = d.now();
      const decision = evaluate({ toolName, args, now, policy: d.policy(), facts, history: d.ledger.snapshot(), advisory });
      const tracked = decision.tier === "MONEY" || decision.tier === "CUSTOMER_FACING";
      let ledgerId: string | undefined;
      let approval: ApprovalRequest | undefined;

      if (decision.verdict === "ALLOW" && tracked) {
        // Reserved immediately, so concurrent calls see it. Corrected to FAILED if PayPal rejects it.
        ledgerId = d.ledger.add({
          at: now,
          toolName,
          targetId: decision.targetId,
          amountCents: decision.amountCents ?? cents(0),
          status: "EXECUTED",
        });
      } else if (decision.verdict === "REQUIRE_APPROVAL" && isPlainObject(args)) {
        if (tracked) {
          ledgerId = d.ledger.add({
            at: now,
            toolName,
            targetId: decision.targetId,
            amountCents: decision.amountCents ?? cents(0),
            status: "PENDING_APPROVAL",
          });
        }
        approval = {
          id: randomUUID(),
          createdAt: now,
          expiresAt: new Date(now.getTime() + d.approvalTtlMs),
          toolName,
          args: structuredClone(args),
          decision,
          ledgerId,
          status: "PENDING",
        };
        d.approvals.add(approval);
      }

      d.audit.append("DECISION", { toolName, args, verdict: decision.verdict, decision, ledgerId, approvalId: approval?.id });
      return { decision, ledgerId, approval };
    });

    const { decision, ledgerId, approval } = step;

    // 4) Act on the verdict.
    if (decision.verdict === "DENY") {
      // A malformed request is the one case worth explaining: the message only describes the expected FORMAT
      // (e.g. "no spaces in note"), never a limit, so an honest agent can fix its mistake and try again.
      const hints = decision.reasons.filter((r) => r.code === "INVALID_ARGS").map((r) => r.message);
      return {
        kind: "BLOCKED",
        decision,
        agent: textResult(
          {
            status: "BLOCKED_BY_ALLOWANCE",
            codes: decision.reasons.map((r) => r.code),
            message: hints.length
              ? "This request was malformed. Fix the format described in hints and try again."
              : "This action was blocked by the spending policy. Do not retry or work around it. Ask a human.",
            ...(hints.length ? { hints } : {}),
          },
          true,
        ),
      };
    }

    if (decision.verdict === "REQUIRE_APPROVAL" && approval) {
      return {
        kind: "PENDING_APPROVAL",
        decision,
        approvalId: approval.id,
        expiresAt: approval.expiresAt,
        agent: textResult({
          status: "PENDING_APPROVAL",
          approval_id: approval.id,
          expires_at: approval.expiresAt.toISOString(),
          message: `A human must approve this. Call ${CHECK_APPROVAL_TOOL} with this approval_id to see the outcome. Do not repeat the request.`,
        }),
      };
    }

    const out = await this.forward(toolName, args as Record<string, unknown>, ledgerId, decision.tier !== "READ");
    if (out.ok && out.result) return { kind: "FORWARDED", decision, agent: out.result };
    return { kind: "UPSTREAM_ERROR", decision, agent: out.result ?? textResult({ status: "UPSTREAM_ERROR", message: out.error }, true) };
  }

  // ---------------------------------------------------------------- human side
  /** Called ONLY by the human dashboard. Never exposed to the agent. */
  async resolveApproval(id: string, approve: boolean, by: string): Promise<ApprovalRequest> {
    const d = this.deps;
    this.sweepExpired();
    const req = d.approvals.get(id);
    if (!req) throw new GatewayError("NOT_FOUND", "No such approval.");
    if (req.status !== "PENDING") throw new GatewayError("NOT_PENDING", `Approval is already ${req.status}.`);

    req.resolvedBy = by;
    req.resolvedAt = d.now();

    if (!approve) {
      req.status = "DENIED";
      if (req.ledgerId) d.ledger.setStatus(req.ledgerId, "DENIED");
      d.audit.append("APPROVAL_RESOLVED", { approvalId: id, outcome: "DENIED", by });
      return req;
    }

    // The kill switch overrides approvals that were granted earlier.
    if (d.policy().killSwitch) {
      req.status = "DENIED";
      if (req.ledgerId) d.ledger.setStatus(req.ledgerId, "DENIED");
      d.audit.append("APPROVAL_RESOLVED", { approvalId: id, outcome: "DENIED", by, note: "kill switch is on" });
      return req;
    }

    // Flip the status BEFORE any await: a second click on Approve now sees APPROVED and is refused,
    // so the action can never run twice.
    req.status = "APPROVED";
    d.audit.append("APPROVAL_RESOLVED", { approvalId: id, outcome: "APPROVED", by });

    const out = await this.forward(req.toolName, req.args, req.ledgerId, true);
    req.status = out.ok ? "EXECUTED" : "FAILED";
    if (out.result) req.result = out.result;
    return req;
  }

  /** Marks timed-out approvals EXPIRED and releases the budget they were holding. */
  sweepExpired(): void {
    const d = this.deps;
    const now = d.now().getTime();
    for (const req of d.approvals.pending()) {
      if (req.expiresAt.getTime() <= now) {
        req.status = "EXPIRED";
        if (req.ledgerId) d.ledger.setStatus(req.ledgerId, "EXPIRED");
        d.audit.append("APPROVAL_EXPIRED", { approvalId: req.id });
      }
    }
  }

  // ------------------------------------------------------------------ internals
  private checkApproval(rawArgs: unknown): GatewayResult {
    const id = isPlainObject(rawArgs) && typeof rawArgs["approval_id"] === "string" ? rawArgs["approval_id"] : undefined;
    const req = id ? this.deps.approvals.get(id) : undefined;
    if (!req) return { kind: "APPROVAL_STATUS", agent: textResult({ status: "NOT_FOUND" }, true) };
    const payload: Record<string, unknown> = { status: req.status };
    if (req.status === "PENDING") payload["message"] = "Still waiting for a human. Do not retry the action.";
    if (req.status === "EXECUTED" && req.result) payload["result"] = req.result;
    return { kind: "APPROVAL_STATUS", agent: textResult(payload, req.status === "DENIED" || req.status === "EXPIRED" || req.status === "FAILED") };
  }

  private async forward(
    toolName: string,
    args: Record<string, unknown>,
    ledgerId: string | undefined,
    auditExecution: boolean,
  ): Promise<{ ok: boolean; result?: ToolResult; error?: string }> {
    const d = this.deps;
    try {
      const result = await d.upstream.callTool(toolName, args);
      const failed = looksFailed(result);
      if (ledgerId) d.ledger.setStatus(ledgerId, failed ? "FAILED" : "EXECUTED");
      if (auditExecution) d.audit.append(failed ? "EXECUTION_FAILED" : "EXECUTED", { toolName, ledgerId, result });
      return { ok: !failed, result };
    } catch (err) {
      const error = err instanceof Error ? err.message : "unknown error";
      if (ledgerId) d.ledger.setStatus(ledgerId, "FAILED");
      d.audit.append("EXECUTION_FAILED", { toolName, ledgerId, error });
      return { ok: false, error };
    }
  }
}
