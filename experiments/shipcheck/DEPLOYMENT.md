# ShipCheck operator runbook — November 12, 2026
This file documents the standalone **pilot** Worker as currently deployed. The source in `worker.js` corresponds to live code after the Nov 12 limited security increment.

## Infrastructure

| Item | Identifier |
|---|---|
| Public website | https://shipcheck.imagineqira.com/ |
| Backup route | https://qira-shipcheck-public-20261112.bryanleonard237.workers.dev/ |
| Staging | https://qira-shipcheck-stage-20261112.bryanleonard237.workers.dev/ |
| Cloudflare account | `eaa59df7f198cbd481763fc7c743b7f4` |
| Zone | `imagineqira.com` / ID `42aae9807a388d31afbbf0ccdc76ae61` |
| Public Worker script | `qira-shipcheck-public-20261112` |
| Staging Worker script | `qira-shipcheck-stage-20261112` |
| D1 binding | `DB` → `sitemapper`, ID `0f9731ce-2b90-4e39-9119-4be92fe4adbe` |
| Rate-limit bindings | `SCAN_RATE`: namespace 420711, 12 calls / 60 sec; `INTEREST_RATE`: namespace 420712, 5 calls / 60 sec |
| Worker compatibility | 2026-11-12, `global_fetch_strictly_public` |
| Business model | Free link checker; paid monitoring beta is **proposed** $10/week, NO live billing |

The current Cloudflare account refused a new D1 database request (limit error 7406); this experiment uses **separate tables within the existing Sitemapper database**. Do not delete existing tables or create conflicting migrations.

## D1 tables
`shipcheck_scan_events_20261112`: anonymous scan attempt metadata `id,ts,source,url_count,broken_count,blocked_count`; no URL or IP fields. Not deduplicated by visitor, and can be bot-inflated. Test scans use source `qa` and should be excluded from business metrics.
`shipcheck_beta_interest_20261112`: email and declared preference (not verified); requires consent in UI. Does **not** imply payment, a valid opt-in address, or a buyer.

Read-only owner queries:
```sql
SELECT source, COUNT(*) scans,
       SUM(url_count) checked_urls,
       SUM(broken_count) possibly_broken_urls
FROM shipcheck_scan_events_20261112
WHERE source <> 'qa'
GROUP BY source ORDER BY scans DESC;

SELECT source, use_case, COUNT(*) raw_beta_requests
FROM shipcheck_beta_interest_20261112
GROUP BY source, use_case ORDER BY raw_beta_requests DESC;
```
Do not select beta emails in analytics summaries or publish customer contact data.

## Current HTTP endpoints
- `GET /`: public responsive UI, free scan form and beta interest form.
- `GET /health`: returns `{"ok":true,"component":"ShipCheck public research pilot","billing":"not enabled"}`.
- `POST /api/check`: checks 1 or 2 public HTTPS URLs, reports HTTP status/redirect/time. **Not a real browser checkout test.** Requires JSON, rejects invalid URL, enforces 3000-byte body cap, rate limited ~12 requests/minute per client IP per Cloudflare colo.
- `POST /api/interest`: explicit opt-in required, honeypot input, email & option validation, 2000-byte cap, rate limited ~5 requests/minute per client IP per colo. Stores *unverified* interest; no live mailer or billing.
- Unknown paths: 404.

## Smoke checks already passed
Staging (Chromium Browser Rendering through Cloudflare):
- `GET /health` → 200, billing disabled.
- 2-URL read-only probe → 200 JSON, tested homepage 200, controlled nonexistent URL 404.
- `https://127.0.0.1/` → 400.
- 6000-byte request → 413.
- beta form missing consent → 400.

Production:
- Same 2-URL read-only check returned 200 and 404 after deployment.
- Production settings show D1 + 2 rate-limit bindings and strict-public fetch flag.
- All QA rows removed after checks; at authoring, genuine scan count 0 and raw beta requests 0.
- Browser UI exposed the copyable Codex investigation brief.

## Important security caveats
1. **Not ready for traffic spikes.** Per-IP rate limiting is approximate, per location, and shared NAT users can be throttled. It does not replace WAF, CAPTCHA/Turnstile, per-tenant quotas or independent egress controls.
2. **SSRF controls incomplete.** Hostname validation blocks obvious IP, custom port and local suffix targets, and redirect targets are revalidated. It does not prove safe post-DNS-resolution addresses, private-network absence or DNS-rebinding resistance. Use Sitemapper's existing SSRF logic as a starting point; audit its known fail-open DoH limitation.
3. Don't probe private sites or user accounts. Public status codes can be misleading when anti-bot or authentication controls are present; 401/403/429 are labelled restricted/inconclusive.
4. A 200 does not verify the checkout, signup, OAuth callback, webhook, form delivery or purchase entitlement.
5. Any future live Stripe flow must explicitly verify products, pricing, checkout sessions, webhook authentication, cancellation and entitlement checks.

## Deploy / rollback policy for Codex
- **Do not** deploy the root Sitemapper Worker solely to change ShipCheck; it has separate bindings, routes and production responsibilities.
- Move the pilot into a maintainable `wrangler.shipcheck.jsonc` (or equivalent) config and CI when Codex takes over. Avoid overwriting `wrangler.jsonc` used for main Sitemapper.
- Before any public ShipCheck deployment, deploy to `qira-shipcheck-stage-20261112`, test static page, `/health`, valid/invalid/oversize/no-consent and expected rate limiting. Then deploy production and repeat smoke checks.
- Save exact deployed source and metadata to this branch before changing live. Stage first and keep ability to roll back the previous archived `worker.js` using earlier Git commits. Never delete the D1 tables as part of rollback.
- CLI (requires configured Cloudflare credentials and an appropriate separate Wrangler config):
```bash
# Existing parent repo has a wrangler.jsonc for Sitemapper.
npm install
npm test
npm run check
SHIPCHECK_LIVE=1 node --test experiments/shipcheck/tests/smoke.test.mjs
# DO NOT run 'npx wrangler deploy' at repo root expecting it to deploy ShipCheck.
```
- Verify Cloudflare logs/traces and D1 metrics (source `qa` excluded) after each deploy. Do not expose raw beta emails.

## Early acquisition decision
Before implementing scheduled billing or browser workflow automation, validate at least 3 buyers willing to pay for a specific alerting/diagnosis feature; free scanning alone is unlikely to justify $10/week against synthetic-monitoring competitors.
