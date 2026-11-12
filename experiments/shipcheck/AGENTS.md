# Local Codex instructions — experiments/shipcheck

This directory is the **snapshot of a live, separate Cloudflare Worker**, not the Sitemapper production worker. Production ShipCheck is at https://shipcheck.imagineqira.com/ and current source lives in worker.js.

1. Read docs/CODEX_SHIPCHECK_PRODUCTIZATION_2026-11-12.md, ../.. / README.md and SAAS_BUILD_STATUS.md before modifying. Honor the existing Sitemapper free scan and paid SaaS.
2. Do not treat anonymous HTTP URL scans as proof of purchase, signup, checkout or form submission. No browser automation against private/third-party user accounts without owner authorization.
3. DO NOT deploy a public arbitrary-target URL fetcher until SSRF, DNS rebinding, rate limiting, egress and open-redirect security gates pass. Current Worker is a pilot with known defenses still incomplete.
4. Never print customer beta emails, IP addresses, or secrets; use aggregate metrics only. No fake signups, no test rows left in production.
5. Never change the existing Sitemapper Stripe products, active billing, main D1 schema, queue bindings, or monitoring schedule without explicit scope and validated rollback. Reuse architecture instead of replacing it.
6. Make changes on a branch and open a reviewable PR. Include observed before/after screenshots and precise tests. No hardcoded 'success' claims.
7. The user wants autonomous implementation, but live charge activation, new spending, external marketing campaigns, and irreversible permissions remain explicit stop points.
8. Prefer `node --test experiments/shipcheck/tests/smoke.test.mjs` with `SHIPCHECK_LIVE=1` for public smoke checks, and `npm test && npm run check` for existing Sitemapper. Smoke tests are read-only except anonymous scan counts explicitly marked `qa`.

Do not create a second paid Sitemapper backend. ShipCheck is a public conversion-page diagnostics entry point, with a proposed $10/week product to validate against the existing Sitemapper subscription.
