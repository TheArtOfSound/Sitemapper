import { describe, expect, it } from 'vitest';
import { renderCsv } from './csv.js';
import { renderJson } from './json.js';
import { renderHtml } from './html.js';
import type { SitemapperResult } from '../types.js';

const result: SitemapperResult = {
  site: 'https://example.com',
  generatedAt: '2026-06-13T00:00:00.000Z',
  source: {
    robotsUrl: 'https://example.com/robots.txt',
    sitemapUrls: ['https://example.com/sitemap.xml'],
    discoveredFromRobots: true
  },
  scores: { index: 88, seo: 72, sitemap: 91 },
  stats: { pages: 2, sections: 1, errors: 0, warnings: 1, notices: 2 },
  pages: [
    {
      url: 'https://example.com/a',
      path: '/a',
      displayPath: '/a',
      section: 'home',
      pageType: 'static',
      title: 'Title, with comma',
      description: 'A descriptive sentence.',
      canonical: undefined,
      finalUrl: 'https://example.com/a',
      lastmod: '2026-06-01',
      status: 200,
      ok: true,
      issues: []
    },
    {
      url: 'https://example.com/b',
      path: '/b',
      displayPath: '/b',
      section: 'home',
      pageType: 'static',
      title: 'B',
      description: undefined,
      canonical: undefined,
      finalUrl: 'https://example.com/b',
      lastmod: undefined,
      status: 200,
      ok: true,
      issues: [{ severity: 'warning', code: 'MISSING_META_DESCRIPTION', message: 'x' }]
    }
  ],
  issues: []
};

describe('output renderers', () => {
  it('renders CSV with a header row, one row per page, and comma escaping', () => {
    const csv = renderCsv(result);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe(
      'url,path,display_path,section,page_type,title,description,canonical,final_url,lastmod,status,issue_count,issues'
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"Title, with comma"');
    expect(lines[2]).toContain('warning:MISSING_META_DESCRIPTION');
  });

  it('renders valid JSON that round-trips back to the result shape', () => {
    const parsed = JSON.parse(renderJson(result));
    expect(parsed.site).toBe('https://example.com');
    expect(parsed.pages).toHaveLength(2);
    expect(parsed.scores).toEqual({ index: 88, seo: 72, sitemap: 91 });
  });

  it('renders an HTML index that embeds the data payload, host and scores', () => {
    const out = renderHtml(result);
    expect(out).toContain('<title>Site index for example.com</title>');
    expect(out).toContain('id="sitemapper-data"');
    expect(out).toContain('88/100');
    // The embedded JSON must escape "<" so a page title can never break out of the data script tag.
    expect(out).not.toContain('</script><script');
  });
});
