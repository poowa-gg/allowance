# PayPal MCP tools (28) and how Allowance treats them
Snapshot of the live sandbox server on 2026-10-23, stored in `src/policy/paypal-tools.snapshot.json`.

| Tier | Tools | Treatment |
|---|---|---|
| READ | list/get/show tools, `generate_invoice_qr_code`, `list_transactions`, `get_refund` | allowed |
| WRITE | create invoice/product/plan/order/subscription/shipment, `update_product` | allowed (low risk) |
| CUSTOMER_FACING | `send_invoice`, `send_invoice_reminder`, `cancel_sent_invoice`, `cancel_subscription` | human approval, except reminders; rate limited; extra email recipients escalate |
| MONEY | `create_refund`, `accept_dispute_claim`, `pay_order` | policy limits, budget, velocity, approval |
| unknown | anything else | blocked |

## Real traps found in PayPal's tool schemas
1. `create_refund`: leaving out `amount` refunds the WHOLE payment.
2. `accept_dispute_claim` makes PayPal refund the customer automatically: a refund in disguise.
3. `accept_dispute_claim`'s `note` allows only letters, digits, `_` and `-` (no spaces).
4. Amounts are strings; orders and subscriptions are USD-only in this toolset.
5. Free text from third parties (dispute details, invoice notes) flows into the agent: the injection channel.
