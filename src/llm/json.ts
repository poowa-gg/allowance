/** Pulls the first JSON object out of a model reply, tolerating ```json fences and chatty text around it. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object found in the model's reply");
  return JSON.parse(text.slice(start, end + 1));
}
