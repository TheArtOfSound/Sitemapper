import { describe, expect, it } from 'vitest';
import { buildPageFromHtml } from './page.js';
import type { RawSitemapEntry } from '../types.js';

// A valid title (18 chars: >=15 and <=75) and description (60 chars: >=50 and <=180).
const GOOD_TITLE = 'About Acme Widgets';
const GOOD_DESC = 'Acme Widgets builds durable hand tools for home and pro use.';

interface PageHtmlOptions {
  title?: string | null;
  description?: string | null;
  canonical?: string | null;
  noindex?: boolean;
}

function html(options: PageHtmlOptions = {}): string {
  const title = options.title === null ? '' : `<title>${options.title ?? GOOD_TITLE}</title>`;
  const description =
    options.description === null ? '' : `<meta name="description" content="${options.description ?? GOOD_DESC}" />`;
  const canonical =
    options.canonical === null ? '' : `<link rel="canonical" href="${options.canonical ?? 'https://example.com/about'}" />`;
  const robots = options.noindex ? '<meta name="robots" content="noindex, follow" />' : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />${title}${description}${canonical}${robots}</head><body><h1>Page</h1></body></html>`;
}

const staticEntry: RawSitemapEntry = { url: 'https://example.com/about', lastmod: '2026-06-01' };
const generatedEntry: RawSitemapEntry = { url: 'https://example.com/cluster/abc', lastmod: '2026-06-01' };

function codes(entry: RawSitemapEntry, status: number | undefined, finalUrl: string | undefined, body: string | undefined) {
  return buildPageFromHtml(entry, status, finalUrl, body).issues.map((issue) => issue.code);
}

function severityOf(entry: RawSitemapEntry, status: number, finalUrl: string, body: string, code: string) {
  return buildPageFromHtml(entry, status, finalUrl, body).issues.find((issue) => issue.code === code)?.severity;
}

describe('buildPageFromHtml — v0.1 SEO/crawlability checks', () => {
  it('reports zero issues for a clean, complete page', () => {
    const page = buildPageFromHtml(staticEntry, 200, staticEntry.url, html());
    expect(page.issues).toEqual([]);
    expect(page.ok).toBe(true);
    expect(page.title).toBe(GOOD_TITLE);
    expect(page.description).toBe(GOOD_DESC);
    expect(page.canonical).toBe('https://example.com/about');
    expect(page.status).toBe(200);
  });

  it('flags a missing <title> (warning on real pages, notice on generated)', () => {
    expect(codes(staticEntry, 200, staticEntry.url, html({ title: null }))).toContain('MISSING_TITLE');
    expect(severityOf(staticEntry, 200, staticEntry.url, html({ title: null }), 'MISSING_TITLE')).toBe('warning');
    expect(severityOf(generatedEntry, 200, generatedEntry.url, html({ title: null }), 'MISSING_TITLE')).toBe('notice');
  });

  it('flags a very short title', () => {
    expect(codes(staticEntry, 200, staticEntry.url, html({ title: 'Hi' }))).toContain('SHORT_TITLE');
    expect(severityOf(staticEntry, 200, staticEntry.url, html({ title: 'Hi' }), 'SHORT_TITLE')).toBe('notice');
  });

  it('flags a very long title (warning on real pages, notice on generated)', () => {
    const longTitle = 'A'.repeat(80);
    expect(codes(staticEntry, 200, staticEntry.url, html({ title: longTitle }))).toContain('LONG_TITLE');
    expect(severityOf(staticEntry, 200, staticEntry.url, html({ title: longTitle }), 'LONG_TITLE')).toBe('warning');
    expect(severityOf(generatedEntry, 200, generatedEntry.url, html({ title: longTitle }), 'LONG_TITLE')).toBe('notice');
  });

  it('flags a missing meta description (warning on real pages, notice on generated)', () => {
    expect(codes(staticEntry, 200, staticEntry.url, html({ description: null }))).toContain('MISSING_META_DESCRIPTION');
    expect(severityOf(staticEntry, 200, staticEntry.url, html({ description: null }), 'MISSING_META_DESCRIPTION')).toBe('warning');
    expect(severityOf(generatedEntry, 200, generatedEntry.url, html({ description: null }), 'MISSING_META_DESCRIPTION')).toBe('notice');
  });

  it('flags a very short meta description', () => {
    expect(codes(staticEntry, 200, staticEntry.url, html({ description: 'Too short.' }))).toContain('SHORT_META_DESCRIPTION');
  });

  it('flags a very long meta description', () => {
    expect(codes(staticEntry, 200, staticEntry.url, html({ description: 'B'.repeat(200) }))).toContain('LONG_META_DESCRIPTION');
  });

  it('flags a missing canonical link', () => {
    expect(codes(staticEntry, 200, staticEntry.url, html({ canonical: null }))).toContain('MISSING_CANONICAL');
    expect(severityOf(staticEntry, 200, staticEntry.url, html({ canonical: null }), 'MISSING_CANONICAL')).toBe('notice');
  });

  it('flags a bad HTTP status as an error', () => {
    const page = buildPageFromHtml(staticEntry, 404, staticEntry.url, 'not found');
    expect(page.issues.map((i) => i.code)).toContain('BAD_STATUS');
    expect(page.ok).toBe(false);
  });

  it('flags a 3xx redirect status', () => {
    expect(codes(staticEntry, 301, staticEntry.url, '')).toContain('REDIRECT_STATUS');
  });

  it('flags a failed fetch (no status) as an error', () => {
    const page = buildPageFromHtml(staticEntry, undefined, undefined, undefined);
    expect(page.issues.map((i) => i.code)).toContain('FETCH_FAILED');
    expect(page.ok).toBe(false);
  });

  it('flags a sitemap URL that resolves to a different final URL', () => {
    expect(codes(staticEntry, 200, 'https://example.com/about-us', html())).toContain('REDIRECTED_URL');
  });

  it('does not flag a trailing-slash-only difference as a redirect', () => {
    expect(codes(staticEntry, 200, 'https://example.com/about/', html())).not.toContain('REDIRECTED_URL');
  });

  it('flags a multi-hop redirect chain and records the hop count', () => {
    const chain = [
      { url: 'https://example.com/about', status: 301, location: 'https://example.com/about2' },
      { url: 'https://example.com/about2', status: 301, location: 'https://example.com/about-final' }
    ];
    const page = buildPageFromHtml(staticEntry, 200, 'https://example.com/about-final', html(), { chain, loop: false });
    const found = page.issues.map((i) => i.code);
    expect(found).toContain('REDIRECT_CHAIN');
    expect(found).not.toContain('REDIRECTED_URL');
    expect(page.redirects).toBe(2);
  });

  it('flags a redirect loop as an error', () => {
    const chain = [
      { url: 'https://example.com/a', status: 301, location: 'https://example.com/b' },
      { url: 'https://example.com/b', status: 301, location: 'https://example.com/a' }
    ];
    const page = buildPageFromHtml(staticEntry, 301, 'https://example.com/a', '', { chain, loop: true });
    expect(page.issues.map((i) => i.code)).toContain('REDIRECT_LOOP');
    expect(page.ok).toBe(false);
  });

  it('flags a noindex page that is listed in the sitemap as an error', () => {
    const page = buildPageFromHtml(staticEntry, 200, staticEntry.url, html({ noindex: true }));
    expect(page.issues.map((i) => i.code)).toContain('NOINDEX_IN_SITEMAP');
    expect(page.ok).toBe(false);
  });

  it('flags a missing lastmod (warning on real pages, notice on generated)', () => {
    const noLastmod: RawSitemapEntry = { url: 'https://example.com/about' };
    expect(codes(noLastmod, 200, noLastmod.url, html())).toContain('MISSING_LASTMOD');
    expect(severityOf(noLastmod, 200, noLastmod.url, html(), 'MISSING_LASTMOD')).toBe('warning');
    const noLastmodGenerated: RawSitemapEntry = { url: 'https://example.com/cluster/abc' };
    expect(severityOf(noLastmodGenerated, 200, noLastmodGenerated.url, html(), 'MISSING_LASTMOD')).toBe('notice');
  });
});
