import type { Advisory, Facts } from "../policy/types.js";

/** The shape of an MCP tool result, reduced to what we actually need. */
export interface ToolResult {
  content: { type: string; text?: string }[];
  isError?: boolean;
}

export interface ToolDef {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/** The real PayPal MCP server lives behind this interface, so tests can swap in a fake. */
export interface Upstream {
  listTools(): Promise<ToolDef[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  close(): Promise<void>;
}

/** Looks up trusted facts (e.g. the real capture amount) from PayPal. Never from the agent. */
export type FactsResolver = (toolName: string, args: unknown) => Promise<Facts>;

/** Optional LLM risk reviewer (Day 9). It can only escalate. */
export type Advisor = (call: { toolName: string; args: unknown }) => Promise<Advisory | undefined>;

export const CHECK_APPROVAL_TOOL = "allowance_check_approval";

export const CHECK_APPROVAL_DEF: ToolDef = {
  name: CHECK_APPROVAL_TOOL,
  description:
    "Check the status of an action that is waiting for human approval. Returns the outcome once a human decides. Do not repeat the original request.",
  inputSchema: {
    type: "object",
    properties: { approval_id: { type: "string", description: "The approval_id returned when the action was held." } },
    required: ["approval_id"],
    additionalProperties: false,
  },
};
