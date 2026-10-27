/**
 * Lists the models YOUR Groq key can actually use.
 * Run:  npx tsx src/spikes/05-groq-models.ts
 */
try {
  (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env");
} catch {
  /* no .env is fine */
}

const key = process.env["GROQ_API_KEY"];
if (!key) {
  console.error("GROQ_API_KEY is missing. Add it to .env first.");
  process.exit(1);
}

const res = await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(`Groq answered ${res.status}. Check that the key is correct.`);
  process.exit(1);
}
const data = (await res.json()) as { data?: { id: string }[] };
const ids = (data.data ?? []).map((m) => m.id).sort();
console.log(`\nModels available to your key (${ids.length}):\n`);
for (const id of ids) {
  const skip = /whisper|tts|orpheus|guard|safeguard|embed|compound|moderation/i.test(id);
  console.log(`${skip ? "   " : " * "} ${id}`);
}
console.log("\nLines marked * are chat models. To force one, add to .env:  GROQ_MODEL=<model id>\n");
