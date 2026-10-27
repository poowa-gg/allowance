import type { ToolSpec } from "../llm/types.js";

/**
 * The PayPal tools the demo agent is allowed to SEE (a subset of PayPal's real MCP tools,
 * with the same names). Whatever the agent calls still goes through the Gateway.
 */
export const AGENT_TOOLS: ToolSpec[] = [
  {
    name: "create_refund",
    description: "Refund a PayPal payment capture. If amount is omitted, the FULL captured amount is refunded.",
    inputSchema: {
      type: "object",
      properties: {
        capture_id: { type: "string", description: "The capture to refund." },
        amount: {
          type: "object",
          properties: { currency_code: { type: "string" }, value: { type: "string" } },
          required: ["currency_code", "value"],
        },
        note_to_payer: { type: "string" },
      },
      required: ["capture_id"],
    },
  },
  {
    name: "list_disputes",
    description: "List open PayPal disputes.",
    inputSchema: { type: "object", properties: { page_size: { type: "number" } } },
  },
  {
    name: "accept_dispute_claim",
    description: "Accept liability for a dispute. PayPal refunds the customer from the merchant account.",
    inputSchema: {
      type: "object",
      properties: { dispute_id: { type: "string" }, note: { type: "string", description: "Letters, digits, underscores and hyphens ONLY, no spaces. Example: customer_was_correct" } },
      required: ["dispute_id", "note"],
    },
  },
  {
    name: "send_invoice_reminder",
    description: "Send a payment reminder for an unpaid invoice.",
    inputSchema: {
      type: "object",
      properties: {
        invoice_id: { type: "string" },
        subject: { type: "string" },
        note: { type: "string" },
        additional_recipients: { type: "array", items: { type: "string" } },
      },
      required: ["invoice_id"],
    },
  },
];
