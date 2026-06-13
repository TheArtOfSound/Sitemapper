import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAudit } from './audit.js';
import { installFakeFetch } from '../test/fakeFetch.js';
import type { SitemapperOptions } from '../types.js';

afterEach(() => vi.unstubAllGlobals());

const SITE = 'https://site.test';
const GOOD_TITLE = 'A Perfectly Reasonable Title';
const GOOD_DESC = 'This description sits comfortably within the recommended length window for search engines.';

function options(overrides: Partial<SitemapperOptions> = {}): SitemapperOptions {
  return { site: SITE, outDir: 'out', maxPages: 500, concurrency: 4, fetchTimeoutMs: 5000, includeDescriptions: true, ...overrides };
}

function pageHtml(opts: { title?: string | null; desc?: string | null; canonical?: string; noindex?: boolean } = {}): string {
  const title = opts.title === null ? '' : `<title>${opts.title ?? GOOD_TITLE}</title>`;
  const desc = opts.desc === null ? '' : `<meta name="description" content="${opts.desc ?? GOOD_DESC}">`;
  const canonical = opts.canonical ? `<link rel="canonical" href="${opts.canonical}">` : '';
  const robots = opts.noindex ? '<meta name="robots" content="noindex">' : '';
  return `<!doctype html><html><head>${title}${desc}${canonical}${robots}</head><body>ok</body></html>`;
}

describe('runAudit — full pipeline', () => {
  it('exercises discovery, sitemap parsing, every page check, dedupe, scoring and stats at once', async () => {
    installFakeFetch({
      'https://site.test/robots.txt': { body: 'User-agent: *\nSitemap: https://site.test/sitemap.xml\n' },
      'https://site.test/sitemap.xml': {
        body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://site.test/</loc><lastmod>2026-06-01</lastmod></url>
          <url><loc>https://site.test/about</loc><lastmod>2026-06-01</lastmod></url>
          <url><loc>https://site.test/no-title</loc><lastmod>2026-06-01</lastmod></url>
          <url><loc>https://site.test/dupe-a</loc><lastmod>2026-06-01</lastmod></url>
          <url><loc>https://site.test/dupe-b</loc><lastmod>2026-06-01</lastmod></url>
          <url><loc>https://site.test/gone</loc><lastmod>2026-06-01</lastmod></url>
          <url><loc>https://site.test/noindexed</loc><lastmod>2026-06-01</lastmod></url>
          <url><loc>https://site.test/no-lastmod</loc></url>
        </urlset>`
      },
      'https://site.test/': { body: pageHtml() },
      'https://site.test/about': { body: pageHtml() },
      'https://site.test/no-title': { body: pageHtml({ title: null }) },
      'https://site.test/dupe-a': { body: pageHtml({ title: 'Identical Title Here' }) },
      'https://site.test/dupe-b': { body: pageHtml({ title: 'Identical Title Here' }) },
      'https://site.test/gone': { status: 404, body: 'gone' },
      'https://site.test/noindexed': { body: pageHtml({ noindex: true }) },
      'https://site.test/no-lastmod': { body: pageHtml() }
    });

    const result = await runAudit(options());
    const allCodes = [...result.issues, ...result.pages.flatMap((p) => p.issues)].map((i) => i.code);

    expect(result.source.discoveredFromRobots).toBe(true);
    expect(result.pages).toHaveLength(8);
    expect(allCodes).toEqual(
      expect.arrayContaining(['MISSING_TITLE', 'DUPLICATE_TITLE', 'BAD_STATUS', 'NOINDEX_IN_SITEMAP', 'MISSING_LASTMOD'])
    );
    expect(result.stats.errors).toBeGreaterThanOrEqual(2); // BAD_STATUS + NOINDEX_IN_SITEMAP
    expect(result.stats.pages).toBe(8);
    expect(result.scores.seo).toBeLessThan(100);
    expect(result.scores.index).toBeGreaterThan(0);
    expect(result.scores.sitemap).toBeGreaterThan(0);
  });

  it('flags a thin (single-URL) sitemap and a robots.txt with no sitemap reference', async () => {
    installFakeFetch({
      'https://thin.test/robots.txt': { body: 'User-agent: *\nDisallow:\n' },
      'https://thin.test/sitemap.xml': {
        body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://thin.test/</loc></url></urlset>`
      },
      'https://thin.test/': { body: pageHtml() }
    });

    const result = await runAudit(options({ site: 'https://thin.test' }));
    const rootCodes = result.issues.map((i) => i.code);
    expect(rootCodes).toContain('ROBOTS_NO_SITEMAP_REFERENCE');
    expect(rootCodes).toContain('SINGLE_URL_SITEMAP');
  });
});
