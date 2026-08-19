# Sitemapper SaaS build status

Product category: **Indexability & Website Change Intelligence**  
Mental model: **DECLARED → LIVE → INDEXED → CHANGED**

Working tree: `Projects/01 Active Apps/sitemap` (live v0.7 Worker, GitHub `TheArtOfSound/Sitemapper`).

## Shipped

- Anonymous free scan preserved (`/`, `/api/report`, `/api/analyze`, share `/r/{id}`, agent pack).
- **Monitor this site** conversion on every report.
- D1 multi-tenant schema + local/remote migration `0001_init`.
- R2 snapshot storage, crawl queue, rate-limit KV, 15-minute cron.
- Opaque D1 sessions; GitHub + Google OAuth; `AUTH_DEV_LOGIN` local login.
- Saved projects, monitors, immutable snapshots, deterministic diff engine.
- Dashboard, site overview, Changes, URL explorer, Issues, History.
- Webhook alerts (grouped, deduped). Email channel is stubbed until a mail secret exists.
- Stripe Checkout / portal / webhook signature verification. Buttons 503 honestly if secrets are missing.
- Entitlements: Free / Builder $19 / Pro $49 / Agency $149, metered by sites + monitored URLs + deep checks.
- GSC adapter: properties, URL Inspection, sitemap submit labeled as a **hint**. Indexed state is `unknown` without a connection. Inspection does **not** request indexing.
- CLI `sitemapper guard` + GitHub Action `action.yml`.
- Public tools (`/tools/*`) that run the real engine.
- Issue encyclopedia (`/issues/*`).
- SSRF defenses (scheme, loopback, private/metadata, encoded IPv4, redirect checks, body cap) + tests.
- Fake homepage counters removed (no KV → 0, not 1,284).

## Tested

- `npm test`: 73 passed (audit, robots, SSRF, diff, guard, plans, Stripe signatures).
- `npm run check`: CLI + Worker typecheck clean.
- `wrangler deploy --dry-run`: 291 KiB bundle, bindings present.
- D1 migration applied local + remote.
- Local funnel (`wrangler dev :8799`): anonymous scan → share URL → dev login → **Monitor this site** → dashboard row → queued crawl job `complete`.
- Production (`sitemapper.oortstack.com`, version `5d9d1f2e-c9f4-4c2e-b108-e91e37a78d9c`):
  - home still anonymous
  - KV stats still real (`/api/stats`)
  - `/pricing` $0 / $19 / $49 / $149
  - `/login` honestly reports missing OAuth secrets
  - `/app` 302 → login
  - SSRF `http://127.0.0.1` → 400
  - `/api/analyze?site=https://example.com` share URL + Monitor CTA
  - `/tools/sitemap-checker` and `/issues/noindex-in-sitemap` 200

## Blocked (external credentials)

| Dependency | Why | What works without it |
|---|---|---|
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app | Local `AUTH_DEV_LOGIN=1` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth + GSC | GSC labeled unknown |
| `STRIPE_SECRET_KEY` + `STRIPE_PRICE_*` + webhook secret | Checkout | Pricing page is real; checkout returns 503 with the exact blocker |
| Email sending | Magic-link + email alerts | Webhooks work; email marked unconfigured |

## Next

1. Create GitHub + Google OAuth apps and Stripe prices; `wrangler secret put` them.
2. `wrangler dev` + browser funnel: anonymous scan → monitor → dashboard → crawl.
3. Deploy Worker once that funnel is green.
4. Optional: Workflows for >Worker-limit sites; IndexNow after domain verification; competitor watch.

## Known limitations

- Hosted scan still caps 1,200 URLs / 40 deep checks (Worker CPU). CLI is the heavy path.
- INDEXED layer requires GSC OAuth; never inferred from HTTP 200.
- No overlapping-crawl lock beyond queued/running job rows.
- DNS rebinding: Worker resolves via DoH when available and fail-opens if DoH is down after hostname/IP checks pass.
- Competitor Watch not built (P10).
- Public share reports remain KV snapshots (30 days, noindex via `/r/` robots disallow).
