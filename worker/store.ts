/**
 * KV-backed saved surveys → shareable /r/{id} URLs (no re-crawl on open/export).
 */

import type { Result } from './render.js';

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
  const id = makeReportId();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + REPORT_TTL_SECONDS * 1000).toISOString();
  const stored: StoredReport = {
    id,
    createdAt,
    expiresAt,
    site: result.site,
    fingerprint: result.insights?.fingerprint || '',
    result,
  };
  await kv.put(`${REPORT_KEY_PREFIX}${id}`, JSON.stringify(stored), {
    expirationTtl: REPORT_TTL_SECONDS,
    metadata: {
      site: result.site,
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
    return parsed;
  } catch {
    return null;
  }
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
