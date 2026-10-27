# How Allowance works (and how to defend it)

## The one-minute explanation
An AI agent never talks to PayPal directly. It talks to the **Allowance gateway**, which looks like PayPal's tools.
For every tool call the gateway:
1. looks up the REAL facts from PayPal (e.g. how big the original payment was),
2. asks an AI reviewer whether the action looks manipulated (it can only escalate),
3. runs a deterministic policy engine: **allow**, **ask a human**, or **block**,
4. forwards allowed calls to PayPal's official MCP server, parks risky ones in an approvals inbox, and never sends blocked ones,
5. writes every step to a hash-chained audit log.

## Map of the code
| Folder | What is in it |
|---|---|
| `src/policy/` | The brain. `engine.ts` decides; `args.ts` strictly parses tool arguments; `risk.ts` classifies all 28 PayPal tools; `compile.ts` turns plain English into a validated policy proposal |
| `src/gateway/` | The door. `gateway.ts` runs the flow above; `audit.ts` is the hash chain; `approvals.ts`, `ledger.ts`, `mutex.ts`, `facts.ts` (PayPal lookups) |
| `src/mcp/` | `upstream.ts` talks to PayPal's MCP server; `server.ts` exposes Allowance itself as an MCP server |
| `src/llm/` | Provider-neutral AI layer: Groq / OpenAI-compatible / Anthropic adapters, retry, model discovery, the risk reviewer |
| `src/agent/` | The demo agent, its inbox of tickets (one is poisoned), and the "obedient agent simulator" |
| `src/app/` | The dashboard server, the simulated PayPal, the Red Team attack suite |
| `src/jobs/` | `redteam-ci.ts`: runs the attack suite and fails if anything gets through (CI and Render cron) |
| `src/spikes/` | Small scripts used to explore PayPal and test things by hand |
| `web/index.html` | The dashboard |

## Answers for "how do you know it is safe?"
1. **Fail closed.** Unknown tool, bad arguments, missing facts, a crashed reviewer, any internal error: block or ask a human.
2. **The AI has no authority.** The reviewer can turn "allow" into "ask a human", never the reverse. The policy writer only drafts proposals that a strict validator checks and the owner approves.
3. **Facts come from PayPal, not the agent.** The agent cannot lie about how big a payment is.
4. **The omitted-amount trap.** PayPal refunds the whole payment if `amount` is left out. We treat that as the full amount, so limits cannot be skipped.
5. **No double-spending the budget.** An allowed action is recorded before PayPal is called, under a lock. Tested with simultaneous refunds.
6. **Held requests do not consume budget** (an agent could otherwise starve real work), and the approvals inbox is capped so an agent cannot flood the human.
7. **The agent cannot approve.** Approval is not an MCP tool.
8. **What you approve is what runs.** Parked requests are private copies.
9. **The agent is not told your limits**, only which rule fired, so it cannot tune attacks. Malformed requests get a format hint so honest agents can fix mistakes.
10. **Tamper-evident audit log.** Each record contains the hash of the one before it.
11. **Kill switch** overrides even approvals granted earlier.
12. **Tested.** 128 automated tests plus a 21-attack Red Team that runs in CI.

## Honest limits (say them before a judge does)
- Protection needs the agent to hold NO direct PayPal credentials; Allowance holds them.
- The PayPal MCP access token lasts hours; restart daily.
- Disputes could not be exercised against the sandbox (none exist), so the demo simulates one.
- The AI reviewer can be wrong, which is why it is advisory only.
- Demo mode uses a simulated PayPal; live mode uses the real sandbox, and its Red Team runs in an isolated range.
