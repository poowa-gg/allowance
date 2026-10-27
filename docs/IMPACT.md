# Why Allowance matters: how it helps businesses, ventures and people

## The problem, in one picture
An AI assistant is like a very fast new employee who believes everything it reads. That is wonderful for saving time, and dangerous
when you hand it the company card. One fake invoice with a hidden instruction can make it refund the wrong person, pay the wrong
account, or email private invoices to a stranger. Most small businesses cannot afford to find that out the hard way.

So today there are two bad choices: **do not use AI helpers** (and keep doing boring money jobs by hand), or **trust them blindly**
(and hope nothing goes wrong). Allowance is the third choice: **use them, with a safety net**.

## What Allowance changes (in plain words)
| Without Allowance | With Allowance |
|---|---|
| The AI has your PayPal keys, so one trick can cost real money | The AI never holds the keys. Every request goes through a checkpoint first |
| You hope the AI is careful | A rule-based guard decides, and a second AI watches for manipulation |
| Big mistakes are possible in seconds | Small, normal jobs run automatically; big or odd ones wait for your click |
| You cannot prove what happened | Every decision is saved in a log that shows if anyone edits it |
| One panic means pulling the plug on everything | One kill switch stops everything instantly |

## Who benefits, and how
**1. The small online shop owner (the main person we built this for).**
Refunds, dispute replies and invoice reminders eat hours every week. With Allowance an AI can handle the routine ones (say, refunds
under a limit you choose) while anything unusual waits in an approvals inbox. You get time back without risking your savings.

**2. Freelancers and small agencies.**
Chasing late payments is awkward and tiring. An AI can send reminders for you, with limits so it cannot spam customers or send your
invoices to outside email addresses.

**3. Finance and operations teams in growing companies.**
Teams spend human time approving tiny things. Allowance lets machines handle the small, safe ones and puts a human's attention on
the large and strange ones. The audit log gives a clear record for managers and auditors.

**4. Builders of AI agents and platforms.**
Anyone building an AI product that touches payments needs a safety layer. Allowance plugs in through the standard Model Context
Protocol (the way many AI tools connect to apps), so it is a drop-in guardrail rather than a rebuild.

**5. Customers.**
Refunds and answers come faster, and the safety rules help keep fraud and mistakes from landing on honest customers.

## The most important number: the worst case is limited
With the default settings, even an AI that is completely fooled can move at most the **daily limit you set** (default $100) without
a human, and no single action above the **hard cap** (default $500) can ever run. The owner chooses those numbers, and can change them
in plain English. A hijacked AI becomes an inconvenience instead of a disaster.

## How it improves a business
- **Saves time:** routine money jobs run on their own.
- **Prevents losses:** a trick cannot exceed limits the owner set.
- **Builds trust to automate:** you can say yes to AI because you can see and control what it does.
- **Gives proof:** a tamper-evident record helps with disputes, accountants and (later) compliance.
- **Reduces stress:** an inbox and a kill switch mean you stay in charge.

## How it could become a business (the venture view, honestly)
- **Who pays:** shops and agencies that use AI agents; AI-agent builders who need a safety layer.
- **Simple pricing ideas:** a monthly fee per protected agent, or a price per thousand checked actions, with a higher tier for audit exports and team approvals.
- **Why it can spread:** it works with the standard connection method AI tools already use, so adding it is quick.
- **What makes it hard to copy:** the combination of strict rules, a built-in attacker that keeps testing it, tamper-evident records, and plain-English policy. The Red Team gets better as new tricks appear.
- **The honest risk:** payment companies and card networks are adding their own agent controls. Allowance's answer is to be an independent layer that works across tools and shows its own proof, rather than a single provider's feature.

## How it could improve lives (without overclaiming)
Big companies have finance teams and lawyers to make automation safe. Ordinary people running small businesses do not. If AI helpers
can be made safe enough for them, then a one-person shop gets the same help as a large company: more time with family, fewer late
nights on refunds, and less fear that one bad message could wipe out a month of earnings. Safety is what turns AI from something
only big teams dare to use into something everyone can use.

## Paste-ready text for Devpost ("Potential Impact")
> Small businesses are being offered AI assistants that can issue refunds, answer disputes and chase invoices, but a single poisoned
> document can trick those assistants into moving money. Today owners must either avoid automation or trust it blindly. Allowance gives
> them a third option: a spending firewall that lets AI handle routine jobs while risky ones wait for a human, with a kill switch and a
> tamper-evident record. With default settings, even a fully hijacked agent cannot move more than the owner's daily limit without approval.
> That turns AI from a risk into a tool that small shops, freelancers and finance teams can safely use today.

## The 30-second pitch
"AI helpers are about to handle our money, but they believe whatever they read. Allowance sits between the helper and PayPal. It lets
safe, small jobs through, holds risky ones for a human, blocks the rest, and keeps proof. In our demo, a fooled AI tried to refund six
hundred dollars and only the honest five left the account."

## Questions a judge might ask (and honest answers)
| Question | Answer |
|---|---|
| "Why not just tell the AI to be careful?" | A prompt is a request, not a lock. Hidden text in a document can override it. Allowance does not rely on the AI behaving |
| "What if the AI reviewer is fooled too?" | It can only say "ask a human", never "approve". If it stays quiet, the strict rules still decide |
| "Will PayPal build this themselves?" | They may add controls. Allowance is an independent layer that works across tools, tests itself with a Red Team, and shows proof. This is also a working design PayPal's own platform can learn from |
| "Does it slow people down?" | Routine small actions pass instantly. Only unusual or large ones wait for a click |
| "What about false alarms?" | Held requests are one click to approve. The owner can loosen or tighten limits in plain English |
| "Is this real PayPal?" | Yes, in the sandbox, through PayPal's official MCP server. The video shows a real refund ID. Demo mode uses a simulated PayPal so anyone can try it safely |
| "What is not finished?" | Signed approval links and phone notifications, per-business policies, and an AI attacker for the Red Team. We say so in the README |
