/**
 * ALLOWANCE AS A REAL MCP SERVER.
 * Any MCP-capable agent (Claude Code, Kiro, your own) connects HERE instead of to PayPal.
 * Tools look identical to PayPal's, but every call passes through the Gateway first.
 *
 * Run:  npm run proxy        (stdio; logs go to stderr because stdout is the protocol channel)
 * NOTE: the human approval screen arrives on Day 7; until then use the smoke script to see approvals.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ApprovalStore } from "../gateway/approvals.js";
import { createFileAuditLog } from "../gateway/audit.js";
import { paypalFactsResolver } from "../gateway/facts.js";
import { Gateway } from "../gateway/gateway.js";
import { Ledger } from "../gateway/ledger.js";
import { CHECK_APPROVAL_DEF } from "../gateway/types.js";
import { DEFAULT_POLICY } from "../policy/policy.js";
import { PayPalMcpUpstream } from "./upstream.js";

async function main() {
  const upstream = new PayPalMcpUpstream();
  await upstream.connect();
  const upstreamTools = await upstream.listTools();

  const gateway = new Gateway({
    upstream,
    facts: paypalFactsResolver,
    policy: () => DEFAULT_POLICY,
    ledger: new Ledger(),
    audit: createFileAuditLog("data/audit.jsonl", () => new Date()),
    approvals: new ApprovalStore(),
    now: () => new Date(),
    approvalTtlMs: 15 * 60_000,
  });

  const server = new Server({ name: "allowance", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...upstreamTools, CHECK_APPROVAL_DEF].map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as { type: "object"; [k: string]: unknown },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const result = await gateway.handleToolCall(req.params.name, req.params.arguments);
    return {
      content: result.agent.content.map((c) => ({ type: "text" as const, text: c.text ?? "" })),
      isError: result.agent.isError ?? false,
    };
  });

  await server.connect(new StdioServerTransport());
  console.error("Allowance gateway running (sandbox). Agents connect to THIS server, not to PayPal.");
}

main().catch((err) => {
  console.error("Gateway failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
