import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ToolDef, ToolResult, Upstream } from "../gateway/types.js";
import { getAccessToken } from "../paypal/auth.js";

/**
 * The real connection to PayPal's official MCP server (sandbox).
 * NOTE: the access token is minted once at start-up and lasts several hours;
 * restart the gateway if you leave it running for a day.
 */
export class PayPalMcpUpstream implements Upstream {
  private client: Client | undefined;

  async connect(): Promise<void> {
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["-y", "@paypal/mcp", "--tools=all"],
      env: {
        ...getDefaultEnvironment(),
        PAYPAL_ACCESS_TOKEN: await getAccessToken(),
        PAYPAL_ENVIRONMENT: "SANDBOX",
      },
    });
    const client = new Client({ name: "allowance-gateway", version: "0.1.0" });
    await client.connect(transport, { timeout: 180_000 });
    this.client = client;
  }

  private need(): Client {
    if (!this.client) throw new Error("Upstream is not connected");
    return this.client;
  }

  async listTools(): Promise<ToolDef[]> {
    const { tools } = await this.need().listTools(undefined, { timeout: 60_000 });
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const raw = (await this.need().callTool({ name, arguments: args }, undefined, { timeout: 120_000 })) as unknown as {
      content?: unknown;
      isError?: unknown;
    };
    const blocks = Array.isArray(raw.content) ? (raw.content as { type?: unknown; text?: unknown }[]) : [];
    return {
      content: blocks.map((b) => ({ type: String(b.type), text: typeof b.text === "string" ? b.text : undefined })),
      isError: raw.isError === true,
    };
  }

  async close(): Promise<void> {
    await this.client?.close();
  }
}
