import { describe, expect, it } from 'vitest';
import { normalizeEvidenceAvailability } from './store.js';
import type { Result } from './render.js';

function report(discoveredUrlCount: number, pageCount: number): Result {
  return {
    site: 'https://example.com',
    generatedAt: '2026-08-22T12:00:00.000Z',
    source: {
      robotsUrl: 'https://example.com/robots.txt',
      sitemapUrls: ['https://example.com/sitemap.xml'],
      discoveredFromRobots: false,
      inputMode: 'site',
      testedUrls: [],
      failures: [],
      compatibility: 'test',
      discoveredUrlCount,
      deepCheckedCount: pageCount,
    },
    scores: { index: 90, seo: 83, sitemap: 90 },
    stats: { pages: pageCount, sections: 0, errors: 0, warnings: 0, notices: 0 },
    pages: Array.from({ length: pageCount }, (_, index) => ({
      url: `https://example.com/${index}`,
      path: `/${index}`,
      type: 'page',
      section: '/',
      deepChecked: true,
      issues: [],
    })),
    issues: [],
    insights: {
      fingerprint: 'sp_test',
      structuralSignature: 'd0.b0.u0.s0.t.f0',
      lattice: { segment: '/', path: '/', count: 0, depth: 0, children: [] },
      latticeDepth: 0,
      latticeBreadth: 0,
      leafPaths: 0,
      freshness: [],
      freshnessCoverage: 0,
      sections: [],
      types: [],
      imbalance: 0,
      orphanRoots: 0,
      maxSectionShare: 0,
      proof: [],
    },
  };
}

describe('stored report evidence availability', () => {
  it('marks a legacy evidence-empty report as not scored', () => {
    const normalized = normalizeEvidenceAvailability(report(0, 0));
    expect(normalized.scores.available).toBe(false);
    expect(normalized.scores.index).toBe(90);
  });

  it('preserves legacy numeric scores when inventory evidence exists', () => {
    const normalized = normalizeEvidenceAvailability(report(1, 1));
    expect(normalized.scores.available).toBeUndefined();
    expect(normalized.scores.index).toBe(90);
  });

  it('reclassifies a legacy all-abort report without preserving a false outage diagnosis', () => {
    const legacy = report(0, 0);
    legacy.source.failures = [
      'https://example.com/robots.txt failed: The operation was aborted',
      'https://example.com/sitemap.xml failed: The operation was aborted',
    ];
    legacy.source.compatibility = 'Not compatible yet: no accessible XML sitemap URLs were found.';
    legacy.issues = [
      { severity: 'error', code: 'NO_ACCESSIBLE_SITEMAP', message: 'No accessible XML sitemap could be loaded.' },
      { severity: 'warning', code: 'SITEMAP_FETCH_FAILED', message: 'Could not load sitemap.' },
    ];
    legacy.stats = { pages: 0, sections: 0, errors: 1, warnings: 1, notices: 0 };

    const normalized = normalizeEvidenceAvailability(legacy);

    expect(normalized.scores.available).toBe(false);
    expect(normalized.source.compatibility).toContain('Inconclusive');
    expect(normalized.issues.map((issue) => issue.code)).toContain('SCAN_INCONCLUSIVE');
    expect(normalized.issues.map((issue) => issue.code)).not.toContain('NO_ACCESSIBLE_SITEMAP');
    expect(normalized.issues.map((issue) => issue.code)).not.toContain('SITEMAP_FETCH_FAILED');
    expect(normalized.stats).toMatchObject({ errors: 0, warnings: 0, notices: 1 });
    expect(normalized.insights.proof.at(-1)).toContain('Inconclusive');
  });
});
