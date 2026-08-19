import { describe, expect, it } from 'vitest';
import { evaluateGuard } from './guard.js';
import type { CrawlSnapshot, UrlState } from './diff/snapshot.js';

function url(partial: Partial<UrlState> & { url: string }): UrlState {
  return { noindex: false, robotsAllowed: true, deepChecked: true, status: 200, ...partial };
}

function snap(urls: UrlState[], extra: Partial<CrawlSnapshot> = {}): CrawlSnapshot {
  return {
    site: 'https://example.com',
    generatedAt: '2026-08-18T00:00:00.000Z',
    sitemapUrls: ['https://example.com/sitemap.xml'],
    sitemapHashes: {},
    declaredCount: urls.length,
    liveCount: urls.length,
    indexableCount: urls.length,
    urls,
    issues: [],
    scores: { index: 80, seo: 80, sitemap: 80 },
    ...extra,
  };
}

describe('evaluateGuard', () => {
  it('fails a deploy that removes the sitemap', () => {
    const previous = snap([url({ url: 'https://example.com/' })]);
    const next = snap([url({ url: 'https://example.com/' })], { sitemapUrls: [], issues: [{ code: 'NO_ACCESSIBLE_SITEMAP', severity: 'error' }] });
    const result = evaluateGuard(previous, next);
    expect(result.passed).toBe(false);
    expect(result.failures.some((event) => event.code === 'SITEMAP_DISAPPEARED')).toBe(true);
  });

  it('does not fail on title-only changes', () => {
    const previous = snap([url({ url: 'https://example.com/', title: 'A' })]);
    const next = snap([url({ url: 'https://example.com/', title: 'B' })]);
    const result = evaluateGuard(previous, next);
    expect(result.passed).toBe(true);
  });

  it('fails production URLs that become noindex', () => {
    const previous = snap([url({ url: 'https://example.com/pricing' })]);
    const next = snap([url({ url: 'https://example.com/pricing', noindex: true })]);
    const result = evaluateGuard(previous, next);
    expect(result.passed).toBe(false);
  });
});
