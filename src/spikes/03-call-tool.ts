/**
 * SPIKE 03: call ANY PayPal MCP tool by name from the command line.
 *
 * WHY THIS MATTERS
 * Allowance's whole job is to sit in front of the tools that MOVE MONEY
 * (refunds, payouts, orders...). Day 1 must answer: "Which of PayPal's real
 * tools move money, and can we call them from code?" This script lets you
 * test each one in the sandbox without writing new code every time.
 *
 * USAGE (always pass the args as ONE quoted JSON string):
 *   npm run spike:call -- create_refund docs/samples/args/refund_partial.json   (file, PowerShell-safe)
 *   npm run spike:call -- list_invoices '{"page":1,"page_size":5}'
 *   npm run spike:call -- <tool_name> '<json args matching docs/paypal-mcp-tools.json>'
 *
 * SAFETY: this only ever talks to the sandbox (see config.ts).
 */
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getAccessToken } from "../paypal/auth.js";

async function main() {
  const [toolName, rawArgs = "{}"] = process.argv.slice(2);
  if (!toolName) {
    console.error("Usage: npm run spike:call -- <tool_name> '<json args>'");
    process.exit(1);
  }

  let args: Record<string, unknown>;
  try {
    // If the 2nd argument ends in .json, read the arguments from that file (avoids PowerShell quoting bugs).
    const text = rawArgs.endsWith(".json") ? await readFile(rawArgs, "utf8") : rawArgs;
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
    args = parsed as Record<string, unknown>;
  } catch {
    console.error("Args must be a JSON object, e.g. '{\"page\":1}'");
    process.exit(1);
  }

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@paypal/mcp", "--tools=all"],
    env: {
      ...getDefaultEnvironment(),
      PAYPAL_ACCESS_TOKEN: await getAccessToken(),
      PAYPAL_ENVIRONMENT: "SANDBOX",
    },
  });
  const client = new Client({ name: "allowance-spike", version: "0.0.1" });

  try {
    await client.connect(transport, { timeout: 180_000 });
    console.log(`Calling ${toolName}... this can take up to 2 minutes on a slow network. Do not press Ctrl+C.`);
    const result = await client.callTool({ name: toolName, arguments: args }, undefined, { timeout: 120_000 });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Spike failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
