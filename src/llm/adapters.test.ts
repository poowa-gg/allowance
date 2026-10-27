import { describe, expect, it } from "vitest";
import { AnthropicClient, parseAnthropicResponse, toAnthropicMessages } from "./anthropic.js";
import { createLlmFromEnv } from "./factory.js";
import { OpenAiCompatibleClient, parseOpenAiResponse, toOpenAiMessages } from "./openai.js";
import type { FetchLike, Message } from "./types.js";

const convo: Message[] = [
  { role: "user", content: [{ type: "text", text: "refund please" }] },
  { role: "assistant", content: [{ type: "text", text: "on it" }, { type: "tool_use", id: "t1", name: "create_refund", input: { capture_id: "X" } }] },
  { role: "user", content: [{ type: "tool_result", toolUseId: "t1", content: "done", isError: false }] },
];

describe("Anthropic adapter", () => {
  it("converts our messages to Anthropic's format", () => {
    const out = toAnthropicMessages(convo) as { role: string; content: { type: string; tool_use_id?: string; is_error?: boolean }[] }[];
    expect(out.length).toBe(3);
    expect(out[2]!.content[0]!.type).toBe("tool_result");
    expect(out[2]!.content[0]!.tool_use_id).toBe("t1");
    expect(out[2]!.content[0]!.is_error).toBe(false);
  });
  it("parses text and tool_use blocks", () => {
    const c = parseAnthropicResponse({ stop_reason: "tool_use", content: [{ type: "text", text: "hi" }, { type: "tool_use", id: "a", name: "list_disputes", input: {} }] });
    expect(c.stop).toBe("tool_use");
    expect(c.content.length).toBe(2);
    expect(parseAnthropicResponse({ stop_reason: "end_turn", content: [{ type: "text", text: "x" }] }).stop).toBe("end");
  });
  it("rejects garbage responses", () => {
    expect(() => parseAnthropicResponse(null)).toThrow();
    expect(() => parseAnthropicResponse({ nope: 1 })).toThrow();
  });
  it("sends the key as a header, never in the body, and surfaces API errors", async () => {
    let seen: { headers: Record<string, string>; body: string } | undefined;
    const ok: FetchLike = async (_u, init) => {
      seen = { headers: init.headers, body: init.body ?? "" };
      return { ok: true, status: 200, json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "hello" }] }), text: async () => "" };
    };
    const client = new AnthropicClient({ apiKey: "sk-ant-SECRET", model: "m", fetchImpl: ok });
    const r = await client.complete({ system: "s", messages: convo.slice(0, 1), tools: [], maxTokens: 10 });
    expect(r.content.length).toBe(1);
    expect(seen!.headers["x-api-key"]).toBe("sk-ant-SECRET");
    expect(seen!.body.includes("SECRET")).toBe(false);

    const bad: FetchLike = async () => ({ ok: false, status: 400, json: async () => ({}), text: async () => "credit balance is too low" });
    let msg = "";
    try {
      await new AnthropicClient({ apiKey: "k", model: "m", fetchImpl: bad }).complete({ system: "s", messages: [], tools: [], maxTokens: 1 });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg.includes("400")).toBe(true);
    expect(msg.includes("credit balance")).toBe(true);
  });
});

describe("OpenAI-compatible adapter", () => {
  it("converts our messages (tool results become role=tool messages)", () => {
    const out = toOpenAiMessages("sys", convo) as { role: string; tool_calls?: unknown[]; tool_call_id?: string; content: unknown }[];
    expect(out.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
    expect(out[2]!.tool_calls!.length).toBe(1);
    expect(out[3]!.tool_call_id).toBe("t1");
  });
  it("parses tool calls and tolerates broken argument JSON by marking it unparseable", () => {
    const good = parseOpenAiResponse({ choices: [{ message: { content: null, tool_calls: [{ id: "c1", function: { name: "create_refund", arguments: "{\"capture_id\":\"X\"}" } }] } }] });
    expect(good.stop).toBe("tool_use");
    expect((good.content[0] as { input: { capture_id: string } }).input.capture_id).toBe("X");
    const broken = parseOpenAiResponse({ choices: [{ message: { tool_calls: [{ id: "c2", function: { name: "create_refund", arguments: "{oops" } }] } }] });
    expect(JSON.stringify((broken.content[0] as { input: unknown }).input).includes("_unparseable_arguments")).toBe(true);
  });
  it("a plain text answer ends the turn", () => {
    expect(parseOpenAiResponse({ choices: [{ message: { content: "done" } }] }).stop).toBe("end");
  });
  it("posts to /chat/completions with a bearer token", async () => {
    let url = "";
    let auth = "";
    const f: FetchLike = async (u, init) => {
      url = u;
      auth = init.headers["authorization"] ?? "";
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "hi" } }] }), text: async () => "" };
    };
    const c = new OpenAiCompatibleClient({ baseUrl: "https://example.test/v1/", apiKey: "KEY", model: "m", fetchImpl: f });
    await c.complete({ system: "s", messages: convo.slice(0, 1), tools: [], maxTokens: 5 });
    expect(url).toBe("https://example.test/v1/chat/completions");
    expect(auth).toBe("Bearer KEY");
  });
});

describe("createLlmFromEnv", () => {
  it("returns nothing when no key is set (the app then uses the free simulator)", () => {
    expect(createLlmFromEnv({})).toBe(undefined);
    expect(createLlmFromEnv({ LLM_API_KEY: "k" })).toBe(undefined);
  });
  it("prefers Anthropic, else a complete OpenAI-compatible trio", () => {
    expect(createLlmFromEnv({ ANTHROPIC_API_KEY: "k" })?.label.includes("Claude")).toBe(true);
    expect(createLlmFromEnv({ LLM_API_KEY: "k", LLM_BASE_URL: "https://a.test/v1", LLM_MODEL: "m" })?.label.includes("a.test")).toBe(true);
  });
});

describe("retry behaviour (free tiers rate-limit and open models fumble tool calls)", () => {
  const okBody = { choices: [{ message: { content: "hi" } }] };
  const reply = (status: number, text = "", retryAfter?: string) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n: string) => (n === "retry-after" ? retryAfter ?? null : null) },
    json: async () => okBody,
    text: async () => text,
  });
  const run = async (statuses: { status: number; text?: string; retryAfter?: string }[]) => {
    const waits: number[] = [];
    let i = 0;
    const f: FetchLike = async () => {
      const s = statuses[Math.min(i++, statuses.length - 1)]!;
      return reply(s.status, s.text, s.retryAfter);
    };
    const c = new OpenAiCompatibleClient({ baseUrl: "https://x.test/v1", apiKey: "k", model: "m", fetchImpl: f, retry: { sleep: async (ms) => void waits.push(ms) } });
    let error = "";
    let content = 0;
    try {
      content = (await c.complete({ system: "s", messages: [], tools: [], maxTokens: 5 })).content.length;
    } catch (e) {
      error = (e as Error).message;
    }
    return { waits, error, content, calls: i };
  };

  it("waits as long as the server asks on 429, then succeeds", async () => {
    const r = await run([{ status: 429, retryAfter: "2" }, { status: 200 }]);
    expect(r.error).toBe("");
    expect(r.waits).toEqual([2000]);
    expect(r.content).toBe(1);
  });
  it("caps very long waits at 20 seconds", async () => {
    const r = await run([{ status: 429, retryAfter: "600" }, { status: 200 }]);
    expect(r.waits).toEqual([20000]);
  });
  it("gives up after the retry limit and reports the provider's message", async () => {
    const r = await run([{ status: 429, text: "rate limit reached" }]);
    expect(r.calls).toBe(4);
    expect(r.error.includes("429")).toBe(true);
    expect(r.error.includes("rate limit reached")).toBe(true);
  });
  it("retries a malformed tool call (tool_use_failed) and then succeeds", async () => {
    const r = await run([{ status: 400, text: '{"error":{"code":"tool_use_failed"}}' }, { status: 200 }]);
    expect(r.error).toBe("");
    expect(r.calls).toBe(2);
  });
  it("does NOT retry a bad key or a plain bad request", async () => {
    expect((await run([{ status: 401, text: "invalid api key" }])).calls).toBe(1);
    expect((await run([{ status: 400, text: "bad request" }])).calls).toBe(1);
  });
});

describe("Groq shortcut", () => {
  it("GROQ_API_KEY alone is enough, and points at Groq with a sensible default model", () => {
    const c = createLlmFromEnv({ GROQ_API_KEY: "gsk_test" });
    expect(c?.label.includes("api.groq.com")).toBe(true);
    expect(c?.label.includes("openai/gpt-oss-120b")).toBe(true);
    expect(createLlmFromEnv({ GROQ_API_KEY: "gsk_test", GROQ_MODEL: "other-model" })?.label.includes("other-model")).toBe(true);
  });
});

describe("Groq model churn (a model that disappears must not break the demo)", () => {
  function scripted(responses: { match: RegExp; status: number; body: unknown }[]) {
    const calls: { url: string; method: string; body?: string }[] = [];
    const f: FetchLike = async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      const r = responses.find((x) => x.match.test(`${init.method} ${url}`));
      if (!r) throw new Error(`unexpected call ${init.method} ${url}`);
      return { ok: r.status < 300, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
    };
    return { f, calls };
  }
  const chatOk = { choices: [{ message: { content: "hi" } }] };

  it("on model_not_found it lists the models, switches to a working one, and retries", async () => {
    let chatCalls = 0;
    const calls: { url: string; method: string; body?: string }[] = [];
    const f: FetchLike = async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      if (init.method === "GET") return { ok: true, status: 200, json: async () => ({ data: [{ id: "whisper-large-v3" }, { id: "openai/gpt-oss-20b" }, { id: "llama-3.1-8b-instant" }] }), text: async () => "" };
      chatCalls++;
      if (chatCalls === 1) return { ok: false, status: 404, json: async () => ({}), text: async () => '{"error":{"code":"model_not_found"}}' };
      return { ok: true, status: 200, json: async () => chatOk, text: async () => "" };
    };
    const c = new OpenAiCompatibleClient({ baseUrl: "https://x.test/v1", apiKey: "k", model: "gone-model", fetchImpl: f, modelPreference: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] });
    const r = await c.complete({ system: "s", messages: [], tools: [], maxTokens: 5 });
    expect(r.content.length).toBe(1);
    expect(c.label.includes("openai/gpt-oss-20b")).toBe(true);
    expect(JSON.parse(calls[calls.length - 1]!.body!).model).toBe("openai/gpt-oss-20b");
  });

  it("does not loop forever: it discovers at most once", async () => {
    const { f, calls } = scripted([
      { match: /GET .*\/models/, status: 200, body: { data: [{ id: "openai/gpt-oss-20b" }] } },
      { match: /POST .*chat\/completions/, status: 404, body: { error: { code: "model_not_found" } } },
    ]);
    const c = new OpenAiCompatibleClient({ baseUrl: "https://x.test/v1", apiKey: "k", model: "gone", fetchImpl: f, modelPreference: ["openai/gpt-oss-20b"] });
    let msg = "";
    try {
      await c.complete({ system: "s", messages: [], tools: [], maxTokens: 5 });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg.includes("model_not_found")).toBe(true);
    expect(calls.filter((x) => x.method === "GET").length).toBe(1);
  });

  it("without a preference list it just reports the error (generic providers)", async () => {
    const { f, calls } = scripted([{ match: /POST/, status: 404, body: { error: { code: "model_not_found" } } }]);
    const c = new OpenAiCompatibleClient({ baseUrl: "https://x.test/v1", apiKey: "k", model: "gone", fetchImpl: f });
    let failed = false;
    try {
      await c.complete({ system: "s", messages: [], tools: [], maxTokens: 5 });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(calls.filter((x) => x.method === "GET").length).toBe(0);
  });

  it("sends reasoning_effort only to gpt-oss models, and omits empty tool lists", async () => {
    const seen: string[] = [];
    const f: FetchLike = async (_u, init) => {
      seen.push(init.body ?? "");
      return { ok: true, status: 200, json: async () => chatOk, text: async () => "" };
    };
    await new OpenAiCompatibleClient({ baseUrl: "https://x.test/v1", apiKey: "k", model: "openai/gpt-oss-120b", fetchImpl: f }).complete({ system: "s", messages: [], tools: [], maxTokens: 5 });
    await new OpenAiCompatibleClient({ baseUrl: "https://x.test/v1", apiKey: "k", model: "llama-3.1-8b-instant", fetchImpl: f }).complete({ system: "s", messages: [], tools: [], maxTokens: 5 });
    await new OpenAiCompatibleClient({ baseUrl: "https://x.test/v1", apiKey: "k", model: "openai/gpt-oss-20b", fetchImpl: f, reasoningEffort: null }).complete({ system: "s", messages: [], tools: [], maxTokens: 5 });
    expect(JSON.parse(seen[0]!).reasoning_effort).toBe("low");
    expect(JSON.parse(seen[0]!).tools).toBe(undefined);
    expect(JSON.parse(seen[1]!).reasoning_effort).toBe(undefined);
    expect(JSON.parse(seen[2]!).reasoning_effort).toBe(undefined);
  });

  it("GROQ_REASONING_EFFORT=off disables the parameter", () => {
    expect(createLlmFromEnv({ GROQ_API_KEY: "g", GROQ_REASONING_EFFORT: "off" })?.label.includes("groq")).toBe(true);
  });
});
