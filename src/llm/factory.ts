import { AnthropicClient } from "./anthropic.js";
import { OpenAiCompatibleClient } from "./openai.js";
import type { LlmClient } from "./types.js";

/**
 * Picks an LLM from environment variables (put them in .env, never in code):
 *   ANTHROPIC_API_KEY  (+ optional ANTHROPIC_MODEL)
 *   or GROQ_API_KEY  (+ optional GROQ_MODEL, GROQ_REASONING_EFFORT=off)
 *   or LLM_BASE_URL + LLM_API_KEY + LLM_MODEL   (any OpenAI-compatible service)
 * Returns undefined when nothing is configured; the app then uses the built-in simulator.
 */
export function createLlmFromEnv(env: Record<string, string | undefined>): LlmClient | undefined {
  const anthropicKey = env["ANTHROPIC_API_KEY"];
  if (anthropicKey) return new AnthropicClient({ apiKey: anthropicKey, model: env["ANTHROPIC_MODEL"] || "claude-haiku-5-5" });
  const groqKey = env["GROQ_API_KEY"];
  if (groqKey) {
    // Groq's model catalogue changes often. We start from a sensible default and, if Groq says the model does not
    // exist for this key, the client asks Groq what is available and switches by itself.
    const effort = env["GROQ_REASONING_EFFORT"];
    return new OpenAiCompatibleClient({
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: groqKey,
      model: env["GROQ_MODEL"] || "openai/gpt-oss-120b",
      modelPreference: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
      reasoningEffort: effort === "off" ? null : effort || "low",
    });
  }
  const key = env["LLM_API_KEY"];
  const url = env["LLM_BASE_URL"];
  const model = env["LLM_MODEL"];
  if (key && url && model) return new OpenAiCompatibleClient({ baseUrl: url, apiKey: key, model });
  return undefined;
}
