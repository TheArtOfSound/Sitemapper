export type IssueDoc = {
  code: string;
  title: string;
  severity: 'error' | 'warning' | 'notice';
  meaning: string;
  why: string;
  example: string;
  detect: string;
  verify: string;
  fix: string;
  official?: string;
};

export const ISSUE_CATALOG: IssueDoc[] = [
  {
    code: 'NOINDEX_IN_SITEMAP',
    title: 'noindex URL listed in the sitemap',
    severity: 'error',
    meaning: 'A URL is advertised in the sitemap while the page (or header) tells crawlers not to index it.',
    why: 'Sitemaps should list URLs you want discovered. Mixing noindex with sitemap inclusion wastes crawl budget and sends mixed signals.',
    example: 'https://example.com/thank-you is in sitemap.xml and contains <meta name="robots" content="noindex">.',
    detect: 'Sitemapper fetches the live page and looks for a robots meta or X-Robots-Tag noindex directive.',
    verify: 'Open the URL, view source, and check meta robots plus response headers. Confirm the URL is still in the sitemap.',
    fix: 'Remove the URL from the sitemap, or remove noindex if the page should be indexed. Do not leave both.',
    official: 'https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap',
  },
  {
    code: 'ROBOTS_DISALLOWED_IN_SITEMAP',
    title: 'robots.txt blocks a sitemap URL',
    severity: 'warning',
    meaning: 'The sitemap lists a URL that robots.txt disallows.',
    why: 'Google may still index a blocked URL if it is linked elsewhere, but it cannot fetch it. Advertising a blocked URL in a sitemap is a conflict.',
    example: 'Disallow: /admin/ while https://example.com/admin/dashboard appears in sitemap.xml.',
    detect: 'Sitemapper parses robots.txt with Google-style longest-match rules and tests each sitemap path.',
    verify: 'Use Google’s robots.txt tester or curl the path with a Googlebot user-agent after checking Disallow/Allow.',
    fix: 'Either allow the path or remove it from the sitemap.',
    official: 'https://developers.google.com/search/docs/crawling-indexing/robots/intro',
  },
  {
    code: 'CANONICAL_MISMATCH',
    title: 'Canonical points at a different URL',
    severity: 'notice',
    meaning: 'The page’s canonical is not the sitemap URL (or the post-redirect URL).',
    why: 'A mismatch can consolidate ranking signals onto another URL, or fight the sitemap hint.',
    example: 'Sitemap lists /pricing while the page canonicalizes to /plans.',
    detect: 'Deep-checked pages compare link rel=canonical against the sitemap URL and the final fetched URL.',
    verify: 'View source and compare the canonical href with the address bar after redirects.',
    fix: 'Make the canonical self-referencing, or list the canonical URL in the sitemap instead.',
    official: 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls',
  },
  {
    code: 'CANONICAL_CROSS_HOST',
    title: 'Canonical points at another host',
    severity: 'warning',
    meaning: 'The canonical href is on a different hostname than the sitemap URL.',
    why: 'Cross-host canonicals can donate indexing to another property. Sometimes that is intentional (www vs apex); often it is a staging leak.',
    example: 'Production page canonicalizes to https://staging.example.com/pricing.',
    detect: 'Sitemapper resolves the canonical against the page URL and compares hostnames.',
    verify: 'Check the canonical tag and any CMS canonical override / CDN host rewrite.',
    fix: 'Point canonicals at the intended production host. Keep staging out of production sitemaps.',
    official: 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls',
  },
  {
    code: 'SITEMAP_FETCH_FAILED',
    title: 'Sitemap could not be fetched',
    severity: 'error',
    meaning: 'A sitemap URL returned an error or could not be loaded.',
    why: 'Search engines treat sitemaps as hints. If the file is down, newly added URLs may be discovered later — or not at all.',
    example: 'https://example.com/sitemap.xml returns HTTP 404.',
    detect: 'Sitemapper requests each discovered sitemap and records non-success responses.',
    verify: 'curl -I the sitemap URL. Check robots.txt Sitemap: lines.',
    fix: 'Restore the sitemap at a stable URL and keep robots.txt in sync.',
    official: 'https://www.sitemaps.org/protocol.html',
  },
  {
    code: 'NO_ACCESSIBLE_SITEMAP',
    title: 'No accessible XML sitemap',
    severity: 'error',
    meaning: 'No sitemap could be loaded from robots.txt or common fallback paths.',
    why: 'Without a sitemap, crawlers rely only on links. Large or JS-heavy sites often under-discover URLs.',
    example: 'robots.txt has no Sitemap: line and /sitemap.xml 404s.',
    detect: 'Discovery tries robots.txt Sitemap directives, then common paths including sitemap_index.xml and wp-sitemap.xml.',
    verify: 'Open /robots.txt and try /sitemap.xml in a browser.',
    fix: 'Publish an XML sitemap (or sitemap index) and reference it from robots.txt.',
    official: 'https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap',
  },
  {
    code: 'REDIRECT_LOOP',
    title: 'Redirect loop',
    severity: 'error',
    meaning: 'Following the sitemap URL never reaches a terminal response.',
    why: 'Crawlers stop. The URL will not be indexed in a useful form.',
    example: '/a 301 → /b 301 → /a.',
    detect: 'Sitemapper follows redirects hop-by-hop and records a loop when a URL repeats.',
    verify: 'curl -I --max-redirs 0 each hop.',
    fix: 'Break the cycle. Sitemap URLs should be the canonical, non-redirecting form when possible.',
  },
  {
    code: 'MISSING_LASTMOD',
    title: 'Sitemap entry missing lastmod',
    severity: 'warning',
    meaning: 'The <url> entry has no <lastmod>.',
    why: 'lastmod is optional, but a reliable lastmod helps crawlers prioritize recrawls. Fake lastmod values are worse than missing ones.',
    example: '<url><loc>https://example.com/post</loc></url>',
    detect: 'Each sitemap entry is checked for a lastmod value.',
    verify: 'Inspect the raw sitemap XML around the loc.',
    fix: 'Emit a real lastmod from the content’s modified time. Do not stamp every URL with the same deploy clock unless that is truthful.',
    official: 'https://www.sitemaps.org/protocol.html#lastmoddef',
  },
  {
    code: 'DUPLICATE_TITLE',
    title: 'Duplicate title',
    severity: 'warning',
    meaning: 'Two or more deep-checked pages share the same title.',
    why: 'Duplicate titles make SERP snippets interchangeable and often signal templating bugs.',
    example: 'Every category page titled “Products | Example”.',
    detect: 'Sitemapper groups deep-checked titles case-insensitively.',
    verify: 'Search the HTML reports or export CSV and pivot on title.',
    fix: 'Make titles unique and descriptive. Keep templates from collapsing to a site-wide default.',
  },
  {
    code: 'THIN_SITEMAP',
    title: 'Thin sitemap inventory',
    severity: 'warning',
    meaning: 'The sitemap exposes only a handful of URLs.',
    why: 'A one-page sitemap is fine for a one-page site. It is a bug for a catalog, docs site, or blog.',
    example: 'A 400-URL docs site whose sitemap only lists the homepage.',
    detect: 'Inventory size after same-host extraction is compared against thin thresholds.',
    verify: 'Compare sitemap URL count with the real public navigation.',
    fix: 'Generate the sitemap from the actual public route table, not a hardcoded homepage.',
  },
  {
    code: 'BAD_STATUS',
    title: 'Sitemap URL returns an HTTP error',
    severity: 'error',
    meaning: 'The live page returned 4xx or 5xx.',
    why: 'Advertising a broken URL in a sitemap asks crawlers to fetch a failure.',
    example: 'Product URL in the sitemap now 404s after a catalog prune.',
    detect: 'Deep-checked URLs record the terminal HTTP status.',
    verify: 'curl -I the URL. Check CDN/WAF blocks that look like 403/429.',
    fix: 'Remove dead URLs from the sitemap, or restore the page. Prefer 301 to a replacement over a soft 404.',
  },
];

export function issueDoc(code: string): IssueDoc | undefined {
  return ISSUE_CATALOG.find((row) => row.code === code);
}

export function issuePath(code: string): string {
  return `/issues/${code.toLowerCase().replace(/_/g, '-')}`;
}
