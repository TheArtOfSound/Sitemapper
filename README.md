# Sitemapper

> Make your sitemap useful to humans, not just crawlers.

Sitemapper turns public `robots.txt` and sitemap files into a readable site inventory, searchable index, and practical SEO/crawlability report.

It is built for indie builders, documentation sites, content networks, local businesses, agencies, and multi-domain operators that need to answer a simple question quickly:

```txt
What public URLs does this site expose, and what obvious SEO/crawlability problems are visible from the sitemap?
```

## Live Worker preview

The Cloudflare Worker version is a fast public preview, not a full background crawler. It is intentionally capped so large sites do not crash the Worker runtime.

```txt
Live Worker report = fast sitemap inventory preview + sampled page checks
CLI build/export   = fuller local crawl/export workflow
Future queue mode  = large-site background jobs and full exports
```

Use the live Worker for quick checks, demos, and shareable reports. Use the CLI for heavier local analysis.

## Use cases

### 1. Public site inventory

Turn a sitemap into a human-readable URL inventory so a founder, marketer, developer, or SEO specialist can see what a site is actually exposing.

### 2. SEO handoff report

Generate a report that can be sent to a client, teammate, or contractor showing missing titles, missing descriptions, missing canonicals, bad statuses, noindex conflicts, and missing `lastmod` values.

### 3. Thin sitemap detection

Quickly catch sites where `sitemap.xml` only exposes the homepage or a tiny subset of the real public pages.

### 4. Content network auditing

Review large news, blog, documentation, or directory sites by indexing sitemap URLs and sampling pages for metadata health.

### 5. Multi-project hygiene checks

Use it across many domains to find which projects have broken sitemap generation, shallow indexes, missing metadata, or crawler-facing issues.

### 6. AI-readable site map

Produce structured JSON and CSV outputs that AI agents, crawlers, scripts, and internal tools can use without scraping the whole site blindly.

### 7. Pre-launch QA

Before sharing a project publicly, verify that the sitemap exists, the public pages are listed, metadata exists, canonicals are present, and broken URLs are not being advertised to crawlers.

## What it generates

```txt
site-index/
  index.html        # public searchable site index
  index.json        # structured machine-readable index
  seo-report.json   # same data, named for SEO workflows
  pages.csv         # spreadsheet-friendly export
```

The generated `index.html` is static. No database, backend, login, or hosted service is required.

## Install

```bash
npm install
npm run build
```

When published to npm, usage will be:

```bash
npx sitemapper build https://example.com
```

For local development:

```bash
npm run dev -- build https://example.com --out site-index
```

Open the generated page:

```bash
open site-index/index.html
```

## CLI

```bash
sitemapper build <site>
```

Options:

```txt
-o, --out <dir>          Output directory. Default: site-index
--max-pages <number>    Maximum sitemap pages to fetch and inspect. Default: 500
--concurrency <number>  Concurrent page fetches. Default: 8
--timeout <ms>          Fetch timeout in milliseconds. Default: 12000
```

`audit` is currently an alias for `build`:

```bash
sitemapper audit https://example.com --out site-index
```

## Checks included in v0.1

Sitemapper reads `robots.txt`, discovers `Sitemap:` entries, falls back to `/sitemap.xml`, supports sitemap indexes, fetches listed pages, and checks for:

- missing page titles
- very short or long titles
- missing meta descriptions
- very short or long meta descriptions
- missing canonical links
- sitemap URLs that redirect
- sitemap URLs returning bad HTTP status codes
- `noindex` pages listed in the sitemap
- missing `lastmod` values
- duplicate titles
- duplicate meta descriptions
- `robots.txt` with no sitemap reference
- failed sitemap fetches
- single-page or thin sitemap inventories
- sitemap files that load but expose no usable same-host URLs

## Scores

Sitemapper reports three separate scores instead of one fake magic SEO score:

```txt
Index Score    public index usefulness and sitemap depth
SEO Score      basic metadata and crawlability health
Sitemap Score  sitemap/source health and freshness signals
```

A site can have strong page metadata but a weak sitemap. For example, a one-page sitemap with a healthy homepage should not score like a complete multi-page site.

## Design principles

- Public index first, SEO tooling second.
- Static output for the CLI workflow.
- Fast preview mode for the hosted Worker.
- No accounts.
- No SaaS lock-in.
- No AI-generated SEO fluff.
- No keyword-ranking promises.
- Useful files people can deploy, inspect, and automate.

## Roadmap

```txt
v0.1  Sitemap to public searchable index + basic SEO checks
v0.2  Better robots.txt conflict detection
v0.3  Redirect chain reporting
v0.4  Canonical target validation
v0.5  GitHub Action mode
v0.6  Compare two crawls over time
v0.7  Multi-domain index mode
v0.8  Worker queue mode for full large-site exports
v1.0  Stable CLI, docs, examples, npm release
```

## Example output

```txt
Sitemapper
Site: https://example.com
Pages indexed: 428
Pages deep checked: 80
Sections: 12
Errors: 4
Warnings: 38
Notices: 91

Scores
Index: 84/100
SEO: 71/100
Sitemap: 92/100

Output
✓ site-index/index.html
✓ site-index/index.json
✓ site-index/seo-report.json
✓ site-index/pages.csv
```

## License

MIT
