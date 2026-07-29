# Per-resource rules

Rules that apply beyond the generic "fetch the live doc, then provision" flow. Always
read `https://cohesivity.ai/offerings/<name>` before using a resource: this file
carries the stable rules, not the current API surface.

## steel-browser

Available to every tenant without an experimental grant.

- Call only canonical Cohesivity session, tool, and CDP URLs under `/edge/steel-browser`.
- Never request Steel profiles, credentials, proxies, CAPTCHA, viewers, files, or
  connection fields. Cohesivity manages Steel credentials.
- The legacy `browser` resource and `/edge/browser/*` paths are compatibility aliases,
  not a second offering.
- Provisioning performs ephemeral identity admission and returns `session_limits`
  plus whole-offering and per-capability `admission` readiness. Create sessions with
  `{}` unless a shorter timeout is needed.
- The one-shot Browser Tool is scrape only and forces hosted screenshot and PDF
  capture off. For image or PDF bytes, use `Page.captureScreenshot` or
  `Page.printToPDF` over the private CDP connection. Convenience hosted-artifact
  endpoints are unavailable.
- If the user explicitly asked for Cohesivity Steel Browser, do not silently
  substitute a local browser.

### Cost and budgets

- Pricing uses Steel.dev's public Scale rate of $0.08 per browser-hour, billed per
  started minute rounded up.
- Steel.dev advertises up to 14 days of retention. No custom SLA or DPA applies.
- A durable provider-cost safety ceiling defaults to $5 per UTC day. It is a safety
  ceiling, not customer billing.
- Ephemeral tenants sharing an opaque exact-IP-derived identity share one 24-hour
  aggregate budget: 30 browser minutes, 9 session starts, 9 scrapes, 3 concurrent
  sessions. Each tenant's stricter lifetime caps still apply. Claimed accounts
  bypass the identity budget.
- On `browser_ephemeral_identity_usage_limit`, use the returned retry hint and the
  `claim_tenant` remediation.

## inbox

One agent-native address with send, receive, list, read, reply, and delete.

- Ephemeral tenants get the canonical address, five lifetime sends, one recipient per
  message, and no vanity or webhook.
- Claiming preserves the Inbox and unlocks monthly limits, an optional immutable
  `/api/vanity` identity shared with hosting, and a signed `message.received` webhook.
- Provisioning ensures a shared tenant Neon project exists and stores normalized
  messages plus a durable webhook outbox in the reserved `coh_inbox` schema. That
  internal dependency does **not** grant `/edge/postgres`.

## railway-hosting

The primary public hosting option.

- Upload files via `/api/railway/deploy`, then use the returned Cohesivity
  `deployment_url` and `logs_url`. Railway service and dashboard URLs stay internal.
- Manage env vars and custom domains through `/api/railway/*`.
- For vanity and custom domains, `verified` means Railway issued TLS for every host.
  That is authoritative even when the auxiliary DNS flag stays false behind proxied DNS.
- Env, vanity, and domain responses omit provider ids. The one exception is a BYOD DNS
  row, which may necessarily contain the CNAME target the human must configure.
- Cohesivity manages Railway auth plus CPU, RAM, replica, and sleep caps per tier.
- Do not install the Railway CLI, use GitHub, or handle Railway credentials.

## cloudflare-workers

The minimal proxy tier. Provision it for a SPA or any app with no server of its own,
so `/edge/*` calls originate server-side and no `coh_*` key reaches the browser.

## managed-agents

Private always-on Hermes agents.

- Claimed-only: unavailable on an ephemeral tenant.
- They spend from the wallet.
- Provisioning one is a consent gate. Full flow:
  `https://cohesivity.ai/offerings/managed-agents`.

## Provider-metered resources

`openai-api`, `ai-gateway`, `deepgram-api`, and `exa-api` bill successful usage at
provider cost plus 10%, rounded up to the nearest cent per settled charge. Failed
provider calls are not billed. `GET /api/billing/plans` publishes the same rule under
`provider_usage_pricing`.
