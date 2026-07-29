# Troubleshooting

## Symptom table

| Symptom | Cause | Resolution |
|---|---|---|
| HTTP 403, body mentions "error 1010" | Default HTTP client User-Agent. The WAF rejects Python urllib, Go net/http, and Node undici or node-fetch defaults. | Set `plugins-plus-skills:{HARNESS/LLM_NAME}`. Any non-default UA clears it. This is a WAF rejection, not a Cohesivity error. |
| Genesis returns non-2xx | Rate limit, or a transient upstream failure. | The staged bootstrap writes nothing on failure. Retry after a short wait. |
| `.cohesivity` exists but has no `coh_man_` key | Residue of a failed bootstrap from an older, unstaged run. Not a live tenant. | Delete the file and bootstrap again. Any tenant orphaned by the failed attempt expires on its own. |
| Provisioning returns 401 with a valid-looking key | The key was read from a stale or truncated `.cohesivity`. | Re-read the file. Do not re-run genesis while a valid `.cohesivity` exists. |
| Deployed app gets 401 from the data plane in the browser | Keys shipped to client code, or the call originated client-side. | Move `/edge/*` calls to the server tier, or provision `cloudflare-workers` as a proxy. |
| Everything stops working after about 3 days | The ephemeral tenant expired. | Claim before the deadline via `POST /api/claim/url`. An expired tenant cannot be recovered. |
| Tenant paused mid-build | A per-resource hard cap was breached. | `GET /api/status` for lifecycle, caps, and notifications. Claiming resets limits. |
| `browser_ephemeral_identity_usage_limit` | The shared ephemeral-identity browser budget is exhausted. | Use the returned retry hint and the `claim_tenant` remediation. |
| A resource behaves differently from the docs here | The skill carries only the stable core; API detail changes. | Fetch `https://cohesivity.ai/offerings/<name>` for the current contract. |

## Failure modes that are not retryable

**`POST /api/billing/topup` is not idempotent.** Never retry it on a network error.
The charge may have settled even though the response was lost. Check
`GET /api/status` before considering another attempt, and tell the user what you saw.

**A `checkout_url` or `approval_url` is not an error.** When a paid or durable action
returns one, the action is waiting on the user, not failing. Hand over the URL and
wait. Do not look for a way around the gate.

**An expired tenant is gone.** There is no recovery path after `expires_at`. The only
prevention is claiming in time, which is why the expiry belongs in the report to the
user at genesis rather than at the end of the build.

## Diagnosing before you act

`GET /api/status` with the management key returns lifecycle, caps, and notifications.
Check it before any expensive operation when quota is uncertain, and check it first
when something that used to work stops working: paused-for-cap and expired look
similar from the outside but have different remedies.
