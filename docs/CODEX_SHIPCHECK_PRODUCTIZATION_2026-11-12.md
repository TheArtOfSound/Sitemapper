# Codex execution brief — ShipCheck → Sitemapper Revenue Flow Protection
**Date:** 2026-11-12 | **Owner:** Qira LLC | **State:** experimental live utility, **NO production paid monitoring subscription yet**

## Your mission
Turn the existing **ShipCheck** public URL checker into a measurable acquisition funnel for the already-built **Sitemapper** platform. Build an evidence-based **Revenue Flow Protection** add-on (only if willingness to pay is demonstrated), not another generic uptime clone.

**Canonical destinations:**
- Public product: https://shipcheck.imagineqira.com/
- Worker: `qira-shipcheck-public-20261112`; Workers.dev backup `qira-shipcheck-public-20261112.bryanleonard237.workers.dev`
- GitHub: `TheArtOfSound/Sitemapper`, branch `codex/shipcheck-revenue-flow-20261112`
- Pilot source: `experiments/shipcheck/worker.js` (exact live Worker snapshot)
- Sitemapper: https://sitemapper.oortstack.com/
- Cloudflare account `eaa59df7f198cbd481763fc7c743b7f4`
- Existing D1 `sitemapper`, ID `0f9731ce-2b90-4e39-9119-4be92fe4adbe`.
- ShipCheck tables `shipcheck_beta_interest_20261112` and `shipcheck_scan_events_20261112` (already exist remotely).

## Ground truth at handoff
- ShipCheck public frontend responds in a real Chromium browser. Its `/api/check` returns HTTP status and redirect data for up to two public HTTPS URLs. The UI exposes a one-click **Copy Codex investigation brief** (not a claim that checkout was functionally tested). Its beta interest form saves email, optional site, stated interest and source to D1. No billing or active paid checks.
- **Nov 12 security increment shipped and tested:** public Worker has bounded JSON parsing (3000 bytes per check and 2000 per interest), Cloudflare approximate rate-limit bindings `SCAN_RATE` 12 per 60 seconds and `INTEREST_RATE` 5 per 60 seconds, and `global_fetch_strictly_public` enabled. Staging Worker: `qira-shipcheck-stage-20261112`. Production and staging `/health` confirmed. The API returns 400 for blocked loopback, 413 for oversized body and 400 for interest missing consent. **SSRF/DNS rebinding hardening still incomplete**; do not scale traffic on the assumption this is a security-certified scanner.
- QA proof completed: `https://www.cloudflare.com/` → 200, nonexistent Cloudflare path → 404; browser rendered the correct result and Codex brief action. QA test rows removed. The post-change analytics table counted the QA scan correctly; at handoff both scan and beta tables had **0 genuine records**.
- Sitemapper already implements free sitemap/SEO scanning, authenticated monitoring, D1/R2/KV/Queues, change history, diff evidence, webhook alerts, and a listed Builder $19/mo, Pro $49/mo, Agency $149/mo. Read `README.md`, `SAAS_BUILD_STATUS.md`, `wrangler.jsonc`, and inspect actual current production configuration before claiming live checkout; older build-status notes may be stale.
- Repo `wrangler.jsonc` targets `worker/index.ts`, includes SSRF tests and the `global_fetch_strictly_public` flag; standalone ShipCheck currently does not inherit that hardening. **A compatibility flag by itself is not a complete SSRF mitigation.**
- Competitive pressure: Checkly Hobby already offers 10 free uptime monitors and 1,000 browser runs per month; Starter lists $24/mo billed annually. Our offer MUST be about a clear, costly outcome or it will have no defensible $10/week value.
- Price is a **test**, not an authorized charge: $10/week ≈ $43.33 average month, 50 retainers ≈ $2,167/month equivalent gross, before fees/refunds/churn. At 90% weekly retention, the original cohort shrinks rapidly; do not count recurring income until Stripe receipts confirm it.

## Newly confirmed P0 production blocker — R2 unavailable
On Nov 12, Cloudflare R2 API for the account returned HTTP 403 / **10042** (`Please enable R2 through the Cloudflare Dashboard.`). Sitemapper D1 shows five recent scheduled crawl failures caused by exactly this error; both enabled monitors have `last_status=failed`. Last persisted snapshot was 2026-11-12 15:16:11Z. **This predates the ShipCheck changes and is not a ShipCheck rollout result.**

**Before selling or adding paid monitoring: resolve [Sitemapper issue #4](https://github.com/TheArtOfSound/Sitemapper/issues/4).** Owner/admin must restore R2 availability through Cloudflare billing/feature controls; API cannot enable it. Do not purchase plans or accept billing on the user's behalf, do not drop/recreate the bucket blindly, and do not modify active customer monitors as a guess. After restoration, verify a complete scheduled crawl → R2 stored object → D1 snapshot row → alert pipeline, with logs and timestamps.

## Non-negotiable constraints
1. **Never overwrite or degrade** existing Sitemapper free scan, dashboards, billing, auth, R2 data, queues, or SEO index routes. Develop on a branch, compare/migrate carefully, run regression tests, and use preview deployment before production. No destructive migrations or dropping tables.
2. **Security gate first.** ShipCheck exposes a public server-side URL probe. Validate and reject localhost, IP literals (all IPv4 encoding forms and IPv6), internal/metadata/private hosts, custom ports, non-HTTPS, forbidden redirects, DNS-rebinding and same-zone origin bypass. Explicitly check DNS/final resolution behavior; fail closed. Reuse Sitemapper's tested SSRF library where possible; add negative tests and bounded timeouts. Add per-IP/identity request limits and anti-bot controls before promoting beyond small beta. Cap total subrequests, redirect hops and response reads; do not scan private services.
3. Never claim `200` proves a button, login, signup, payment or webhook works. Actual browser workflow monitoring requires authorized test credentials and non-charging sandbox or merchant-authorized safe test flow. Treat robots/bot blocks as **inconclusive**, not broken.
4. The public beta-interest table stores unverified emails. Do NOT import these into marketing lists, automatically email them, or present them as paid customers. Implement verified opt-in before follow-up campaigns and a clear deletion path.
5. No fabricated testimonial, usage counter, sales number, R4R or other grant outcome. Store source attribution with opt-in consent. Minimize storage of visitor data: anonymous scan analytics table excludes IP and tested URLs.
6. No unsolicited mass AI-generated marketing phone calls or bulk spam to Reddit/X. Follow channel rules and applicable consent/opt-out laws. Keep any new marketing copy honest and human-reviewable. Do NOT silently authorize paid services, spend, or new financial obligations.
7. Never commit credentials, API tokens, customer emails, internal infrastructure secrets, payment keys or addresses to git or logs.

## Execution phases — go in order

### P0: Reconcile code and security (blocker)
- Re-run `npm install`, `npm test`, `npm run check` for the *existing Sitemapper repo*. Record baseline failures before your edits. Inspect existing `src/`, `worker/`, `migrations/`, and CLI.
- Compare production ShipCheck source with `experiments/shipcheck/worker.js` and retain versioned rollback.
- Implement SSRF containment + throttling + safe redirects; design per-tenant quotas for any future browser tests; add integration tests for redirect to private IP and rebound domains.
- Prove all existing Sitemapper monitoring is unaffected and the pilot remains isolated until it meets parity.

### P1: Make analytics decision-grade
- Existing D1 tables:
```sql
CREATE TABLE shipcheck_scan_events_20261112 (
  id TEXT PRIMARY KEY, ts INTEGER NOT NULL, source TEXT NOT NULL,
  url_count INTEGER NOT NULL, broken_count INTEGER NOT NULL,
  blocked_count INTEGER NOT NULL
);
CREATE TABLE shipcheck_beta_interest_20261112 (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
  site_url TEXT, use_case TEXT NOT NULL,
  requested_at INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'direct'
);
```
- Define measurable funnel `landing_view → scan_attempt → scan_completed → copy_fix_brief → beta_interest_opt_in → email_verified → demo_held → paid_subscription`.
- Current product logs only **scan requests** and **beta interest**, not unique visitors, copy events, email verification, demos, or purchases. Do NOT make unsupported conversion claims. Add only privacy-preserving, bot-resistant event storage as needed; make deletion available.
- Publish a small internal owner dashboard with exact data source, coverage period, source, consent status and honest empty state. No hardcoded “activity.”

### P2: Product differentiation (paid value)
- Product is **Revenue Flow Protection**, an add-on or sub-plan of Sitemapper, not a separate duplicative back end. Focus on 1–5 revenue-critical URLs per site.
- MVP capabilities after consent and security gates: scheduled public URL checks, redirect and HTTP outcome history, dependency-aware retries, actionable alert with time-of-first-detection and evidence, copyable Codex/Claude fix brief with regression checklist.
- Next only with proof of buyers: permissioned Playwright tests of CTA activation, quote-form submission into a sandbox inbox, OAuth login callback and Stripe test-mode session initiation; **never run a real charge or create fake live customer/order data**.
- Add a link from a ShipCheck scan to Sitemapper monitor/agent pack, preserving referral source. Ensure pricing copy transparently says which plan includes each check type. No hidden annual commitment.

### P3: Prove reliable behavior with tests
- Tests: no-credential happy path; working and missing public paths; 401/403 bot-block as inconclusive; redirect loop cap; redirect-to-private blocked; IPv6 / encoded IPv4 / IP-in-DNS blocked; malformed JSON; oversized body; missing consent; simulated D1 downtime; 429 bursts; source attribution; IDN ambiguity; public probe cannot trigger POST, mutate data, or create payments.
- Run smoke checks against preview then production, with no real customer credentials.
- Verify version deployment path and restore plan before any production update. Record tests, screenshots, logs and known limitations in the PR.

### P4: Test distribution honestly
- One deeply useful Reddit showcase post in a community that permits that format, and one X demo with a real failure example. Avoid cross-post spam. Link to free scanner with distinct `?src=reddit` / `?src=x`.
- Show a brief **200/404 evidence demo** (no fake leaked sales or performance figures). Follow up only when requested.
- Collect 10 or more verified real comments/replies; ask what broke most recently, where users wish checks ran (deploy hook, schedule, mobile browser), and current alternative. At least three confirmed willingness-to-pay interviews before building paid synthetic flows.
- If social connections unavailable, prepare posts and report **not published**. Metricool's brand currently shows no connected social accounts; no direct Reddit publishing capability confirmed.

### P5: Paid pilot only after buyer validation
- Preserve Sitemapper's existing paid tiers. Test an add-on, e.g. `$10/week for a small set of critical revenue flows`, against `$29–$49/month` alternatives. Don't undercut or create conflicting entitlements.
- Only launch live Stripe after verifying service scope, real test performance, billing failure paths, entitlements and cancellation; never activate an owner account on a dummy charge to inflate stats.
- First paid threshold: three actual customers with receipts and retained functional checks for 2+ weeks. Then optimize acquisition and publish exact gross/net economics.

## Acceptance / stop rules
- **Technical**: main repo tests remain green; protected probe tests pass; no regression to existing free Sitemapper, correct scanner behavior on working/broken/bot-blocked URLs; source tracked; reversible deployment.
- **Product**: clear differentiation from $0 Checkly tier and $19 Sitemapper Builder; explicit evidence of real customer problem and meaningful resolution output; no false checkout claims.
- **Growth**: report number of source-tagged scans, verified opt-ins, qualified demos, **actual paid users**, churn and revenues separately. Report 0 when 0 and "unknown" when unavailable.
- **Stop/pivot**: after meaningful sample of targeted feedback, if zero paid pilot interest or high cost/complexity, avoid adding features; test a different narrow buyer problem within existing stack.
- **Ownership**: produce a PR with code, tests, screenshots and a 1-page decision log; do not merge until gates pass. User wants autonomous execution *within this scope*, not silent irreversible side effects.

## Codex opening command / prompt
```
Work from TheArtOfSound/Sitemapper, branch codex/shipcheck-revenue-flow-20261112.
Read docs/CODEX_SHIPCHECK_PRODUCTIZATION_2026-11-12.md and experiments/shipcheck/AGENTS.md.
Inspect existing paid Sitemapper before building duplicate backends.
Start with the P0 security and regression baseline, then work phases in order.
Build working product improvements and show evidence; do not claim new purchases or published posts without verification.
Stop on required third-party credentials, live payment activation, marketing consent or non-reversible changes and report exactly what is blocked.
```

## Sources read at creation
- Sitemapper repo README, SAAS_BUILD_STATUS and wrangler.jsonc (current GitHub default branch Nov 12).
- Current ShipCheck Worker source, rendered Chromium QA against public site, D1 counts.
- Checkly public 2026 pricing.
