import { postJson } from "./retry.js";
import type { RetryOptions } from "./retry.js";
import type { Block, CompleteArgs, Completion, FetchLike, LlmClient, Message } from "./types.js";

/** Pure conversion functions are exported so they can be unit-tested without any network. */
export function toAnthropicMessages(messages: Message[]): unknown[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map((b) =>
      b.type === "text"
        ? { type: "text", text: b.text }
        : b.type === "tool_use"
          ? { type: "tool_use", id: b.id, name: b.name, input: b.input }
          : { type: "tool_result", tool_use_id: b.toolUseId, content: b.content, is_error: b.isError },
    ),
  }));
}

export function parseAnthropicResponse(data: unknown): Completion {
  const d = data as { content?: unknown; stop_reason?: unknown } | null;
  if (!d || !Array.isArray(d.content)) throw new Error("Unexpected response from Anthropic API");
  const content: Block[] = [];
  for (const raw of d.content as { type?: unknown; text?: unknown; id?: unknown; name?: unknown; input?: unknown }[]) {
    if (raw.type === "text" && typeof raw.text === "string") content.push({ type: "text", text: raw.text });
    else if (raw.type === "tool_use" && typeof raw.id === "string" && typeof raw.name === "string") {
      content.push({ type: "tool_use", id: raw.id, name: raw.name, input: raw.input });
    }
  }
  return { content, stop: d.stop_reason === "tool_use" ? "tool_use" : "end" };
}

export class AnthropicClient implements LlmClient {
  readonly label: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: FetchLike;
  private readonly retry: RetryOptions;

  constructor(opts: { apiKey: string; model: string; fetchImpl?: FetchLike; retry?: RetryOptions }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.label = `Claude (${opts.model})`;
    this.fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike);
    this.retry = opts.retry ?? {};
  }

  async complete(args: CompleteArgs): Promise<Completion> {
    const data = await postJson(
      this.fetchImpl,
      "https://api.anthropic.com/v1/messages",
      { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      JSON.stringify({
        model: this.model,
        max_tokens: args.maxTokens,
        system: args.system,
        messages: toAnthropicMessages(args.messages),
        tools: args.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
      }),
      "Anthropic API",
      this.retry,
    );
    return parseAnthropicResponse(data);
  }
}
