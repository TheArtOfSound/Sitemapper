import { describe, expect, it } from 'vitest';
import { diffSnapshots, summarizeChanges } from './diff.js';
import type { CrawlSnapshot, UrlState } from './snapshot.js';

function url(partial: Partial<UrlState> & { url: string }): UrlState {
  return {
    noindex: false,
    robotsAllowed: true,
    deepChecked: true,
    status: 200,
    ...partial,
  };
}

function snap(partial: Partial<CrawlSnapshot> & { urls: UrlState[] }): CrawlSnapshot {
  return {
    site: 'https://example.com',
    generatedAt: '2026-08-01T00:00:00.000Z',
    sitemapUrls: ['https://example.com/sitemap.xml'],
    sitemapHashes: { 'https://example.com/sitemap.xml': 'abc' },
    declaredCount: partial.urls.length,
    liveCount: partial.urls.filter((row) => row.status === 200).length,
    indexableCount: partial.urls.filter((row) => row.status === 200 && !row.noindex && row.robotsAllowed).length,
    issues: [],
    scores: { index: 80, seo: 80, sitemap: 80 },
    ...partial,
  };
}

describe('diffSnapshots', () => {
  it('flags removed URLs, noindex, canonical change, and 404s', () => {
    const previous = snap({
      urls: [
        url({ url: 'https://example.com/pricing', canonical: 'https://example.com/pricing' }),
        url({ url: 'https://example.com/products/a' }),
        url({ url: 'https://example.com/products/b' }),
        url({ url: 'https://example.com/ok' }),
      ],
    });
    const next = snap({
      urls: [
        url({ url: 'https://example.com/pricing', canonical: 'https://example.com/plans' }),
        url({ url: 'https://example.com/ok', noindex: true }),
        url({ url: 'https://example.com/new' }),
        url({ url: 'https://example.com/gone-now-404', status: 404 }),
      ],
    });
    next.urls[3] = url({ url: 'https://example.com/ok-status', status: 200 });
    const events = diffSnapshots(previous, next);
    const codes = events.map((event) => event.code);
    expect(codes).toContain('URL_REMOVED');
    expect(codes).toContain('URL_ADDED');
    expect(codes).toContain('CANONICAL_CHANGED');
    expect(codes).toContain('NOINDEX_CHANGED');
    expect(events.find((event) => event.code === 'CANONICAL_CHANGED')?.class).toBe('critical');
    expect(events.find((event) => event.code === 'NOINDEX_CHANGED')?.class).toBe('critical');
    expect(summarizeChanges(events).length).toBeGreaterThan(10);
  });

  it('flags a disappearing sitemap as critical', () => {
    const previous = snap({
      sitemapUrls: ['https://example.com/sitemap.xml'],
      urls: [url({ url: 'https://example.com/' })],
    });
    const next = snap({
      sitemapUrls: [],
      urls: [url({ url: 'https://example.com/' })],
      issues: [{ code: 'NO_ACCESSIBLE_SITEMAP', severity: 'error' }],
    });
    const events = diffSnapshots(previous, next);
    expect(events.some((event) => event.code === 'SITEMAP_DISAPPEARED' && event.class === 'critical')).toBe(true);
  });

  it('does not treat a legacy attempted path with zero entries as a disappeared sitemap', () => {
    const primary = 'https://example.com/sitemap.xml';
    const emptyCandidate = 'https://example.com/sitemap_index.xml';
    const previous = snap({
      sitemapUrls: [primary, emptyCandidate],
      urls: [url({ url: 'https://example.com/', sitemapSource: primary })],
      issues: [
        {
          code: 'DISCOVERY_NOTE',
          severity: 'notice',
          evidence: `${emptyCandidate} loaded but produced 0 same-host sitemap children or URL entries.`,
        },
      ],
    });
    const next = snap({
      sitemapUrls: [primary],
      urls: [url({ url: 'https://example.com/', sitemapSource: primary })],
    });

    const events = diffSnapshots(previous, next);
    expect(events.some((event) => event.code === 'SITEMAP_DISAPPEARED')).toBe(false);
  });

  it('treats a large URL-count drop as a critical regression', () => {
    const previous = snap({
      declaredCount: 100,
      urls: Array.from({ length: 100 }, (_, i) => url({ url: `https://example.com/p/${i}` })),
    });
    const next = snap({
      declaredCount: 60,
      urls: Array.from({ length: 60 }, (_, i) => url({ url: `https://example.com/p/${i}` })),
    });
    const events = diffSnapshots(previous, next);
    expect(events.some((event) => event.code === 'SITEMAP_URL_COUNT_DROP' && event.class === 'critical')).toBe(true);
  });

  it('does not emit noise when snapshots are identical', () => {
    const previous = snap({ urls: [url({ url: 'https://example.com/', title: 'Home' })] });
    const events = diffSnapshots(previous, structuredClone(previous));
    expect(events).toEqual([]);
  });
});
