/**
 * SMOKE TEST: watch the whole pipeline work, end to end.
 *
 *   npm run smoke            OFFLINE: fake PayPal, nothing real happens (safe, instant)
 *   npm run smoke:live       LIVE: real PayPal SANDBOX. Scenario 3 really refunds the capture below.
 *                            npm run smoke:live -- --capture=4MW70833S1587681G
 *
 * It plays an AI agent making five calls, including attacks, and prints what Allowance did.
 */
import { ApprovalStore } from "../gateway/approvals.js";
import { AuditLog } from "../gateway/audit.js";
import { paypalFactsResolver } from "../gateway/facts.js";
import { Gateway } from "../gateway/gateway.js";
import type { GatewayResult } from "../gateway/gateway.js";
import { Ledger } from "../gateway/ledger.js";
import type { FactsResolver, ToolResult, Upstream } from "../gateway/types.js";
import { PayPalMcpUpstream } from "../mcp/upstream.js";
import { cents } from "../money.js";
import { parseRefundArgs } from "../policy/args.js";
import { DEFAULT_POLICY } from "../policy/policy.js";
import type { Policy } from "../policy/types.js";

const live = process.argv.includes("--live");
const capture = process.argv.find((a) => a.startsWith("--capture="))?.slice("--capture=".length) ?? "4MW70833S1587681G";

class OfflineUpstream implements Upstream {
  async listTools() {
    return [];
  }
  async callTool(name: string): Promise<ToolResult> {
    return { content: [{ type: "text", text: JSON.stringify({ id: "FAKE_RESULT", tool: name, status: "COMPLETED" }) }] };
  }
  async close() {}
}

const offlineFacts: FactsResolver = async (tool, args) =>
  tool === "create_refund" && parseRefundArgs(args).ok ? { captureAmountCents: cents(1250), captureCurrency: "USD" } : {};

// A stricter policy for the demo: only refunds up to $5 are automatic.
const policy: Policy = { ...DEFAULT_POLICY, money: { ...DEFAULT_POLICY.money, autoApproveUpToCents: cents(500) } };

function describeResult(r: GatewayResult): void {
  console.log(`   -> ${r.kind}`);
  if ("decision" in r) for (const reason of r.decision.reasons) console.log(`      [${reason.code}] ${reason.message}`);
  const text = r.agent.content.map((c) => c.text ?? "").join("");
  console.log(`      agent sees: ${text.length > 220 ? text.slice(0, 220) + "..." : text}`);
}

async function main() {
  console.log(`\nAllowance smoke test (${live ? "LIVE PayPal SANDBOX" : "OFFLINE fake PayPal"})\n`);

  let upstream: Upstream = new OfflineUpstream();
  let facts: FactsResolver = offlineFacts;
  if (live) {
    const real = new PayPalMcpUpstream();
    await real.connect();
    upstream = real;
    facts = paypalFactsResolver;
  }

  const audit = new AuditLog(() => new Date());
  const gateway = new Gateway({
    upstream,
    facts,
    policy: () => policy,
    ledger: new Ledger(),
    audit,
    approvals: new ApprovalStore(),
    now: () => new Date(),
    approvalTtlMs: 15 * 60_000,
  });

  try {
    console.log("1) Agent reads disputes (harmless)");
    describeResult(await gateway.handleToolCall("list_disputes", { page_size: 5 }));

    console.log("\n2) ROGUE AGENT: refunds $50.00 on a $12.50 payment");
    describeResult(await gateway.handleToolCall("create_refund", { capture_id: capture, amount: { currency_code: "USD", value: "50.00" } }));

    console.log("\n3) SNEAKY AGENT: refund with NO amount (PayPal would refund everything)");
    const sneaky = await gateway.handleToolCall("create_refund", { capture_id: capture });
    describeResult(sneaky);
    if (sneaky.kind === "PENDING_APPROVAL") {
      console.log("\n   ...a human reviews the card and clicks APPROVE...");
      const done = await gateway.resolveApproval(sneaky.approvalId, true, "demo-owner");
      console.log(`   -> approval status: ${done.status}`);
      const text = done.result?.content.map((c) => c.text ?? "").join("") ?? "(no result)";
      console.log(`      PayPal said: ${text.length > 220 ? text.slice(0, 220) + "..." : text}`);
    }

    console.log("\n4) PROMPT-INJECTED AGENT: invents a tool called wire_transfer");
    describeResult(await gateway.handleToolCall("wire_transfer", { amount: 1_000_000 }));

    console.log("\n5) Audit log");
    console.log(`   ${audit.records().length} records, chain valid: ${audit.verify().ok}`);
  } finally {
    await upstream.close();
  }
}

main().catch((err) => {
  console.error("Smoke test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
