import type { Gateway, GatewayResult } from "../gateway/gateway.js";
import type { Block, LlmClient, Message } from "../llm/types.js";
import { AGENT_SYSTEM_PROMPT } from "./tickets.js";
import type { Ticket } from "./tickets.js";
import { AGENT_TOOLS } from "./tools.js";

export interface AgentEvent {
  kind: "ticket" | "assistant" | "tool" | "error";
  ticketId?: string;
  title?: string;
  text?: string;
  tool?: string;
  args?: unknown;
  outcome?: "ALLOWED" | "HELD" | "BLOCKED" | "ERROR";
  codes?: string[];
  /** What the AI risk reviewer said, when it flagged this action. */
  reviewer?: string;
}

const outcomeOf = (r: GatewayResult): AgentEvent["outcome"] =>
  r.kind === "FORWARDED" || r.kind === "APPROVAL_STATUS" ? "ALLOWED" : r.kind === "PENDING_APPROVAL" ? "HELD" : r.kind === "BLOCKED" ? "BLOCKED" : "ERROR";

/**
 * THE AGENT LOOP: give the model a ticket, let it call tools, send every call through the
 * Gateway, feed the (possibly refused) result back, repeat. The agent is a normal tool-using LLM;
 * it has NO special powers and NO direct line to PayPal.
 */
export async function runAgent(opts: { llm: LlmClient; gateway: Gateway; tickets: Ticket[]; maxSteps?: number; onTicket?: (t: Ticket) => void }): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  const maxSteps = opts.maxSteps ?? 6;

  for (const ticket of opts.tickets) {
    opts.onTicket?.(ticket);
    events.push({ kind: "ticket", ticketId: ticket.id, title: ticket.title, text: ticket.body });
    const messages: Message[] = [{ role: "user", content: [{ type: "text", text: `New ticket ${ticket.id}: ${ticket.title}\n\n${ticket.body}` }] }];

    try {
      for (let step = 0; step < maxSteps; step++) {
        const reply = await opts.llm.complete({ system: AGENT_SYSTEM_PROMPT, messages, tools: AGENT_TOOLS, maxTokens: 900 });
        for (const b of reply.content) {
          if (b.type === "text" && b.text.trim()) events.push({ kind: "assistant", ticketId: ticket.id, text: b.text.trim() });
        }
        messages.push({ role: "assistant", content: reply.content });

        const uses = reply.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
        if (uses.length === 0) break;

        const results: Block[] = [];
        for (const use of uses) {
          const r = await opts.gateway.handleToolCall(use.name, use.input);
          const text = r.agent.content.map((c) => c.text ?? "").join("").slice(0, 2000);
          events.push({
            kind: "tool",
            ticketId: ticket.id,
            tool: use.name,
            args: use.input,
            outcome: outcomeOf(r),
            codes: "decision" in r ? r.decision.reasons.map((x) => x.code).filter((c) => c !== "WITHIN_POLICY") : [],
            reviewer: "decision" in r ? r.decision.reasons.find((x) => x.code === "ADVISORY_SUSPICIOUS")?.message : undefined,
          });
          results.push({ type: "tool_result", toolUseId: use.id, content: text, isError: r.agent.isError === true });
        }
        messages.push({ role: "user", content: results });
      }
    } catch (err) {
      events.push({ kind: "error", ticketId: ticket.id, text: err instanceof Error ? err.message : "The language model failed." });
    }
  }
  return events;
}
