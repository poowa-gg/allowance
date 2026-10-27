/**
 * SPIKE 02: connect to PayPal's official MCP server and list its tools.
 *
 * WHY THIS MATTERS
 * Allowance will sit BETWEEN the AI agent and PayPal's MCP server. Before
 * designing the proxy, we need ground truth: which tools exist, and what
 * are their exact names and input schemas? The docs I found list the tool
 * surface inconsistently, so we trust the live server, not memory.
 *
 * OUTPUT: prints a summary and saves docs/paypal-mcp-tools.json for Day 5.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getAccessToken } from "../paypal/auth.js";

async function main() {
  // The MCP server wants a ready-made access token (not id/secret), so we mint one.
  const accessToken = await getAccessToken();

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@paypal/mcp", "--tools=all"],
    env: {
      ...getDefaultEnvironment(), // PATH etc., so npx can find node
      PAYPAL_ACCESS_TOKEN: accessToken,
      PAYPAL_ENVIRONMENT: "SANDBOX",
    },
  });

  const client = new Client({ name: "allowance-spike", version: "0.0.1" });

  try {
    await client.connect(transport, { timeout: 180_000 });
    const { tools } = await client.listTools(undefined, { timeout: 60_000 });

    console.log(`PayPal MCP exposes ${tools.length} tools:\n`);
    for (const t of tools) {
      console.log(`- ${t.name}: ${(t.description ?? "").slice(0, 100)}`);
    }

    await mkdir("docs", { recursive: true });
    await writeFile("docs/paypal-mcp-tools.json", JSON.stringify(tools, null, 2));
    console.log("\nSaved full schemas to docs/paypal-mcp-tools.json");
  } finally {
    await client.close(); // always kill the child process, even on error
  }
}

main().catch((err) => {
  console.error("Spike failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
