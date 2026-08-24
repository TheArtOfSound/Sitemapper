import { diffSnapshots, summarizeChanges, type ChangeEvent } from './diff/diff.js';
import type { CrawlSnapshot, UrlState } from './diff/snapshot.js';

export type GuardRules = {
  sitemapDisappeared?: boolean;
  sitemapInvalid?: boolean;
  urlCountDropPercent?: number;
  newNoindex?: boolean;
  robotsBlock?: boolean;
  new4xx?: boolean;
  new5xx?: boolean;
  canonicalRegression?: boolean;
  redirectLoop?: boolean;
};

export const DEFAULT_GUARD_RULES: GuardRules = {
  sitemapDisappeared: true,
  sitemapInvalid: true,
  urlCountDropPercent: 20,
  newNoindex: true,
  robotsBlock: true,
  new5xx: true,
  canonicalRegression: true,
  redirectLoop: true,
};

export type GuardResult = {
  passed: boolean;
  summary: string;
  failures: ChangeEvent[];
  events: ChangeEvent[];
};

export function evaluateGuard(previous: CrawlSnapshot, next: CrawlSnapshot, rules: GuardRules = DEFAULT_GUARD_RULES): GuardResult {
  const events = diffSnapshots(previous, next);
  const failures = events.filter((event) => matchesRule(event, rules));
  return {
    passed: failures.length === 0,
    summary: failures.length ? summarizeChanges(failures) : 'No configured deploy regressions.',
    failures,
    events,
  };
}

function matchesRule(event: ChangeEvent, rules: GuardRules): boolean {
  if (rules.sitemapDisappeared && event.code === 'SITEMAP_DISAPPEARED') return true;
  if (rules.sitemapInvalid && event.code === 'XML_PARSER_FAILURE_INTRODUCED') return true;
  if (rules.urlCountDropPercent && event.code === 'SITEMAP_URL_COUNT_DROP') return true;
  if (rules.newNoindex && event.code === 'NOINDEX_CHANGED' && event.class === 'critical') return true;
  if (rules.robotsBlock && event.code === 'ROBOTS_ACCESS_CHANGED' && event.class === 'critical') return true;
  if (rules.new5xx && event.code === 'HTTP_STATUS_CHANGED' && Number(event.after) >= 500) return true;
  if (rules.new4xx && event.code === 'HTTP_STATUS_CHANGED' && Number(event.after) >= 400 && Number(event.after) < 500) return true;
  if (rules.canonicalRegression && event.code === 'CANONICAL_CHANGED' && event.class === 'critical') return true;
  if (rules.redirectLoop && event.code === 'REDIRECT_CHANGED' && event.class === 'critical') return true;
  return false;
}

export function snapshotFromAuditJson(raw: unknown): CrawlSnapshot {
  const data = raw as {
    site: string;
    generatedAt: string;
    source?: { sitemapUrls?: string[]; discoveredUrlCount?: number };
    scores?: { index: number; seo: number; sitemap: number };
    pages?: Array<{
      url: string;
      status?: number;
      title?: string;
      description?: string;
      canonical?: string;
      lastmod?: string;
      issues?: Array<{ code: string; severity: string; message?: string; evidence?: string }>;
    }>;
    issues?: Array<{ code: string; severity: string; message?: string; evidence?: string }>;
    insights?: { fingerprint?: string };
  };
  const urls: UrlState[] = (data.pages || []).map((page) => ({
    url: page.url,
    status: page.status,
    title: page.title,
    description: page.description,
    canonical: page.canonical,
    lastmod: page.lastmod,
    noindex: (page.issues || []).some((issue) => issue.code === 'NOINDEX_IN_SITEMAP'),
    robotsAllowed: !(page.issues || []).some((issue) => issue.code === 'ROBOTS_DISALLOWED_IN_SITEMAP'),
    deepChecked: true,
  }));
  return {
    site: data.site,
    generatedAt: data.generatedAt,
    sitemapUrls: data.source?.sitemapUrls || [],
    sitemapHashes: {},
    declaredCount: data.source?.discoveredUrlCount || urls.length,
    liveCount: urls.filter((row) => row.status && row.status < 400).length,
    indexableCount: urls.filter((row) => row.status === 200 && !row.noindex && row.robotsAllowed).length,
    urls,
    issues: [
      ...(data.issues || []).map((issue) => ({
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
        evidence: issue.evidence,
      })),
      ...urls.flatMap((row, i) =>
        ((data.pages || [])[i]?.issues || []).map((issue) => ({
          code: issue.code,
          severity: issue.severity,
          url: row.url,
          message: issue.message,
          evidence: issue.evidence,
        }))
      ),
    ],
    scores: data.scores || { index: 0, seo: 0, sitemap: 0 },
    fingerprint: data.insights?.fingerprint,
  };
}
