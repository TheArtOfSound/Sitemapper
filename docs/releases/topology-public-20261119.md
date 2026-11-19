# Sitemapper topology release — November 19, 2026

## Status

**Production marketing routes live and browser-verified.** This release follows source PR #8, merged as commit `793cacc3475bc1a85d7c7dd9ce68f51075a2d631`. The distinctive cobalt/navy design replaces the earlier green editorial iteration.

The Sitemapper origin Worker is **not replaced**. It continues to own scanning, login, sessions, Stripe, queues, D1, R2, API and schedules. Only public marketing URLs are routed to separate service-bound modules.

## Route inventory

Cloudflare zone `bab007f1fc7a0b1902d289d9811dd8c1`:

| URL route | Route ID | Worker |
| --- | --- | --- |
| `sitemapper.oortstack.com/` | `0079b616dd084f6a93f052a4f7948fab` | `sitemapper-topology-home-20261119` |
| `sitemapper.oortstack.com/pricing*` | `74c5e2cfbbe54fc5a9c468aac114a5fd` | `sitemapper-topology-pages-20261119` |
| `sitemapper.oortstack.com/compare*` | `037e0ca24c064f02959798ff69309859` | `sitemapper-topology-pages-20261119` |
| `sitemapper.oortstack.com/about*` | `9b2a798bb23d4c8386e3a7c6204928e4` | `sitemapper-topology-pages-20261119` |

### Source and bindings

- `deploy/edge/topology-home.mjs` and `deploy/edge/topology-pages.mjs` preserve the actual deployed modules as inspected after release.
- These are **generated deployment snapshots**, not independent design sources. Change the canonical components in `worker/render.ts` and `worker/saas/html.ts` first; regenerate the edge copies to avoid design drift.
- Both modules require Cloudflare **service binding** `SITEMAPPER_ORIGIN` to service `sitemapper`, environment `production`, and module script entrypoint `worker.js`. Uploading JavaScript without the service binding breaks pages.
- Worker compatibility date used: `2026-06-18`. No storage, payment, secret or queue bindings are copied to these marketing modules.

## Design scope

- Home: scan form first, explicitly *illustrative* SVG sitemap topology; original scan JS and `/api/report` / `/api/scan` remain on the origin.
- Pricing: shows real backend prices, plan limits and dynamic enrollment links. The edge transform reads live backend card markup, removes the unverified `Most used` claim and progressively discloses extra features. For **signed-in** app-shell markup, the edge returns the origin unchanged to preserve billing/session behavior.
- Compare: scan → monitoring → CI explanation, not a mobile-hostile data table; avoids claiming detection proves indexing or revenue impact.
- About: transparent scanner limitations, real builder name, founder portrait and contact.

### Explicit remaining limitations

- This release does **not** redesign the authenticated dashboard, monitor creation, report pages or billing settings.
- The Pricing transform expects four plan cards with their current server-rendered shape. It falls back to the unmodified original page if that markup changes; source plan limits remain in the origin Worker.
- A broad Cloudflare project rebuild or Worker overwrite could remove API/account functionality. Do not replace `sitemapper` with a marketing-only script.
- SEO/indexability evidence is bounded by the scanner's actual public crawl; an illustration is not an observed scan.
- The exact-root `/` route is separate from query-bearing root URLs; test UTM query variants before assuming the redesign covers all entry traffic.
- Marketing modules send `Cache-Control: private, no-store` to prevent user-specific HTML caching. Monitor edge response latency before optimizing caching.

## Validation completed

1. Sitemapper PR #8 GitHub `Test` and `CI` workflows passed at source head `4cb5e3ecbe56d96cc50c3c5be5dca58d90a89a86`.
2. Browser renders verified at desktop (approximately 1260–1380px) and mobile (390px), including full interactive pricing cards, comparison, founder portrait and scan-first homepage.
3. Checked live `/`, `/pricing`, `/pricing?source=portfolio`, `/compare`, `/about`, `/login` and `/api/stats`. The marketing routes show the cobalt design; login/API remain routed to the origin application.
4. No token, Stripe secret, API key, D1 content, or R2 data was modified by this release.

## Rollback

If a marketing route misbehaves, use the Cloudflare Workers Routes API for zone above:

- Home: PUT `/zones/{zone}/workers/routes/0079b616dd084f6a93f052a4f7948fab` with the exact pattern `sitemapper.oortstack.com/` and old script `sitemapper-editorial-home-20261119`, or restore `sitemapper` as appropriate.
- Pricing and Compare: remove **only** the two newly created route IDs, returning requests to the existing `sitemapper` application.
- About: PUT the original route ID back to script `sitemapper-owner-about-20261119`.
- Do not delete any production origin Worker, binding, database, queue, account or secret.
- After any rollback, browser-test `/`, `/pricing`, `/login` and a read-only API route, including mobile.

## Design philosophy for other products

Don't reuse this cobalt system indiscriminately. Sitemapper is a **site topology / inspection instrument**; its brand owes the color and diagram choices to its actual function. Each next product should receive a different visual diagnosis, a specific core user journey, and its own typographic and interaction rationale.
