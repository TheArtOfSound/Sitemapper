import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverSitemaps } from './discover.js';
import { installFakeFetch } from '../test/fakeFetch.js';

afterEach(() => vi.unstubAllGlobals());

describe('discoverSitemaps', () => {
  it('extracts Sitemap: directives from robots.txt', async () => {
    installFakeFetch({
      'https://example.com/robots.txt': { body: 'User-agent: *\nDisallow:\nSitemap: https://example.com/custom.xml\n' }
    });
    const source = await discoverSitemaps('https://example.com', 5000);
    expect(source.sitemapUrls).toEqual(['https://example.com/custom.xml']);
    expect(source.discoveredFromRobots).toBe(true);
  });

  it('falls back to /sitemap.xml when robots.txt has no Sitemap directive', async () => {
    installFakeFetch({ 'https://example.com/robots.txt': { body: 'User-agent: *\nDisallow: /private\n' } });
    const source = await discoverSitemaps('https://example.com', 5000);
    expect(source.sitemapUrls).toEqual(['https://example.com/sitemap.xml']);
    expect(source.discoveredFromRobots).toBe(false);
  });

  it('ignores non-XML Sitemap directives such as llms.txt', async () => {
    installFakeFetch({ 'https://example.com/robots.txt': { body: 'Sitemap: https://example.com/llms.txt\n' } });
    const source = await discoverSitemaps('https://example.com', 5000);
    expect(source.discoveredFromRobots).toBe(false);
    expect(source.sitemapUrls).toEqual(['https://example.com/sitemap.xml']);
  });

  it('falls back when robots.txt cannot be fetched at all', async () => {
    installFakeFetch({ 'https://example.com/robots.txt': { throws: true } });
    const source = await discoverSitemaps('https://example.com', 5000);
    expect(source.discoveredFromRobots).toBe(false);
    expect(source.sitemapUrls).toEqual(['https://example.com/sitemap.xml']);
  });
});
