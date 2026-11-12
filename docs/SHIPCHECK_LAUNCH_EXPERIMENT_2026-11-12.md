# ShipCheck launch experiment — channel plan and decision gates
Date: 2026-11-12. This is a test of verified demand, not a claim of sales or guaranteed Reddit/X conversions.

## Market signal (bounded)
- Public Reddit founder discussions in 2026 describe revenue failures where checkout or signup silently broke after deployment, and how uptime checks failed to catch it. These discussions are anecdotal and can include self-promotion or fabricated posts: treat as user problem hypotheses, not purchase orders.
- Checkly's publicly listed November 2026 offering includes free synthetic browser checks and Starter around $24/month (billed annually). A bare URL checker is a commodity.
- Existing Sitemapper already sells a broader monitoring platform at listed $19/49/149 monthly tiers. New weekly pricing must represent **extra value**, not another marketing name for the same site crawl.

## ICP to test sequentially
1. Solo SaaS maker deploying every week, has a public signup and pricing page and a recent deployment failure.
2. Agency with 3–20 client sites and responsibility for client conversion pages; agency use-case may justify more than $10/week.
3. Service-business site owner whose quote form is their major revenue entry point. Lower technical literacy: outputs must explain the failure plainly.

## Free proof loop
1. Visitor from source-tagged post: `https://shipcheck.imagineqira.com/?src=reddit-sideproject` or `?src=x-story`.
2. Show instant, honest 2-page HTTP status and redirects. Demonstrate one known test 404 without misrepresenting it as a discovered live outage.
3. `Copy Codex investigation brief` lets builder paste evidence into a coding agent; tested in browser.
4. Beta request has explicit opt-in and **NO CHARGE**.
5. Verify email ownership before contacting. Ask about the last revenue-critical failure, what software they already use, and whether they'd pay to prevent a repeat.
6. Count **confirmed paid pilot**, not impressions, views, or unverified emails.

## Candidate organic posts (read and follow each community's current rules)

**Reddit r/SideProject — transparent builder feedback**
Title: I built a free check for the pricing page you forgot to test after deploying
Body:
I shipped a tiny public URL checker after realizing the homepage can be fine while the page that actually converts customers is a 404. It takes a homepage and one critical public URL, shows HTTP status/redirect results, and produces a copyable Codex investigation brief.

Try it if you have a public site: https://shipcheck.imagineqira.com/?src=reddit-sideproject

Important limitation: it's a read-only HTTP check, NOT an end-to-end checkout test. I'm exploring a paid version for scheduled checks of signup/quote/pricing flows, but that does not exist yet.

For anyone who has had this happen: was it the price page, a signup redirect, a form, a webhook, or something else? I'd rather learn from real failures before adding features.

**X test 1 — failure case**
Your homepage returning HTTP 200 doesn't mean the button that makes you money works.

I shipped ShipCheck: check your homepage and a critical public URL, then copy a Codex-ready investigation brief.

It's free, takes no login, and doesn't pretend to complete a purchase. https://shipcheck.imagineqira.com/?src=x-story

**X test 2 — ask founders**
What was the last thing that broke after a deploy while your homepage stayed online?

Signup / Quote form / Checkout / Auth redirect / Webhook / Something else?

I am collecting failure cases before building a paid monitor. Free public URL checker: https://shipcheck.imagineqira.com/?src=x-question

## Publishing status and guardrails
- No Reddit or X post was published by this experiment as of authoring this document.
- Metricool connected brand currently has **zero** social networks configured. A social account integration is required for automated scheduled publishing.
- Never use fake customers, purchased upvotes, brigading, multiple accounts, automated subreddit blasts, hidden affiliate/referral links, or communities that forbid promotional links.
- Response to feedback: reply to actual questions with direct evidence; don't flood comments or DMs.
- On X, a short screen capture of a controlled test with visible URL/result can be more credible than an AI-looking promo graphic.
- Do not send cold automated voice calls to promote this tool; telemarketing consent rules apply.

## Source attribution
`src` tags: `reddit-sideproject`, `x-story`, `x-question`, `github-readme`, `sitemapper`, `qira`, `direct`. Maintain exact values through scan to opt-in; do not treat bot views as real users. Current tables track raw anonymous scan events and unverified beta interest; there is no verified unique visitor or purchase attribution.

## 7-day scorecard (experimental goals, not forecasts)
- 50 real human scans from eligible channels.
- 10 consented beta-interest requests, then email-verify them.
- 5 substantive interviews identifying a broken revenue flow, existing alternative and reason they'd switch.
- 3 real buyers willing to accept a written pilot scope and price; only call them paid if they actually pay.
- Stop any paid acquisition until funnel instrumentation, test-mode signup/checkout, and consent protections are proven end-to-end.

## What if the signal is weak?
- Many scans but zero opt-in: free tool is useful, paid proposition weak or wrong CTA.
- Lots of beta emails but no verified conversations: unqualified curiosity/spam; add verification and interviews.
- Strong agency interest in 10+ client sites: test agency plan first.
- Zero interest with adequate targeted traffic: integrate free checker into Sitemapper as marketing/SEO lead magnet; do not build another subscription.
- Buyers ask for *actual* checkout/broken quote flow, not HTTP status: define an explicit safe browser test requiring site-owner authorization and sandbox data; don't pretend current software does it.

## Reporting
Always separate: researched prospects, post published, real scans, beta requests, verified emails, actual conversations, paying subscriptions, invoices collected and churn. No vanity conversion rates with unknown denominators.
