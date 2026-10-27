# Judging criteria and prizes: what answers each one

## The five criteria (from the Devpost page)
| Criterion | What judges ask | Our answer |
|---|---|---|
| Technological Implementation | Thorough, non-trivial use of PayPal and AI? | PayPal's official MCP server executes real sandbox refunds; PayPal REST supplies trusted facts; three AI features (agent, risk reviewer, policy writer); 128 tests; CI with an attack suite |
| Design | A complete, coherent product, not just a proof of concept? | One responsive dashboard (phone to desktop, dark and light): animated live diagram, approvals inbox, kill switch, audit trail (AG Grid), Red Team, plain-English policy, a guided 4-step tour |
| Potential Impact | A credible, specific problem for a real audience? | Small merchants giving AI agents refund and dispute powers; one hijacked invoice can move real money; the worst case is capped by limits the owner sets. See `IMPACT.md` |
| Innovation / Idea | Creative and different from existing concepts? | "Assume the agent is compromised": a Red Team built in, the omitted-amount trap, AI that can only escalate, tamper-evident proof |
| Presentation | Does the video show it working end to end? | `DEMO_GUIDE.md`: a 2:40 story from the poisoned invoice to real PayPal proof |

## Prizes to aim for
- **Main prizes** (1st/2nd/3rd, Most Creative, Most Impactful) and the honorable mentions **Best Demo Delivery**, **Best Use of PayPal + AI**, **Best Use of Agentic Commerce**.
- **Sponsor prizes:** AG Grid (cash: $5,000 / $2,000 / $1,000) and Render (credits: $1,000 / $750 / $500).
- **Limit (from the Official Rules):** one project can win at most ONE main/honorable prize plus ONE sponsor prize. So enter both sponsor categories, but you can only receive one sponsor prize. AG Grid pays cash; Render pays credits.
- Read the rules, section 8 "eligible submissions", for AG Grid and Render. Whatever they ask you to show, show it, and describe it in the Devpost text.

## How we use AG Grid
The Audit trail and the Ledger are AG Grid tables: sortable, resizable columns, coloured verdict pills, live updates every 2 seconds.

## How we use Render
- `render.yaml` Blueprint: the whole demo is created from one file (infrastructure as code).
- Web service with a **health check** (`/api/health`): traffic is routed only when it returns 200.
- **Auto-deploy** on every push.
- **Secrets** (the AI key) live in Render's dashboard, never in the repo.
- Per-visitor private sessions and a shared AI budget make a public link safe.
- Optional **cron job** that attacks the production build every hour and fails if anything gets through.
