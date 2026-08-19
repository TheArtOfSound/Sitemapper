# Sitemapper Competitive Matrix — August 2026

**Positioning for Sitemapper:** Indexability & Website Change Intelligence  
**Core loop:** DECLARED → LIVE → INDEXED → CHANGED  
**Do not clone Sitemap Monitoring.** Differentiate on temporal change intelligence, deploy-regression detection, GSC evidence, and sitemap↔live reconciliation.

Research date: 2026-08-18. Pricing is as published on official pages on this date. Where a number was not visible on the official page, it is marked **unknown** or attributed to a third-party listing. No invented prices.

---

## 1. Market snapshot

Three product clusters compete for the same buyer, but they solve different jobs:

| Cluster | Job | Typical price | Typical weakness |
|---|---|---|---|
| Sitemap-specific monitors | Watch declared URLs for add/remove/break/noindex | $9–$79/mo | Shallow; no GSC evidence; no live↔index reconciliation |
| Technical SEO crawlers / suites | Periodic full-site audit + (sometimes) always-on crawl | $18/mo desktop → $125–$549/mo cloud/suite | Expensive, crawl-credit or seat-taxed, weak deploy-diff narrative |
| Generators / validators / visualizers | One-shot find, validate, generate, visualize | Free or $2–$20/mo | No monitoring, no history that matters |
| Website change / deploy monitors | Detect content or visual diffs on selected pages | Free–$350/mo (page-metered) | Not sitemap- or indexability-aware |

The open gap: **a temporal product that treats the sitemap as a declaration of intent, then proves whether those URLs are live, indexable, actually indexed (GSC), and what changed after a deploy.** Nobody currently owns DECLARED → LIVE → INDEXED → CHANGED as a first-class loop.

Closest clones of a naive sitemap monitor: [Sitemap Monitoring](https://sitemapmonitoring.com/), [SEOTesting Sitemap Monitor](https://seotesting.com/sitemap-monitoring/), [Oh Dear sitemap checks](https://ohdear.app/docs/features/sitemap-monitoring), [PageCrawl sitemap monitoring](https://pagecrawl.io/help/features/article/sitemap-monitoring). Closest indexability-diagnosis wedge: [SitemapFixer](https://sitemapfixer.com/). Closest always-on technical watch: [Ahrefs Always-on Audit](https://ahrefs.com/blog/always-on-audit/). Closest GSC-native change intelligence: [SEOTesting](https://seotesting.com/).

---

## 2. Competitive matrix

### 2.1 Sitemap Monitoring — sitemapmonitoring.com

| Dimension | Finding |
|---|---|
| Acquisition wedge | “The only monitoring tool purpose-built for sitemap health.” Indie makers, consultants, agencies. 14-day trial, no credit card. |
| Free tier | Trial only (14 days). No forever-free plan on the pricing page. |
| Paid trigger | Need ongoing checks after trial; URL-limit warnings; noindex/canonical gated to Pro+; hourly + API gated to Agency. |
| Current pricing | **Official:** Starter **$9/mo** — 3 sites, 5 monitors/site, 500 URLs/monitor, daily, email. Pro **$29/mo** — 10 sites, 20 monitors/site, 2,000 URLs/monitor, 6-hourly, noindex + canonical + CSV. Agency **$79/mo** — 50 sites, 50 monitors/site, 5,000 URLs/monitor, hourly, API, priority support. Annual = 2 months free (~17% off). Unlimited team members, no per-seat fees. Source: https://sitemapmonitoring.com/pricing |
| Monitoring frequency | Daily / 6-hourly / hourly by plan. Notifications “within minutes of a check completing.” |
| Sitemap capabilities | Auto-discover from robots.txt + common paths. XML, sitemap index (full recursion), image/video/news, sitemap.txt. Detects malformed XML, HTTP errors, oversized sitemaps, index recursion. Public sitemaps only; auth “on roadmap.” Over-limit: still checks but stops at plan URL cap and warns. |
| Technical audit capabilities | Per-URL HTTP status + response time. Pro+: noindex (meta + X-Robots), canonical mismatch. Not a full technical crawler. |
| History / diffs | New/removed URL diffs with timestamps. 90-day URL-count and health history. CSV export (Pro+). Does **not** store page content — only URL, status, redirect chain, noindex, canonical. |
| Notifications | Email. Agency: hourly awareness. |
| Integrations | API on Agency. No Slack/GSC listed on official pages. |
| Agency features | 50 sites, unlimited seats, API, priority support. |
| SEO / content strategy | None. Positioning is “evidence when clients blame you.” |
| Obvious weaknesses | Caps at 5,000 URLs/monitor even on Agency. No GSC. No INDEXED state. No content/hash diffs. No deploy correlation. No live-vs-declared reconciliation beyond status/noindex/canonical. Easy to clone at the feature level. |
| Do not build | A $9 daily email-diff of added/removed sitemap URLs with 90-day count charts. That is their entire product. |

Sources: https://sitemapmonitoring.com/ · https://sitemapmonitoring.com/pricing

---

### 2.2 SitemapFixer — sitemapfixer.com

Especially relevant as an **acquisition surface**, not as a monitoring product.

| Dimension | Finding |
|---|---|
| Acquisition wedge | “Crawled — currently not indexed.” Free AI sitemap check in ~60 seconds. No signup for first check. Domain-only input (finds sitemap automatically). Nine standalone free tools. |
| Free tier | First check: no signup, full sitemap + **30 live URL health checks**, no credit card. Account: **1 full analysis / month**. |
| Paid trigger | More than 1 analysis/month; PDF export; history; multi-site monitoring; Slack; white-label / API / seats. |
| Current pricing | **Official:** Free. Starter **$15/mo** or **$9/mo** annual — 50 analyses/mo, AI recs, PDF, email support, 7-day history. Pro **$35/mo** or **$19/mo** annual — unlimited analyses, 90-day history, up to 10 sites, Slack + email alerts. Agency **$89/mo** or **$49/mo** annual — unlimited sites, white-label, API, up to 10 seats, dedicated AM, 1-year history. 7-day refund. Source: https://sitemapfixer.com/pricing |
| Monitoring frequency | Pro “multi-site monitoring (up to 10)” — exact cadence **unknown** on official pages. Product is primarily on-demand analysis, not continuous watch. |
| Sitemap capabilities | Finds via `/sitemap.xml`, `/sitemap_index.xml`, robots.txt, “20+ common paths.” Full sitemap fetch + clustering. Validates broken URLs, redirects, noindex-in-sitemap, canonical mismatches, trailing-slash / case / underscore variants. Works with WP, Shopify, Next.js. |
| Technical audit capabilities | Live health on a sample (30 URLs on free). Detects staging noindex shipped to prod, crawl-budget URL variants, 404s remaining in sitemap, canonical-to-other-URL, broken sitemap route after deploy. Output is a **ranked fix list**, not a score. LLM (Claude) writes the plan. |
| History / diffs | 7 / 90 / 365 days of **analysis history**, not URL-level temporal diffs. |
| Notifications | Slack + email on Pro+. |
| Integrations | Stripe billing. Slack. API on Agency. No GSC listed. |
| Agency features | Unlimited sites, white-label reports, API, 10 seats, dedicated AM. |
| SEO / content strategy | Content-gap / orphan language on the homepage, but the product is diagnostic, not a content suite. Learn/guides blog for SEO acquisition. |
| Free-tool surface (9 tools) | Sitemap finder; XML sitemap checker; sitemap generator; robots.txt checker; meta tag checker; canonical checker; hreflang tester; site audit; plus the main AI checker. Listed on homepage and Fazier launch page. Individual tool URLs were not all crawlable as a `/tools` index (that path 404s). |
| Obvious weaknesses | Sampled live checks (30), not full-URL monitoring. AI plan is not GSC-verified INDEXED evidence. Pricing undercuts suites by doing one job — but that job is a one-shot audit, not change intelligence. |
| Do not build | Nine SEO-keyword-stuffed free checkers as the *product*. Use 1–2 free tools as **wedge**, not as the brand. Do not compete on “AI fix list in 60 seconds” as the core loop. |

Sources: https://sitemapfixer.com/ · https://sitemapfixer.com/pricing · https://fazier.com/launches/sitemapfixer

---

### 2.3 Sitemap Explorer — sitemapexplorer.com

| Dimension | Finding |
|---|---|
| Acquisition wedge | Free in-browser visual sitemap.xml viewer. No signup. Competitor-sitemap exploration. |
| Free tier | Entire product is free. “No installation, no account, no credit card.” |
| Paid trigger | None visible. |
| Current pricing | **Free.** No paid plan on the site. |
| Monitoring frequency | None. One-shot. |
| Sitemap capabilities | Paste sitemap URL or domain; auto-find. Sitemap index expansion. Interactive tree. Filter by lastmod / keyword / changefreq. Export XML or CSV. View priority, changefreq, custom namespaces. |
| Technical audit capabilities | Stale-content filter via lastmod. Folder badge counts. No live HTTP/noindex/canonical crawl advertised. |
| History / diffs | None. |
| Notifications | None. |
| Integrations | Browser-only. |
| Agency features | None. Competitor analysis is a FAQ talking point. |
| SEO / content strategy | Stale lastmod → content refresh. Folder counts → IA / crawl-budget intuition. Not a strategy platform. |
| Obvious weaknesses | Client-side, no persistence, no monitoring, no live checks, no GSC. FAQ still mentions deprecated Google/Bing sitemap ping URLs. |
| Do not build | A pretty tree visualizer as a paid feature. If you ship a tree, keep it free and thin. |

Note: Unrelated products share the name (Chrome/Firefox “Sitemap Explorer” extension; a free Shopify app). The product specified is https://sitemapexplorer.com/.

Sources: https://sitemapexplorer.com/

---

### 2.4 Screaming Frog SEO Spider — screamingfrog.co.uk

| Dimension | Finding |
|---|---|
| Acquisition wedge | Industry-standard desktop crawler. Free 500-URL download. |
| Free tier | Crawl **500 URLs**. Core issue finding, titles/meta, robots, hreflang, exact duplicates, XML sitemap generation, visualisations. |
| Paid trigger | >500 URLs; save/open crawls; JS rendering; crawl comparison; scheduling; GSC/GA/PSI; custom extraction; AI crawl; segmentation; Looker Studio; support. |
| Current pricing **USD** | **Official USD page:** Paid **$279 / licence / year**. Volume: 1–4 = $279; 5–9 = $265; 10–19 = $249; 20+ = $235. Licences last 1 year, per user. No monthly option. Source: https://www.screamingfrog.co.uk/seo-spider/pricing/ (GBP equivalent shown elsewhere as £199; EUR €245.) |
| Monitoring frequency | None as a service. Paid: local **scheduling**. Comparison is crawl-vs-crawl, not always-on. |
| Sitemap capabilities | Generate XML sitemaps. Crawl from sitemap. Not a sitemap monitor. |
| Technical audit capabilities | Full spider: status/redirects, titles/meta/robots, hreflang, duplicates + near-duplicates, JS rendering, structured data, AMP, accessibility, spelling, custom extraction/JS, OpenAI & Gemini crawl, PSI, GA, GSC, link metrics. Unlimited crawl size limited by RAM/disk. |
| History / diffs | Crawl Comparison (paid). Saved crawl files. |
| Notifications | None native (local app). |
| Integrations | GA, GSC, PageSpeed Insights, Looker Studio, OpenAI, Gemini, link-metrics providers. |
| Agency features | Volume licence discounts. Per-seat annual licence. No multi-tenant cloud. |
| SEO / content strategy | Extraction + AI crawl assist. Not a keyword/content suite. |
| Obvious weaknesses | Desktop, not a monitor. No DECLARED→INDEXED loop. No deploy regression as a product. Agencies still run it *alongside* a monitor. |
| Do not build | A 300-check desktop crawler. You will lose to SF on depth and to cloud suites on collaboration. |

Sources: https://www.screamingfrog.co.uk/seo-spider/pricing/ · https://www.screamingfrog.co.uk/seo-spider/

---

### 2.5 Sitebulb (Desktop + Cloud) — sitebulb.com

| Dimension | Finding |
|---|---|
| Acquisition wedge | “Prioritized Hints” (300+), visual crawl maps, clearer client reports than SF. Desktop cheap; Cloud “half the price of Botify/Lumar/OnCrawl.” |
| Free tier | No forever-free desktop plan on official pages. Trial implied (third-party reviews mention 14-day). Official trial length **not confirmed on the pages fetched**. |
| Paid trigger | Need scheduled / comparable / structured-data / hreflang / accessibility reports (Pro); or remote team crawls at scale (Cloud). |
| Current pricing | **Desktop (official snippet + listings):** Lite **$18/mo** — 1 user, 10,000 URLs/audit. Pro **$42/mo** — 1 user; extra users listed on Capterra at +$11. 15% off yearly (Lite ~$13.50, Pro ~$35 per third-party 2026 reviews). Official desktop page hid the dollar amounts in the scrape; G2/Capterra and a search snippet of the official page all show $18 / $42. Treat $18/$42 as **current listed USD monthly**. **Cloud official:** “From $125/month”; FAQ also says “from £95/month.” Plan table (official server page + matching search snippet of that page): Mini **$125/mo** — 2 users, 50k URLs/mo, 50k max/audit, recurring, no concurrent, no desktop licences. Small **$245/mo** — 5 users, 1M URLs/mo, 250k max/audit, desktop licences included. Medium **$495/mo** — 10 users, 2.5M URLs/mo, 1M max/audit, concurrent. Enterprise custom — 10+ users, 5M+ URLs/mo. Unlimited projects. JS crawl not extra. Sources: https://sitebulb.com/subscriptions/pricing/index · https://sitebulb.com/subscriptions/pricing/server/ · https://sitebulb.com/cloud/ |
| Monitoring frequency | Desktop Pro: scheduled audits. Cloud: automated recurring crawls. Not always-on / not deploy-triggered. |
| Sitemap capabilities | Crawl + audit sitemaps as part of a full crawl. Not a sitemap-diff product. |
| Technical audit capabilities | 300+ Hints, JS (Evergreen Chromium), crawl maps, duplicate content, structured data, hreflang, accessibility, AMP, spellcheck (Pro+). Compare audits. |
| History / diffs | Audit comparison (“see what’s changed”). Not URL-level change intelligence over time. |
| Notifications | Slack, webhooks (Cloud). |
| Integrations | GA, GSC, Google Sheets, Slack, Looker Studio / Data Studio, webhooks. MCP “coming soon.” |
| Agency features | Unlimited Cloud projects (no project tax). Hybrid desktop+cloud from Small up. Custom reports. |
| SEO / content strategy | Hint explanations are educational. Not a content platform. |
| Obvious weaknesses | Cloud starts ~7× a $19 builder tool. Recurring crawl ≠ change intelligence. No INDEXED evidence loop beyond GSC join. |
| Do not build | 300-hint visual audit suite or a credit-free million-URL cloud crawler. |

---

### 2.6 Ahrefs Site Audit / Always-on Audit

| Dimension | Finding |
|---|---|
| Acquisition wedge | World-scale crawler + Ahrefs Free (formerly Webmaster Tools) for verified sites. Always-on Audit as 24/7 safety net. Free Website Change Monitor + Firehose for page diffs. |
| Free tier | **Ahrefs Free** — no CC. For **verified** sites: limited Site Explorer, Site Audit (170+ issues, health score), Web Analytics. Unverified: Social Media Manager, AI Content Helper, SEO Toolbar. Same account as old AWT. Source: https://ahrefs.com/free |
| Paid trigger | Unverified competitor research, more crawl credits / projects / history / keywords / AI prompts, API, Always-on speed, IndexNow auto-submit, Patches. |
| Current pricing | **Official page displayed EUR (locale):** Lite **€119/mo** — 5 unverified projects, 6 mo history, 750 KW, 100k crawl credits, 25k max pages/project, 1 user (+€37.4/user, max 2). Standard **€229/mo** — 20 projects, 2 yr history, 2k KW, 500k credits, 50k pages/project. Advanced **€419/mo** — 50 projects, 5 yr, 5k KW, 1.5M credits, 250k pages. Enterprise **€1,394/mo** annual commitment — from 3 users, 5M+ credits, 5M pages. USD list prices were **not shown** on the fetched official page. Third-party 2026 reviews still quote older USD ($29 Starter / $129 Lite / $249 Standard / $449 Advanced / $1,499 Enterprise) — **do not treat those as current official**. **Add-ons:** Content Kit from €89/mo; Report Builder €89/mo; Project Boost Pro **€18.7/mo per project** (IndexNow auto, Ask AI, AOA 10 pages/min, instant recrawl, AI detection 1k URLs); Project Boost Max **€180/mo per project** (Patches, batch AI, AOA 30 pages/min, unlimited AI detection). Source: https://ahrefs.com/pricing |
| Monitoring frequency | Scheduled audits consume credits. **Always-on Audit** (Lite+): 24/7 at **1 URL/min**, **does not consume crawl credits**. Boost Pro 10/min, Max 30/min. Alerts grouped every 30 minutes. Prioritizes by traffic, inlinks, depth, indexability, **IndexNow signals**. |
| Sitemap capabilities | Sitemap generator free tool. Site Audit can crawl via site/sitemap. Not a sitemap-diff product. |
| Technical audit capabilities | 170+ issues. Patches (Max) can apply simple on-page fixes. IndexNow auto-submit is a **boost add-on**. Custom issues + alert sensitivity. |
| History / diffs | AOA daily: pages added, issues spotted/fixed, per-page change extent. Site Explorer historical windows by plan. Free Website Change Monitor: 1-year text diffs for a single URL (no signup). |
| Notifications | Email for new error-level issues (grouped). Custom alert categories. |
| Integrations | GSC Insights, Looker Studio (Advanced+), API, MCP, IndexNow, Ahrefs Connect. |
| Agency features | Portfolios (Standard+), extra seats, Enterprise SSO/audit log. Expensive per extra user. |
| SEO / content strategy | Full suite: KW explorer, content helper/grader, Brand Radar / AI prompts, social. Irrelevant to clone. |
| Obvious weaknesses | Suite tax. AOA is a slow continuous crawl, not a sitemap declaration model, not deploy-aware, and default 1 URL/min is too slow for “what just shipped.” IndexNow auto is paywalled per project. |
| Do not build | Backlink index, keyword database, Brand Radar, Patches, or a 170-check generic site audit. |

Sources: https://ahrefs.com/pricing · https://ahrefs.com/blog/always-on-audit/ · https://ahrefs.com/site-audit · https://ahrefs.com/free · https://ahrefs.com/website-change-monitor · https://ahrefs.com/index-now

---

### 2.7 Semrush Site Audit

| Dimension | Finding |
|---|---|
| Acquisition wedge | All-in-one SEO + AI visibility. Free SEO Checker (100 pages). Site Audit inside every paid SEO plan. |
| Free tier | Free account: **100 pages/month** site audit / SEO Checker. No CC. Source: Semrush blog 2026-05-22 and siteaudit marketing page. |
| Paid trigger | More sites, more pages, daily/weekly scheduled audits, JS rendering (legacy Guru+), historical SEO, API, AI Site Audit, content tools. |
| Current pricing | **Official Semrush One / SEO & AI Search (USD):** SEO **$139/mo** or **$117.33/mo** annual — 5 sites, 500 KW/day, Site Audit, basic AI search tracking. Starter **$199/mo** or **$165.17** annual — MCP, 50 AI prompts/day, AI-ready Site Audit. Pro+ **$299/mo** or **$248.17** annual — 15 sites, 1,500 KW, historical SEO, content optimization. Advanced **$549/mo** or **$455.67** annual — 40 sites, 5,000 KW, API, share of voice. Extra users from **$45/mo**. Reports $10–$20/mo. Enterprise custom (multi-million-page crawling). Source: https://www.semrush.com/pricing/seo-ai-search/ |
| Crawl limits (KB still uses old toolkit names) | Pro SEO Toolkit: 100k pages/mo, **20k/audit**. Guru: 300k/mo, 20k/audit. Business: 1M/mo, 100k/audit. How these map 1:1 onto the 2026 SEO/Starter/Pro+/Advanced names is **not restated** on the current pricing page. Source: https://www.semrush.com/kb/539-configuring-site-audit |
| Monitoring frequency | Once / daily / weekly scheduled audits. Not always-on. |
| Sitemap capabilities | Crawl sources: Website, robots.txt sitemap, sitemap by URL (**one sitemap URL at a time**), or import file. Sitemap coverage is a Site Audit check. |
| Technical audit capabilities | Hundreds of technical + on-page + AI-search-health checks. Crawlability, indexability, robots, canonicals, structured data. User agents: SiteAuditBot Desktop/Mobile, OpenAI-Search. JS rendering on Guru/Business (legacy names). Googlebot UA removed for new campaigns. |
| History / diffs | Tracks progress over time inside a project. Not a deploy-diff product. |
| Notifications | Project / scheduled-audit emails (suite-level; details vary). |
| Integrations | GA, GSC, MCP (Starter+), API (Advanced), Looker-style reports add-on. |
| Agency features | Multi-site, extra users, white-label reports add-on, Agency Partners listing $90/mo. |
| SEO / content strategy | Full suite + AI visibility. Out of scope to clone. |
| Obvious weaknesses | Suite price. One sitemap URL per crawl setting. Scheduled audit ≠ change intelligence. No DECLARED→INDEXED evidence product. |
| Do not build | Keyword magic, AI visibility tracker, or a 100-page free “SEO score” checker as the brand. |

Sources: https://www.semrush.com/pricing/seo-ai-search/ · https://www.semrush.com/siteaudit/ · https://www.semrush.com/kb/539-configuring-site-audit · https://www.semrush.com/blog/seo-audit-tools/

---

### 2.8 Seobility

| Dimension | Finding |
|---|---|
| Acquisition wedge | Affordable all-in-one with a **real free plan** and a 300-parameter audit. Strong EU SMB / beginner brand. Free SEO Checker standalone tool. |
| Free tier | **Basic — Free:** 1 project, 1,000 pages/crawl, re-crawl wait 3 days, 10 keywords (desktop, weekly), 5 standalone-tool requests/day, 100 external links checked. No JS crawl, no full duplicate analysis. |
| Paid trigger | Unlimited re-crawls, more projects/pages/keywords, JS crawl, automatic regular crawling, backlinks, uptime, white-label (Agency), AI-bot robots.txt report. |
| Current pricing | **Official EUR, plus VAT.** Premium listed on official page / search snippet of that page as **€49.90/mo** (14-day trial; ~€39.90/mo annual at 20% off). Agency **not extracted as a number from the official HTML table** (JS-rendered). Multiple 2026 reviews citing the official page report Agency **€179.90/mo** (~€143.92 annual) / listed on G2 as **$50 / $200**. Extra projects: €12.90 (Premium) / €9.90 (Agency) per project+100 KW. Extra 100 KW: €9.90 / €7.90. Treat Agency euro price as **unverified on the raw page scrape**. Sources: https://www.seobility.net/en/pricing/ |
| Monitoring frequency | Paid: automatic regular crawling (custom interval). Uptime: Premium up to every 3 min; Agency every 1 min. Free: 3-day recrawl wait. |
| Sitemap capabilities | Website audit covers XML sitemaps / robots.txt as part of the crawl. Not a sitemap-diff monitor. |
| Technical audit capabilities | Status codes, broken pages, meta, on-page, response time, URL quality, click distance, incoming/outgoing links, thin/duplicate/cannibalization, typos, AI-bot robots.txt access (paid). JS crawl on paid. Agency: 5 parallel crawlers, 100k pages, subdirectory crawl, single-page analysis. |
| History / diffs | Project history via recrawls. Not URL-level change intelligence. |
| Notifications | Uptime email alerts (paid). |
| Integrations | CSV/PDF export. MCP “coming soon.” White-label reports on Agency. |
| Agency features | 15 projects, 100k pages, 1,500 KW, 5 crawlers, JS, white-label, email+phone, 200 tool req/day. |
| SEO / content strategy | Keyword research + TF*IDF content tool (daily request cap). AI Overview tracking (full text on paid). AI Visibility Tracking coming soon (3 / 15 / 250 prompts). |
| Obvious weaknesses | All-in-one mile-wide. Free plan is a lead magnet, not a monitor. No GSC-native INDEXED loop. Agency €180 is still a suite, not a change-intelligence tool. |
| Do not build | Rank tracker, TF*IDF, backlink monitor, or uptime-every-minute. |

Sources: https://www.seobility.net/en/pricing/ · https://www.seobility.net/en/seocheck/

---

### 2.9 XML-Sitemaps.com / PRO-Sitemaps

| Dimension | Finding |
|---|---|
| Acquisition wedge | 20+ years, “51M+ sitemaps created.” Instant free generator, no registration, 500 URLs. Upsell to hosted auto-updating sitemaps. |
| Free tier | **500 URLs**, multiple websites, cloud sitemap hosting, download XML/HTML/TXT. Validator + bot simulator + HTTP headers tools. |
| Paid trigger | Sites >500 URLs; automatic updates; image/video/news sitemaps; SEO health reports; advanced crawler config. |
| Current pricing | Free 500 URLs. **PRO from $2.44/mo** (annual, −30%) / monthly examples from 2026 reviews of https://pro-sitemaps.com/docs/pricing/: 1,000 pages **$5.99/mo** or **$4.19/mo** annual; 5,000 **$8.99 / $6.29**; 25,000 **$17.99 / $12.59**; 100,000 **$35.99 / $25.19**; 600,000 **$89.99 / $62.99**; 1,200,000 **$179.99 / $125.99**. Official docs page confirms “from $2.44/month” and URL-count slider to 5M but does not print the full grid in the scrape. |
| Monitoring frequency | PRO: automatic sitemap updates (generation cadence **not specified** on the fetched pages). |
| Sitemap capabilities | Generate XML/HTML/TXT; host in the cloud; image/video/news; lastmod from server response; priority by click depth. |
| Technical audit capabilities | Broken-link detection and “SEO health reports” on PRO. Not an indexability product. |
| History / diffs | “History of sitemaps report” mentioned in 2026 third-party writeups of PRO. |
| Notifications | Not a monitoring-alert product. |
| Integrations | API on PRO (third-party docs). Submit-to-engines messaging (legacy). |
| Agency features | Multiple websites on free. Per-site URL pricing. |
| SEO / content strategy | None. |
| Obvious weaknesses | Generator/hoster, not a monitor. lastmod-from-server can be wrong. Google ignores priority/changefreq. |
| Do not build | Cloud sitemap hosting or a 500-URL free generator as a paid SKU. |

Sources: https://www.xml-sitemaps.com/ · https://pro-sitemaps.com/docs/pricing/

---

### 2.10 Sitemap validators / finders / visualizers

CreatoHub: **no current product page found** under that name for a sitemap validator/visualizer as of this research. Do not assume it exists.

| Product | Wedge | Free | Paid | Notes | Source |
|---|---|---|---|---|---|
| Sitemap Explorer | Visual tree | All free | None | See §2.3 | sitemapexplorer.com |
| XML-Sitemaps validator | Validate XML | Free tool | — | Companion to generator | xml-sitemaps.com/validate-xml-sitemap.html |
| SEOmator Sitemap Finder | No-signup finder | Free; 50 files/run, index expanded 1 level | Account unlocks history / break alerts / full audits | Scanned 109,440 domains (2026-07-20): 70.4% had a sitemap | https://seomator.com/sitemap-finder |
| Ahrefs Sitemap Generator | Free tool → suite | Free | Ahrefs paid | Generator, not monitor | https://ahrefs.com/sitemap-generator |
| Ahrefs Website Change Monitor | One-URL year of diffs, no signup | Free | Firehose (paid, price **unknown** on fetched page) | Text add/remove, severity tags; **not** sitemap-aware | https://ahrefs.com/website-change-monitor |
| Octopus.do / FlowMapp / Miro / Canva / WriteMaps | Visual IA planning | Free or freemium | Design-tool pricing | UX sitemaps, not XML monitoring | various |
| Rarchy / VisualSitemaps | Visual crawl + screenshots | Limited free | VisualSitemaps cites **$29** for 1,000 pages in on-site comparison copy | Screenshot/UX, not indexability | https://visualsitemaps.com/ |
| Browser “Sitemap Explorer” extension | Find/inspect/export XML | Free | — | Unrelated to sitemapexplorer.com | Chrome Web Store |
| Generic free checkers (SiteGPT, SEOptimer, Word Spinner, etc.) | SEO-tool spam / lead gen | Free, often no signup | Parent SaaS | Saturated. Weak brand. | various |

**Do not build:** another no-signup XML pretty-printer, another 50-path sitemap finder as the company, or a UX visual sitemap builder.

---

### 2.11 Website change-detection / deploy monitoring (adjacent)

These matter because Sitemapper’s CHANGED state must not look like Visualping.

#### Visualping — visualping.io

- Wedge: visual + text + element change detection with AI summaries; SEO change monitoring is one use case among many.
- Free: **$0** — 5 pages, 150 checks/mo, every 60 min, 1 user. REST API + MCP even on free.
- Paid (official table): Personal 1K **$14/mo** ($120/yr) — 10 pages, 1k checks, every 15 min. Personal 5K **$35** ($300/yr) — 20 pages, 5k, every 5 min. Personal 10K **$70** ($600/yr) — 40 pages, 10k, every 2 min. Business 20K **$140** ($1,200/yr) — 200 pages, 5 users. Business 30K **$210**. 40K **$280**. 50K **$350**. Solutions custom.
- Slack / Teams / Sheets = Business. SMS from Personal 5K.
- Weakness vs Sitemapper: page-metered, not sitemap-declared; no indexability; no GSC.
- Source: https://visualping.io/pricing

#### Distill.io

- Free (homepage): 25 local + 5 cloud monitors, 6-hour cloud interval, 1,000 checks/mo, 30 email alerts.
- Paid (2026 third-party tables, not re-verified on distill.io/pricing in this pass): Starter **$15/mo**, Professional **$35/mo**, Flexi **$80/mo**. Fastest checks cited at 2 minutes. Sitemap crawl via Distill crawler: **alpha, Professional+**.
- Sources: https://distill.io/ · https://distill.io/docs/web-monitor/sitemap-monitor-using-a-crawler/

#### PageCrawl.io

- Official-adjacent 2026 help/blog: Free 6 pages / 2,000 pages per site for sitemap discovery on free (help article) vs 6 pages / 220 checks / hourly (blog) — **figures disagree across PageCrawl pages; treat as inconsistent**.
- Blog table (2026-07-20): Standard **$8/mo or $80/yr** — 100 pages, 15k checks, every 15 min. Enterprise **$30/mo or $300/yr** — 500 pages, 100k, every 5 min. Ultimate **$99/mo or $999/yr** — 1,000 pages, 2-min, Pro AI.
- Sitemap monitoring: detect new/removed URLs and content updates. Available on all plans per help article.
- Sources: https://pagecrawl.io/help/features/article/sitemap-monitoring · https://pagecrawl.io/blog/sitemap-monitoring-track-new-pages-automatically

#### Oh Dear — ohdear.app

- Wedge: uptime + SSL + broken links + Lighthouse + **sitemap monitoring** in one per-site price. Same features every plan.
- Official EUR ex-VAT: Solo 2 sites **€15/mo**; Freelance 10 **€49**; Studio 25 **€99**; Agency 50 **€149**; Agency Plus 75 **€199**; Portfolio 100 **€249**; Portfolio Plus 150 **€329**; Scale 200 **€399**; 200+ custom. Unlimited users, SSO, API on every plan. 30-day money-back.
- Sitemap checks: file available + valid; visit each URL for 2xx/3xx; uniqueness; ≤50k URLs; priority 0–1; valid changefreq; lastmod not in future. Supports indexes + gzip. Limits: first **50** sitemaps in an index; visit only first **5,000** URLs; 20-minute visit cap.
- Weakness: availability validator, not indexability/GSC/deploy intelligence.
- Sources: https://ohdear.app/pricing · https://ohdear.app/docs/features/sitemap-monitoring

#### SEOTesting — seotesting.com

- Wedge: GSC-connected SEO experiments + **sitemap monitor** (own + competitor) + email change summaries. Closest GSC-native cousin.
- Official USD: Single Site **$50/mo** (1 site, unlimited users, 25 IL credits). Medium **$125/mo** (5 sites, 75 credits, 1:1 onboarding). Large **$375/mo** (20 sites, 300 credits, quarterly training). Enterprise custom. 14-day trial; data deleted 7 days after trial if unpaid. No per-seat fee.
- Frequency: daily / weekly / monthly sitemap checks.
- Weakness: priced as a GSC testing suite, not a deploy/indexability monitor. Sitemap monitor is a feature, not the product.
- Sources: https://seotesting.com/home/pricing/ · https://seotesting.com/sitemap-monitoring/

#### Ahrefs Firehose / Website Change Monitor

- Free tool: one URL, last year of text diffs, severity tags, no account.
- Firehose: many URLs, minutes-level, email/Slack/Teams/webhook/API, whole-web queries. Price **unknown** on fetched pages.
- Not sitemap- or index-aware.

**Do not build:** screenshot visual diffs, “watch any competitor page,” or a generic uptime+SSL box.

---

## 3. Compact comparison table

| Product | Entry paid | Free? | Freq | Sitemap depth | Tech audit | History | Notify | GSC | Agency |
|---|---|---|---|---|---|---|---|---|---|
| Sitemap Monitoring | $9 | 14-day trial | daily→hourly | High (indexes, types) | Thin (status/noindex/canon) | 90d URL diffs | Email | No | 50 sites, API @ $79 |
| SitemapFixer | $9–15 | 1 analysis/mo + first check | On-demand; “monitoring” unspecified | Finder + full fetch | Sampled live + AI plan | 7–365d reports | Email/Slack | No | WL + API @ $49–89 |
| Sitemap Explorer | $0 | Yes | None | Visual + index | lastmod only | None | None | No | No |
| Screaming Frog | $279/yr | 500 URLs | Manual / local schedule | Generate + crawl | Deep | Crawl compare | No | Yes | Seats |
| Sitebulb Desktop | $18 / $42 | Trial (unconfirmed length) | Scheduled (Pro) | Via crawl | Deep (300+ hints) | Audit compare | — | Yes | Extra seats |
| Sitebulb Cloud | $125 | No | Recurring | Via crawl | Deep | Audit compare | Slack/WH | Yes | Unlimited projects |
| Ahrefs Site Audit | €119 | Verified-site limited | Schedule + AOA 1/min | Via crawl | 170+ | Daily AOA | Email 30m | Yes | Seats + boosts |
| Semrush Site Audit | $139 | 100 pages/mo | Daily/weekly | One sitemap URL / file | Hundreds + AI | Project trend | Suite | Yes | Sites + WL add-on |
| Seobility | €49.90 | 1 site / 1k pages | Regular crawl + uptime | Via crawl | Broad on-page | Recrawl | Uptime email | No | 15 sites (Agency €?) |
| XML / PRO-Sitemaps | $2.44+ | 500 URLs | Auto-regen (PRO) | Generate/host | Light | Sitemap history | No | No | Multi-site |
| Visualping | $14 | 5 pages / 150 checks | 60m→2m | No | Visual/text | 90d / 1y | Email/API; Slack @ Biz | No | Workspaces |
| Oh Dear | €15 | Trial (implied) | Uptime-class | Validate + hit 5k URLs | Availability | Monitor history | All channels | No | Per-site bundle |
| SEOTesting | $50 | 14-day trial | d/w/m | Add/mod/remove + competitors | Light | GSC tests | Email | **Yes** | Unlimited users |

---

## 4. Official platform docs (current)

### 4.1 Google Search Console API

**Services** (https://developers.google.com/webmaster-tools/v1/api_reference_index):

| Service | What it does | What it does **not** do |
|---|---|---|
| **Sites** | `add` / `delete` / `get` / `list` properties | Does not verify ownership by itself in a magical way — property must be valid for the user |
| **Sitemaps** | `list`, `get`, `submit` (PUT), `delete` | Submit is **not** a crawl or index command |
| **Search Analytics** | `query` clicks/impressions/CTR/position by date, country, device, page, query, etc. | Not live index status |
| **URL Inspection** | `index.inspect` — status of the **already-indexed** version | **Does not request indexing. Does not run a live test.** Official: “Presently only the status of the version in the Google index is available; you cannot test the indexability of a live URL.” |

URL Inspection response (`UrlInspectionResult`) includes: verdict, coverageState, robotsTxtState, indexingState (ALLOWED / BLOCKED_BY_META_TAG / BLOCKED_BY_HTTP_HEADER), lastCrawlTime, pageFetchState, googleCanonical, userCanonical, crawledAs, sitemap[] (sitemaps Google knows listed this URL — **not exhaustive**), referringUrls[], AMP, rich results. Mobile usability field is **deprecated**.

Source: https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect · https://developers.google.com/webmaster-tools/v1/urlInspection.index/UrlInspectionResult

**What URL Inspection actually does**

- **API:** read Google’s *indexed* view of a URL you own. Evidence for INDEXED (or why not), last crawl, canonicals, robots, fetch state, known sitemaps.
- **UI only (not in the API):** Live Test (fetch now), Request indexing, rendered screenshot.
- Request indexing (UI): owner/full user; daily quota; “submitting multiple times won’t get it crawled any faster”; cannot request if live test says non-indexable; queues a crawl, **does not guarantee indexing**.
- “URL is on Google” = *eligible* to appear, **not** a guarantee it ranks or even shows.

Sources: https://support.google.com/webmasters/answer/9012289 · https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl

**Does sitemap submit guarantee indexing?**  
**No.** Google: “submitting a sitemap is merely a hint: it doesn’t guarantee that Google will download the sitemap or use the sitemap for crawling URLs on the site.” Same for URL Inspection “Request indexing.”

Source: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap

**Implication for Sitemapper:** GSC is the INDEXED evidence layer. Budget URL Inspection API calls as an **expensive deep check**. Never tell users “we submitted so it will be indexed.” Use Search Analytics to attach clicks/impressions to declared URLs after changes.

---

### 4.2 IndexNow

Spec: https://www.indexnow.org/documentation

- **Single URL:** `GET https://<searchengine>/indexnow?url=<url-escaped>&key=<key>`
- **Batch:** `POST /indexnow` JSON `{ host, key, urlList[], keyLocation? }` — **up to 10,000 URLs per POST**. http/https may be mixed.
- **Key:** 8–128 chars; `[A-Za-z0-9-]`.
- **Ownership:**  
  - Option 1 (recommended): `https://host/{key}.txt` at site root containing the key.  
  - Option 2: key file elsewhere + `keyLocation`; only URLs under that path prefix are valid.
- **Responses:** 200 received; **202 accepted, key validation pending**; 400 bad format; 403 key invalid; 422 URL/host/key schema mismatch; 429 too many (spam).
- **200 means received, not indexed.** Partners share submitted URLs with other participating engines.
- Google is **not** an IndexNow participant. Useful for Bing/Yep/Ahrefs/etc., complementary to GSC, not a substitute.

**Implication:** IndexNow is a cheap CHANGED→notify-engines action, not a paid feature to over-sell. Key verification is a one-time host setup Sitemapper can guide.

---

### 4.3 Google sitemap protocol / current limits

Canonical protocol: https://www.sitemaps.org/protocol.html  
Google’s overlay: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap · https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps

| Rule | Current value |
|---|---|
| Max URLs per sitemap | **50,000** |
| Max size | **50 MB uncompressed** (52,428,800 bytes). gzip allowed; uncompressed must still be ≤50 MB |
| Encoding | UTF-8; entity-escape `& ' " > <`; absolute URLs; loc < 2,048 chars |
| Sitemap index | Same 50k / 50 MB limits; up to **50,000** child sitemaps; Google allows **500 sitemap index files per site** in Search Console |
| lastmod | W3C Datetime; **must be the page’s last meaningful modification, not sitemap generation time**. Google **uses lastmod only if consistently and verifiably accurate** (e.g. matches real page modification). Future lastmod is invalid (Oh Dear flags this). |
| changefreq / priority | Protocol optional. **Google ignores both.** |
| Formats Google accepts | XML (plus image/video/news/hreflang extensions), RSS 2.0 / Atom 1.0, TXT (one URL/line) |
| Submit paths | GSC UI, GSC API `sitemaps.submit`, or `Sitemap:` in robots.txt (no limit on robots.txt sitemap lines) |
| Cross-submit | Allowed if all properties are verified |

**Implication:** lastmod trust scoring is a Sitemapper differentiator (DECLARED lastmod vs LIVE `Last-Modified` / content hash / meaningful change). Do not rank URLs by `<priority>`.

---

### 4.4 Stripe Checkout + Billing Portal + webhooks (current)

Sources: https://docs.stripe.com/payments/checkout/how-checkout-works · https://docs.stripe.com/customer-management/integrate-customer-portal · https://docs.stripe.com/billing/subscriptions/webhooks · https://docs.stripe.com/billing/subscriptions/overview

**Checkout Sessions**

1. Server creates a Session (`POST /v1/checkout/sessions`) with `mode=subscription` (or `payment`), `line_items[]` (Price IDs), `success_url`.
2. Redirect to Session `url` (hosted) or embed.
3. Customer pays; Stripe saves PM by default in subscription mode.
4. **Do not provision on redirect.** Provision on webhooks.

**Customer / Billing Portal**

- Configure features in Dashboard (or `POST /v1/billing_portal/configurations`).
- Per visit: `POST /v1/billing_portal/sessions` with `customer` (or Accounts v2 `customer_account`) + `return_url`.
- Customer can update tax ID, payment method, plan, cancel — if you enabled those.
- If upgrades/downgrades are allowed, you **must** set a product catalog of allowed Prices.

**Subscription lifecycle — handle these events**

| Event | Use |
|---|---|
| `checkout.session.completed` | Attach metadata; **not** sufficient alone to grant access |
| `customer.subscription.created` | May be `incomplete` if auth required |
| `customer.subscription.updated` | Plan/qty/cancel-at-period-end/reactivate |
| `customer.subscription.deleted` | Revoke access |
| `customer.subscription.paused` / `.resumed` / `.trial_will_end` | Trial/pause UX |
| `invoice.paid` | **Primary “access on” signal** when subscription is `active` |
| `invoice.payment_failed` | Dunning; first invoice keeps `incomplete` |
| `invoice.payment_action_required` | Customer authentication (SCA) |
| `invoice.upcoming` | Renewal notice window (Dashboard setting) |
| `customer.updated` / `payment_method.attached|detached` | Default PM changes from portal |
| `entitlements.active_entitlement_summary.updated` | If using Stripe Entitlements |

Verify webhook signatures. Register the endpoint in Workbench. Never trust the success URL.

**Implication for Sitemapper:** map Builder/Pro/Agency to Stripe Prices; meter URL + deep-check overage via metered Prices or entitlements; let Billing Portal handle cancel/upgrade so you don’t build billing UI.

---

## 5. Features Sitemapper should deliberately **not** build

These are either owned by incumbents, commodity, or off-strategy:

1. **A $9 daily sitemap add/remove email** — that *is* Sitemap Monitoring. Clone = price war.
2. **Full technical crawler / 170–300 hints / JS rendering at crawl scale** — Screaming Frog, Sitebulb, Ahrefs, Semrush.
3. **Keyword research, rank tracking, backlink index, content TF*IDF, AI writers** — suite tax you cannot win.
4. **AI visibility / Brand Radar / prompt tracking / social posting**.
5. **Cloud sitemap generation + hosting** — XML-Sitemaps / PRO-Sitemaps + every CMS.
6. **Visual IA/UX sitemap builders** — Miro, Octopus.do, FlowMapp, Canva.
7. **Screenshot / visual regression as the product** — Visualping, Distill.
8. **Generic uptime + SSL + DNS + cron** — Oh Dear, every status-page vendor.
9. **Ahrefs-style Patches (auto-edit customer HTML)**.
10. **Nine SEO-keyword free tools as the company** — SitemapFixer’s acquisition trick, not a moat. Ship **one** free finder/validator.
11. **Priority/changefreq scoring** — Google ignores them.
12. **“Submit to Google = indexed” buttons** — factually false; damages trust.
13. **IndexNow as a paid SKU** — it’s a simple POST. Bundle it.
14. **Live GSC URL Inspection for every URL every hour** — quota + cost. Meter it.
15. **Per-seat pricing** — every specialist tool in this niche advertises unlimited users. Don’t be Semrush/Ahrefs here.

---

## 6. Where Sitemapper should win

Own the loop the others only touch one node of:

```
DECLARED          LIVE                 INDEXED                 CHANGED
sitemap + robots  HTTP + canonical +   GSC URL Inspection +    lastmod vs hash vs
+ lastmod trust   noindex + render     Search Analytics        deploy timestamp
                  sample / full
```

Differentiation vs each cluster:

| They do | You do |
|---|---|
| Sitemap Monitoring: URL set diffs | Set diffs **plus** lastmod-trust, live reconciliation, GSC coverage, deploy windows |
| SitemapFixer: one-shot AI plan | Continuous evidence; AI optional, never the source of truth |
| SF / Sitebulb / Semrush: periodic crawl | Always-on declaration watch; crawlers remain complementary |
| Ahrefs AOA: slow whole-site recrawl | Sitemap-prioritized + deploy-triggered deep checks |
| SEOTesting: GSC tests + sitemap add/remove | Indexability + deploy regression as the product, not a feature |
| Visualping: page pixels | Semantic SEO change (indexability, canonical, content-hash of declared URLs) |
| Oh Dear: 2xx on first 5k URLs | Why a 200 is still non-indexable / not indexed |

Product narrative for agencies: “When traffic drops after a Friday deploy, show the timestamped DECLARED/LIVE/INDEXED diff — not a monthly Site Audit PDF.”

---

## 7. Recommended launch pricing

Market anchors:

- Specialist sitemap monitor: **$9 / $29 / $79** (Sitemap Monitoring)
- Diagnostic AI checker: **$9–19 / $19–35 / $49–89** (SitemapFixer annual vs monthly)
- GSC change suite: **$50 / $125 / $375** (SEOTesting)
- Desktop crawler: **$18–42/mo** or **$279/yr**
- Cloud crawler: **$125+**
- Suites: **$139–€119** entry

Proposed Sitemapper ladder (confirm):

| Plan | Price | Role | Suggested meters |
|---|---|---|---|
| **Free** | $0 | Acquisition wedge | 1 site, ~500 monitored URLs, daily DECLARED diffs, free sitemap finder + validator, 7-day history, email digest. **No** GSC. **No** live full-pass. Optional: 25 live URL checks / day. |
| **Builder** | **$19/mo** | Indie / single site that needs evidence | 1–2 sites, **5,000 monitored URLs**, 6-hourly, 30-day diffs, email + Slack, lastmod-trust, live reconciliation on changed + sampled URLs, 1k cheap live checks / mo included. |
| **Pro** | **$49/mo** | In-house SEO / consultant | 5 sites, **25,000 monitored URLs**, hourly on declared file + 15-min on changed subset after deploy hook, 90-day history, GSC connect (Search Analytics + **metered** URL Inspection), IndexNow helper, deploy markers (Vercel/Netlify/GitHub webhook), content-hash diffs on declared URLs, CSV. Deep-check pack: e.g. 500 URL Inspection + 10k live indexability checks / mo. |
| **Agency** | **$149/mo** | Multi-client | 25 sites, **100,000 monitored URLs**, 1-year history, API, white-label PDF, unlimited seats, priority queue, more deep-check quota (e.g. 2,500 inspections + 50k live checks). Extra URL packs + extra deep-check packs as metered add-ons. |

**Meter monitored URLs + expensive deep checks, not domains alone.**

Why this works:

- **$19** sits above Sitemap Monitoring Starter ($9) and SitemapFixer annual Starter ($9) because you sell *intelligence*, not a ping — and under Sitebulb Lite ($18) / SEOTesting ($50) / every suite.
- **$49** matches SitemapFixer Agency annual and undercuts SEOTesting Medium and every suite, with a story those products lack (deploy + GSC evidence).
- **$149** is 1.9× Sitemap Monitoring Agency and ~Oh Dear Agency site-count money, but aimed at SEO agencies who already pay $125 for Sitebulb Cloud Mini or $125 for SEOTesting Medium for a *different* job.
- Annual: 2 months free (same signal as Sitemap Monitoring) or 20% off.

Overage (do not hide):

- Monitored URL pack: e.g. +$10 / 10k URLs.
- Deep checks: URL Inspection, JS-rendered indexability, full-body hash, screenshot *optional later*. Hard-stop with a warning, never silent truncation without telling the user (Sitemap Monitoring’s good pattern).

Free-tool wedge (build only these):

1. Sitemap finder + protocol validator (limits, gzip, lastmod sanity, index recursion).
2. One-shot DECLARED vs LIVE sample (30–100 URLs) with a “start monitoring” CTA.

Do **not** SEO-spam nine tools.

---

## 8. Launch positioning copy (not a clone)

**Category:** Indexability & Website Change Intelligence  
**One-liner:** Know what you declared, what’s actually live, what Google indexed, and what changed after the last deploy.  
**Anti-positioning:** Not a crawler. Not a sitemap ping. Not an SEO suite.

Primary buyers: technical SEOs and agency leads who already have SF/Ahrefs/GSC and still get surprised after deploys. Secondary: indie SaaS/docs sites who cannot justify $139/mo Semrush.

---

## 9. Source list

### Products
- https://sitemapmonitoring.com/
- https://sitemapmonitoring.com/pricing
- https://sitemapfixer.com/
- https://sitemapfixer.com/pricing
- https://fazier.com/launches/sitemapfixer
- https://sitemapexplorer.com/
- https://www.screamingfrog.co.uk/seo-spider/pricing/
- https://www.screamingfrog.co.uk/seo-spider/
- https://sitebulb.com/subscriptions/pricing/index
- https://sitebulb.com/subscriptions/pricing/server/
- https://sitebulb.com/cloud/
- https://ahrefs.com/pricing
- https://ahrefs.com/blog/always-on-audit/
- https://ahrefs.com/site-audit
- https://ahrefs.com/free
- https://ahrefs.com/website-change-monitor
- https://ahrefs.com/index-now
- https://www.semrush.com/pricing/seo-ai-search/
- https://www.semrush.com/siteaudit/
- https://www.semrush.com/kb/539-configuring-site-audit
- https://www.semrush.com/blog/seo-audit-tools/
- https://www.seobility.net/en/pricing/
- https://www.seobility.net/en/seocheck/
- https://www.xml-sitemaps.com/
- https://pro-sitemaps.com/docs/pricing/
- https://seomator.com/sitemap-finder
- https://visualping.io/pricing
- https://distill.io/
- https://pagecrawl.io/help/features/article/sitemap-monitoring
- https://ohdear.app/pricing
- https://ohdear.app/docs/features/sitemap-monitoring
- https://seotesting.com/home/pricing/
- https://seotesting.com/sitemap-monitoring/

### Official docs
- https://developers.google.com/webmaster-tools/v1/api_reference_index
- https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect
- https://developers.google.com/webmaster-tools/v1/urlInspection.index/UrlInspectionResult
- https://support.google.com/webmasters/answer/9012289
- https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps
- https://www.sitemaps.org/protocol.html
- https://www.indexnow.org/documentation
- https://docs.stripe.com/payments/checkout/how-checkout-works
- https://docs.stripe.com/customer-management/integrate-customer-portal
- https://docs.stripe.com/billing/subscriptions/webhooks
- https://docs.stripe.com/billing/subscriptions/overview

### Third-party listings used only when official HTML hid numbers
- Sitebulb desktop $18/$42: G2/Capterra 2026 listings + search snippet of official desktop pricing page
- Seobility Agency €179.90: 2026 reviews citing official page (raw Agency price not in HTML scrape)
- Ahrefs older USD plan names: third-party reviews; **not used as current official**
- PRO-Sitemaps full URL grid: 2026 reviews of pro-sitemaps.com/docs/pricing/

---

*End of report. Research pass 2026-08-18. No memory used.*
