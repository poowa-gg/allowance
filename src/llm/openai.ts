import { postJson } from "./retry.js";
import type { RetryOptions } from "./retry.js";
import type { Block, CompleteArgs, Completion, FetchLike, LlmClient, Message } from "./types.js";

/**
 * Works with ANY service that speaks the common "chat completions" format with tool calling
 * (many providers do, including several with free tiers). You only set a base URL, key and model.
 */
export function toOpenAiMessages(system: string, messages: Message[]): unknown[] {
  const out: unknown[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      const text = m.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n");
      if (text) out.push({ role: "user", content: text });
      for (const b of m.content) {
        if (b.type === "tool_result") out.push({ role: "tool", tool_call_id: b.toolUseId, content: b.content });
      }
    } else {
      const text = m.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n");
      const calls = m.content
        .filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use")
        .map((b) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      const msg: Record<string, unknown> = { role: "assistant", content: text || null };
      if (calls.length) msg["tool_calls"] = calls;
      out.push(msg);
    }
  }
  return out;
}

export function parseOpenAiResponse(data: unknown): Completion {
  const choice = (data as { choices?: { message?: { content?: unknown; tool_calls?: unknown }; finish_reason?: unknown }[] } | null)?.choices?.[0];
  const message = choice?.message;
  if (!message) throw new Error("Unexpected response from the language model API");
  const content: Block[] = [];
  if (typeof message.content === "string" && message.content.length > 0) content.push({ type: "text", text: message.content });
  const calls = Array.isArray(message.tool_calls) ? (message.tool_calls as { id?: unknown; function?: { name?: unknown; arguments?: unknown } }[]) : [];
  for (const c of calls) {
    if (typeof c.id !== "string" || typeof c.function?.name !== "string") continue;
    let input: unknown = {};
    try {
      input = JSON.parse(typeof c.function.arguments === "string" && c.function.arguments ? c.function.arguments : "{}");
    } catch {
      input = { _unparseable_arguments: true }; // the policy engine rejects unknown fields, so this is blocked
    }
    content.push({ type: "tool_use", id: c.id, name: c.function.name, input });
  }
  return { content, stop: content.some((b) => b.type === "tool_use") ? "tool_use" : "end" };
}

const NOT_CHAT = /whisper|tts|orpheus|guard|safeguard|embed|compound|moderation/i;

export class OpenAiCompatibleClient implements LlmClient {
  private model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly retry: RetryOptions;
  private readonly modelPreference: string[];
  private readonly reasoningEffort: string | null;
  private discoveryTried = false;

  constructor(opts: {
    baseUrl: string;
    apiKey: string;
    model: string;
    fetchImpl?: FetchLike;
    retry?: RetryOptions;
    /** If the chosen model does not exist for this key, ask the service which models exist and pick the first of these. */
    modelPreference?: string[];
    /** Sent only to gpt-oss style reasoning models, to keep them quick and leave room for the answer. null = never send. */
    reasoningEffort?: string | null;
  }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike);
    this.retry = opts.retry ?? {};
    this.modelPreference = opts.modelPreference ?? [];
    this.reasoningEffort = opts.reasoningEffort === undefined ? "low" : opts.reasoningEffort;
  }

  get label(): string {
    return `${this.model} via ${new URL(this.baseUrl).host}`;
  }

  private async send(args: CompleteArgs): Promise<Completion> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: args.maxTokens,
      messages: toOpenAiMessages(args.system, args.messages),
    };
    if (args.tools.length > 0) {
      body["tools"] = args.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
    }
    if (this.reasoningEffort && /gpt-oss/i.test(this.model)) body["reasoning_effort"] = this.reasoningEffort;
    const data = await postJson(
      this.fetchImpl,
      `${this.baseUrl}/chat/completions`,
      { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      JSON.stringify(body),
      "Language model API",
      this.retry,
    );
    return parseOpenAiResponse(data);
  }

  /** Asks the service which models this key can use and picks the best match from our preference list. */
  private async discoverModel(): Promise<string | undefined> {
    const res = await this.fetchImpl(`${this.baseUrl}/models`, { method: "GET", headers: { authorization: `Bearer ${this.apiKey}` }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { data?: { id?: unknown }[] };
    const ids = (data.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string" && !NOT_CHAT.test(id));
    for (const wanted of this.modelPreference) if (ids.includes(wanted)) return wanted;
    return undefined;
  }

  async complete(args: CompleteArgs): Promise<Completion> {
    try {
      return await this.send(args);
    } catch (err) {
      // "model_not_found" means this key cannot use that model (catalogs change often). Find one it can, once.
      if (this.discoveryTried || this.modelPreference.length === 0 || !(err instanceof Error) || !err.message.includes("model_not_found")) throw err;
      this.discoveryTried = true;
      const better = await this.discoverModel();
      if (!better || better === this.model) throw err;
      this.model = better;
      return this.send(args);
    }
  }
}
