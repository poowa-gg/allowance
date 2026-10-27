/**
 * A PROVIDER-NEUTRAL way to talk to any LLM that supports tool calling.
 * The agent only ever sees this interface, so Claude, an OpenAI-compatible service,
 * or the built-in "obedient agent simulator" can be swapped without touching the agent.
 */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError: boolean };

export interface Message {
  role: "user" | "assistant";
  content: Block[];
}

export interface CompleteArgs {
  system: string;
  messages: Message[];
  tools: ToolSpec[];
  maxTokens: number;
}

export interface Completion {
  content: Block[];
  stop: "end" | "tool_use";
}

export interface LlmClient {
  readonly label: string;
  complete(args: CompleteArgs): Promise<Completion>;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;
