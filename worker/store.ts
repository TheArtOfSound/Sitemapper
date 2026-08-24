/**
 * KV-backed saved surveys → shareable /r/{id} URLs (no re-crawl on open/export).
 */

import type { Result } from './render.js';
import { buildInsights } from './insights.js';

export const REPORT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const REPORT_KEY_PREFIX = 'report:';

export type StoredReport = {
  id: string;
  createdAt: string;
  expiresAt: string;
  site: string;
  fingerprint: string;
  result: Result;
};

export function makeReportId(): string {
  // 10-char url-safe id (no confusing 0/o/1/l)
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < 10; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}

export async function saveReport(kv: KVNamespace | undefined, result: Result): Promise<StoredReport | null> {
  if (!kv) return null;
  const normalizedResult = normalizeEvidenceAvailability(result);
  const id = makeReportId();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + REPORT_TTL_SECONDS * 1000).toISOString();
  const stored: StoredReport = {
    id,
    createdAt,
    expiresAt,
    site: normalizedResult.site,
    fingerprint: normalizedResult.insights?.fingerprint || '',
    result: normalizedResult,
  };
  await kv.put(`${REPORT_KEY_PREFIX}${id}`, JSON.stringify(stored), {
    expirationTtl: REPORT_TTL_SECONDS,
    metadata: {
      site: normalizedResult.site,
      fingerprint: stored.fingerprint,
      createdAt,
    },
  });
  return stored;
}

export async function loadReport(kv: KVNamespace | undefined, id: string): Promise<StoredReport | null> {
  if (!kv || !isValidReportId(id)) return null;
  const raw = await kv.get(`${REPORT_KEY_PREFIX}${id}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredReport;
    if (!parsed?.result?.site) return null;
    parsed.result = normalizeEvidenceAvailability(parsed.result);
    return parsed;
  } catch {
    return null;
  }
}

export function normalizeEvidenceAvailability(result: Result): Result {
  const pages = Array.isArray(result.pages) ? result.pages : [];
  const hasInventoryEvidence = Number(result.source?.discoveredUrlCount || 0) > 0 && pages.length > 0;
  const failures = Array.isArray(result.source?.failures) ? result.source.failures : [];
  const transientFailure = failures.some((failure) =>
    /abort|timed?\s*out|time\s*limit|deadline|blocked|challeng|captcha|verify you are human/i.test(failure)
  );
  const explicitInconclusive = result.issues.some((issue) => issue.code === 'SCAN_INCONCLUSIVE');
  const inconclusive = !hasInventoryEvidence && (explicitInconclusive || transientFailure);
  const scores = hasInventoryEvidence
    ? result.scores
    : { ...result.scores, available: false as const };

  if (!inconclusive) {
    if (scores === result.scores) return result;
    return { ...result, scores };
  }

  const invalidOutageCodes = new Set([
    'NO_ACCESSIBLE_SITEMAP',
    'SITEMAPS_FOUND_BUT_UNUSABLE',
    'SITEMAP_FETCH_FAILED',
  ]);
  const issues = result.issues.filter((issue) => !invalidOutageCodes.has(issue.code));
  if (!issues.some((issue) => issue.code === 'SCAN_INCONCLUSIVE')) {
    issues.push({
      severity: 'notice',
      code: 'SCAN_INCONCLUSIVE',
      message: 'Sitemapper did not collect enough crawl evidence to determine sitemap availability. No sitemap outage is asserted from this run.',
      evidence: failures.slice(0, 5).join(' | ') || undefined,
    });
  }
  const source = {
    ...result.source,
    compatibility: 'Inconclusive: this run did not collect enough evidence to determine sitemap availability.',
  };
  const allIssues = [...issues, ...pages.flatMap((page) => page.issues || [])];
  return {
    ...result,
    source,
    scores,
    issues,
    stats: {
      ...result.stats,
      pages: pages.length,
      errors: allIssues.filter((issue) => issue.severity === 'error').length,
      warnings: allIssues.filter((issue) => issue.severity === 'warning').length,
      notices: allIssues.filter((issue) => issue.severity === 'notice').length,
    },
    insights: buildInsights(result.site, pages, source, scores),
  };
}

export function isValidReportId(id: string): boolean {
  return /^[a-z0-9]{8,16}$/i.test(id);
}

export function sharePaths(id: string) {
  return {
    report: `/r/${id}`,
    json: `/r/${id}/json`,
    csv: `/r/${id}/csv`,
    pack: `/r/${id}/pack`,
    packMd: `/r/${id}/pack?format=md`,
    packFlat: `/r/${id}/pack?format=flat`,
    packView: `/r/${id}/pack/view`,
  };
}
