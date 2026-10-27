# Devpost submission: copy, paste, then fill the blanks

## Project name
Allowance: a spending firewall for AI agents

## Tagline
Let AI agents work with PayPal without handing them the keys.

## Inspiration
Agents can now issue refunds, answer disputes and chase invoices, but they also read untrusted text. One poisoned invoice can instruct
an agent to refund the wrong payment. Asking the agent to "be careful" in a prompt is not a security control.

## What it does
Allowance is an MCP gateway in front of PayPal's official MCP server. Every tool call an agent makes is checked: trusted facts are
fetched from PayPal, an AI risk reviewer reads the action and the document behind it, and a deterministic policy engine allows it,
holds it for a human, or blocks it. The owner approves from a dashboard, can flip a kill switch, and gets a tamper-evident audit trail.
A built-in Red Team fires 21 hostile calls (plus 3 legitimate ones) to prove it holds, and it also runs in CI on every push.

## Who it helps (Potential Impact)
Small businesses are being offered AI assistants that can issue refunds, answer disputes and chase invoices, but a single poisoned
document can trick those assistants into moving money. Owners must either avoid automation or trust it blindly. Allowance is a third
option: routine jobs run automatically, risky ones wait for a human, a kill switch stops everything, and every decision is kept in a
tamper-evident record. With the default settings, even a fully hijacked agent cannot move more than the owner's daily limit without approval.
Beneficiaries: shop owners, freelancers and agencies, finance teams, builders of AI agents, and customers. See docs/IMPACT.md.

## How we use PayPal
- PayPal's official MCP server (`@paypal/mcp`) executes approved actions in the sandbox. Verified: a refund approved by a human completed.
- PayPal REST API provides trusted facts (capture, dispute and order amounts) and the authorize/capture/void lifecycle.
- A real trap we designed around: omitting `amount` on a refund refunds the whole payment, which defeats naive limits.

## How we use AI
- A tool-using agent (Groq `openai/gpt-oss-120b` by default; any OpenAI-compatible service or Anthropic also work).
- An AI risk reviewer that explains why an action looks manipulated. It can only escalate to a human, never approve.
- A policy writer that turns plain English into a drafted policy change, validated strictly and applied only when the owner approves.
- AI never has authority over money: a deterministic engine decides.

## How we use AG Grid
The audit trail and ledger are AG Grid tables with sorting, resizing, coloured verdict pills and live updates.

## How we use Render
The public demo is deployed from a `render.yaml` Blueprint: web service with a health check (`/api/health`, which also reports the platform and build), auto-deploy on push, a secret AI key,
per-visitor private sessions, a shared AI budget, a footer that shows "Hosted on Render" with the build id from Render's environment, and an optional hourly cron job that attacks the production build.

## How we built it
TypeScript and Node.js, Model Context Protocol SDK, PayPal sandbox, AG Grid, Vitest (128 tests), GitHub Actions CI. A responsive dark/light interface with an animated live diagram, tested on phone and desktop sizes in a real browser. A pure-function policy engine;
a gateway with a lock so simultaneous calls cannot overspend; a hash-chained audit log; a provider-neutral LLM layer with retries and automatic model discovery.

## Challenges
- Making limits un-gameable: omitted amounts, structuring (many small refunds), races, smuggled fields, inbox flooding.
- Finding our own design flaw: held requests used to reserve budget, letting a compromised agent starve legitimate work. We fixed it and bounded the inbox.
- Free AI tiers rate-limit and rename models; the client retries and discovers working models by itself.

## Accomplishments
A live demo where a fooled agent tries to move $600 and only the honest $5 leaves the account, with the AI reviewer explaining why.

## What we learned
Assume the agent is already compromised, and constrain what a fooled agent can do.

## What's next
Signed approval links and push notifications, per-merchant policies, an AI attacker for the Red Team, more PayPal tools.

## Built with
PayPal MCP server, PayPal REST API, Model Context Protocol, Groq, Node.js, TypeScript, AG Grid, Render, GitHub Actions, Vitest

## Links to fill in
- Public GitHub repo:
- Live demo (Render):
- YouTube video:

## Final checklist before pressing Submit
- [ ] Repo is public, the license shows, and there is no `.env` in it
- [ ] README explains how to run it (it does) and the live demo link is in it
- [ ] The Render link works (open it a few minutes before submitting; free services sleep)
- [ ] Video is under 3:00, public on YouTube, no music, no other companies' logos, no keys visible
- [ ] Text description, "tools used" and the three links are filled in
- [ ] Project image (3:2) uploaded
- [ ] Submitted at least one day before the deadline (Nov 12, 9:00pm GMT+1)
