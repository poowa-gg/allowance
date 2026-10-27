import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOOL_RISK, classifyTool, needsPolicyCheck } from "./risk.js";

/**
 * The tool list is a COMMITTED snapshot of what PayPal's MCP server exposed on 2026-10-23, so this test
 * passes on a fresh clone. If you also have a fresh dump (npm run spike:mcp writes docs/paypal-mcp-tools.json),
 * it is checked too, which is how you notice when PayPal adds a tool.
 */
const SNAPSHOT = new URL("./paypal-tools.snapshot.json", import.meta.url);
const FRESH_DUMP = "docs/paypal-mcp-tools.json";
const snapshotNames = (): string[] => (JSON.parse(readFileSync(SNAPSHOT, "utf8")) as { tools: string[] }).tools;

describe("risk map", () => {
  it("classifies EVERY tool in the snapshot of PayPal's server (no gaps)", () => {
    const unclassified = snapshotNames().filter((n) => classifyTool(n) === "UNKNOWN");
    expect(unclassified).toEqual([]);
  });

  it("has no stale entries for tools that are not in the snapshot", () => {
    const live = new Set(snapshotNames());
    const stale = Object.keys(TOOL_RISK).filter((n) => !live.has(n));
    expect(stale).toEqual([]);
  });

  it("also classifies every tool in a fresh dump, if you made one", () => {
    if (!existsSync(FRESH_DUMP)) return; // optional extra check
    const fresh = (JSON.parse(readFileSync(FRESH_DUMP, "utf8")) as { name: string }[]).map((t) => t.name);
    expect(fresh.filter((n) => classifyTool(n) === "UNKNOWN")).toEqual([]);
  });

  it("fails closed on unknown and sneaky names", () => {
    for (const name of ["", "drop_everything", "constructor", "__proto__", "CREATE_REFUND"]) {
      expect(classifyTool(name)).toBe("UNKNOWN");
      expect(needsPolicyCheck(name)).toBe(true);
    }
  });

  it("treats money-out tools as MONEY", () => {
    expect(classifyTool("create_refund")).toBe("MONEY");
    expect(classifyTool("accept_dispute_claim")).toBe("MONEY");
    expect(classifyTool("pay_order")).toBe("MONEY");
  });

  it("lets pure reads through without a policy check", () => {
    expect(needsPolicyCheck("list_transactions")).toBe(false);
    expect(needsPolicyCheck("get_dispute")).toBe(false);
  });
});
