# Sitemapper

> Make your sitemap useful to humans, not just crawlers.

Sitemapper is an open-source TypeScript CLI that turns `sitemap.xml` into a public, searchable site index and adds practical SEO/crawlability checks for every listed page.

It is built for indie builders, documentation sites, content networks, local businesses, and multi-domain projects that need a clean public index plus a fast way to spot obvious SEO hygiene problems.

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

## Scores

Sitemapper reports three separate scores instead of one fake magic SEO score:

```txt
Index Score    public index usefulness
SEO Score      basic metadata and crawlability health
Sitemap Score  sitemap/source health
```

## Design principles

- Public index first, SEO tooling second.
- Static output only for v0.1.
- No accounts.
- No SaaS backend.
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
v1.0  Stable CLI, docs, examples, npm release
```

## Example output

```txt
Sitemapper
Site: https://example.com
Pages: 428
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
