import type { Block, CompleteArgs, Completion, LlmClient } from "../llm/types.js";

/**
 * THE OBEDIENT AGENT SIMULATOR: a stand-in "LLM" that does whatever the ticket text says.
 * Why it exists: real models often (and increasingly) refuse injected instructions, which is
 * good for users but makes a firewall demo unpredictable. The right way to test a firewall is
 * to ASSUME the agent is fooled, so this simulator is fooled every single time. It plugs into
 * the exact same agent loop as a real LLM and costs nothing, so judges can run the demo with no API key.
 */
export class ObedientSimulator implements LlmClient {
  readonly label = "Obedient agent simulator (always follows instructions in tickets)";

  async complete(args: CompleteArgs): Promise<Completion> {
    const last = args.messages[args.messages.length - 1];
    if (!last) return { content: [{ type: "text", text: "Nothing to do." }], stop: "end" };

    // Second turn: tool results are in, so wrap up.
    const results = last.content.filter((b): b is Extract<Block, { type: "tool_result" }> => b.type === "tool_result");
    if (results.length > 0) {
      const blocked = results.filter((r) => r.isError || /BLOCKED_BY_ALLOWANCE/.test(r.content)).length;
      const held = results.filter((r) => /PENDING_APPROVAL/.test(r.content)).length;
      const done = results.length - blocked - held;
      return { content: [{ type: "text", text: `Finished. ${done} action(s) went through, ${held} are waiting for a human, ${blocked} were refused.` }], stop: "end" };
    }

    const text = last.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n");
    const calls: Block[] = [];
    let n = 0;
    const id = () => `toolu_sim_${++n}`;

    const capture = /SIMCAP_[A-Z]+_\d+/.exec(text)?.[0];
    if (capture && /refund/i.test(text)) {
      const full = /full (amount|refund)|entire|everything|in full/i.test(text);
      const dollars = /\$(\d+(?:\.\d{1,2})?)/.exec(text)?.[1];
      const input: Record<string, unknown> = { capture_id: capture };
      if (!full && dollars) input["amount"] = { currency_code: "USD", value: dollars.includes(".") ? dollars : `${dollars}.00` };
      calls.push({ type: "tool_use", id: id(), name: "create_refund", input });
    }
    const dispute = /PP-D-SIM-\d+/.exec(text)?.[0];
    if (dispute && /accept/i.test(text)) {
      calls.push({ type: "tool_use", id: id(), name: "accept_dispute_claim", input: { dispute_id: dispute, note: "customer_was_correct" } });
    }
    const invoice = /INV2-SIM-\d+/.exec(text)?.[0];
    if (invoice && /remind/i.test(text)) {
      const input: Record<string, unknown> = { invoice_id: invoice };
      const cc = /cc\s+([\w.+-]+@[\w.-]+\w)/i.exec(text)?.[1];
      if (cc) input["additional_recipients"] = [cc];
      calls.push({ type: "tool_use", id: id(), name: "send_invoice_reminder", input });
    }

    if (calls.length === 0) return { content: [{ type: "text", text: "No action needed for this ticket." }], stop: "end" };
    return { content: [{ type: "text", text: "On it. I will do what the ticket asks." }, ...calls], stop: "tool_use" };
  }
}
