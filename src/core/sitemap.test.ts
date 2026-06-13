import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSitemapEntries } from './sitemap.js';
import { installFakeFetch } from '../test/fakeFetch.js';

afterEach(() => vi.unstubAllGlobals());

const SITE = 'https://example.com';

function urlset(urls: Array<{ loc: string; lastmod?: string }>): string {
  const body = urls
    .map((u) => `<url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

describe('loadSitemapEntries', () => {
  it('parses a urlset, keeps same-host URLs, drops cross-host, extracts lastmod', async () => {
    installFakeFetch({
      'https://example.com/sitemap.xml': {
        body: urlset([
          { loc: 'https://example.com/a', lastmod: '2026-01-01' },
          { loc: 'https://example.com/b' },
          { loc: 'https://other.com/x' }
        ])
      }
    });
    const result = await loadSitemapEntries(SITE, ['https://example.com/sitemap.xml'], 5000);
    const urls = result.entries.map((e) => e.url);
    expect(urls).toContain('https://example.com/a');
    expect(urls).toContain('https://example.com/b');
    expect(urls).not.toContain('https://other.com/x');
    expect(result.entries.find((e) => e.url === 'https://example.com/a')?.lastmod).toBe('2026-01-01');
    expect(result.loadedSitemaps).toContain('https://example.com/sitemap.xml');
  });

  it('follows a sitemap index to its child sitemaps', async () => {
    installFakeFetch({
      'https://example.com/sitemap_index.xml': {
        body: `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://example.com/child.xml</loc></sitemap></sitemapindex>`
      },
      'https://example.com/child.xml': { body: urlset([{ loc: 'https://example.com/deep' }]) }
    });
    const result = await loadSitemapEntries(SITE, ['https://example.com/sitemap_index.xml'], 5000);
    expect(result.entries.map((e) => e.url)).toContain('https://example.com/deep');
    expect(result.loadedSitemaps).toEqual(
      expect.arrayContaining(['https://example.com/sitemap_index.xml', 'https://example.com/child.xml'])
    );
  });

  it('recovers page URLs from <loc> tags even when the XML is malformed', async () => {
    installFakeFetch({
      'https://example.com/sitemap.xml': {
        body: `<urlset><url><loc>https://example.com/recovered</loc></url><url><loc>https://example.com/recovered-2</loc>`
      }
    });
    const result = await loadSitemapEntries(SITE, ['https://example.com/sitemap.xml'], 5000);
    expect(result.entries.map((e) => e.url)).toEqual(
      expect.arrayContaining(['https://example.com/recovered', 'https://example.com/recovered-2'])
    );
  });

  it('records sitemaps that fail to load', async () => {
    installFakeFetch({ 'https://example.com/sitemap.xml': { status: 500, body: 'error' } });
    const result = await loadSitemapEntries(SITE, ['https://example.com/sitemap.xml'], 5000);
    expect(result.failedSitemaps).toContain('https://example.com/sitemap.xml');
    expect(result.entries).toEqual([]);
  });
});
