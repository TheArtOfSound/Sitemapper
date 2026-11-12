# Codex agent instructions — Sitemapper / Qira experimental revenue flow
Read this before making changes to this repository.

## Mission
Protect working, existing Sitemapper functionality while investigating the Qira ShipCheck public-URL checker experiment. ShipCheck is a free **acquisition wedge**, not a new unrelated SaaS. Read `docs/CODEX_SHIPCHECK_PRODUCTIZATION_2026-11-12.md` for the explicit scope and `experiments/shipcheck/DEPLOYMENT.md` for deployed identifiers.

## Repo workflow
- Work on `codex/shipcheck-revenue-flow-20261112` or another task branch, not directly on main.
- Run `npm test` and `npm run check` and preserve the existing Sitemapper free scan, CI guard, saved monitoring, auth and Stripe entitlements. Do not rewrite the working product to satisfy an experimental landing page.
- Use `npx wrangler` only where the repository's existing `wrangler.jsonc` applies. For standalone ShipCheck, add a separate config; do not accidentally deploy the main Sitemapper Worker.
- Never create live charges, accept vendor fees, commit keys, or leak customer info. Keep experiments reversible and tests grounded.
- Current high-severity blocker: R2 account access returns error 10042; active Sitemapper monitors fail to save snapshots. See GitHub issue #4. Do not claim paid monitoring works or sell it until R2 is restored and verified end-to-end.
- Before exposing a public arbitrary-target scanner at larger scale, address SSRF and DNS rebinding, rate limits, origin checks, body caps and abuse cases. Existing ShipCheck has only initial rate limits (12 scans/min and 5 beta opt-ins/min per client IP/colo), bounded JSON and strictly-public routing; this is not a completed security audit.
- An HTTP 200 proves neither checkout nor signup success. Browser tests need explicit site owner authorization and safe test-mode credentials.
- The current proposal is approximately $10/week **only if** actual customers validate willingness to pay. Use the free Sitemapper funnel and three true paid pilots as evidence threshold, not a fabricated conversion forecast.
- Do not post to Reddit/X, make mass AI marketing calls, or email user lists without the necessary connected accounts, consent and applicable platform compliance.
- Maintain a short, dated change log with before/after measurements and full test results; finish with a reviewable PR rather than silently merging.

## Useful links
- Current pilot: https://shipcheck.imagineqira.com/
- Main product: https://sitemapper.oortstack.com/
- Draft PR: https://github.com/TheArtOfSound/Sitemapper/pull/3
- R2 outage: https://github.com/TheArtOfSound/Sitemapper/issues/4
