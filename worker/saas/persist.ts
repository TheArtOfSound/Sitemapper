import { diffSnapshots, summarizeChanges, type ChangeEvent } from '../../src/diff/diff.js';
import type { CrawlSnapshot, UrlState } from '../../src/diff/snapshot.js';
import { canAddSite, canMonitorUrls } from '../../src/plans.js';
import type { Result } from '../render.js';
import type { SessionUser } from './auth.js';
import { newId, nowIso, periodMonth, type Env } from './env.js';

export const ISSUE_UPSERT_SQL = `INSERT INTO issues (id, project_id, code, severity, first_seen_at, last_seen_at, occurrence_count, affected_urls, evidence)
VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
ON CONFLICT(project_id, code) DO UPDATE SET
  severity = excluded.severity,
  last_seen_at = excluded.last_seen_at,
  resolved_at = NULL,
  occurrence_count = issues.occurrence_count + 1,
  affected_urls = excluded.affected_urls,
  evidence = excluded.evidence`;

export function resultToSnapshot(result: Result, sitemapHashes: Record<string, string> = {}): CrawlSnapshot {
  const urls: UrlState[] = result.pages.map((page) => ({
    url: page.url,
    status: page.status,
    title: page.title,
    description: page.description,
    canonical: page.canonical,
    lastmod: page.lastmod,
    noindex: page.issues.some((issue) => issue.code === 'NOINDEX_IN_SITEMAP'),
    robotsAllowed: !page.issues.some((issue) => issue.code === 'ROBOTS_DISALLOWED_IN_SITEMAP'),
    deepChecked: page.deepChecked,
    sitemapSource: page.sitemapListed === false ? undefined : result.source.sitemapUrls[0],
  }));
  return {
    site: result.site,
    generatedAt: result.generatedAt,
    sitemapUrls: result.source.sitemapUrls,
    sitemapHashes,
    declaredCount: result.source.discoveredUrlCount,
    liveCount: result.pages.filter((page) => page.status && page.status < 400).length,
    indexableCount: result.pages.filter(
      (page) =>
        page.sitemapListed !== false &&
        page.deepChecked &&
        page.status === 200 &&
        !page.issues.some((issue) => issue.code === 'NOINDEX_IN_SITEMAP')
    ).length,
    urls,
    issues: [
      ...result.issues.map((issue) => ({ code: issue.code, severity: issue.severity, message: issue.message, evidence: issue.evidence })),
      ...result.pages.flatMap((page) =>
        page.issues.map((issue) => ({
          code: issue.code,
          severity: issue.severity,
          url: page.url,
          message: issue.message,
          evidence: issue.evidence,
        }))
      ),
    ],
    scores: result.scores,
    fingerprint: result.insights?.fingerprint,
  };
}

export async function saveSnapshot(
  env: Env,
  input: {
    projectId: string;
    jobId?: string;
    kind: string;
    snapshot: CrawlSnapshot;
    isBaseline?: boolean;
  }
): Promise<{ snapshotId: string; events: ChangeEvent[]; summary: string }> {
  if (!Number.isFinite(input.snapshot.declaredCount) || input.snapshot.declaredCount < 1) {
    throw new Error('SCAN_INCONCLUSIVE: refusing to persist a zero-inventory snapshot.');
  }
  const snapshotId = newId('snap');
  const r2Key = `projects/${input.projectId}/snapshots/${snapshotId}.json`;
  await env.SNAPSHOTS.put(r2Key, JSON.stringify(input.snapshot), {
    httpMetadata: { contentType: 'application/json' },
  });

  const previous = await env.DB.prepare(
    `SELECT s.id, s.r2_key
     FROM snapshots s
     LEFT JOIN crawl_jobs j ON j.id = s.job_id
     WHERE s.project_id = ?
       AND (s.job_id IS NULL OR j.status = 'complete')
       AND s.declared_urls > 0
     ORDER BY s.generated_at DESC
     LIMIT 1`
  )
    .bind(input.projectId)
    .first<{ id: string; r2_key: string }>();

  let events: ChangeEvent[] = [];
  if (previous) {
    const obj = await env.SNAPSHOTS.get(previous.r2_key);
    if (obj) {
      const prevSnap = JSON.parse(await obj.text()) as CrawlSnapshot;
      events = diffSnapshots(prevSnap, input.snapshot);
    }
  }

  await env.DB.prepare(
    `INSERT INTO snapshots (id, project_id, job_id, kind, r2_key, generated_at, declared_urls, live_urls, indexable_urls, errors, warnings, notices, index_score, seo_score, sitemap_score, fingerprint, sitemap_hash, is_baseline)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      snapshotId,
      input.projectId,
      input.jobId || null,
      input.kind,
      r2Key,
      input.snapshot.generatedAt,
      input.snapshot.declaredCount,
      input.snapshot.liveCount,
      input.snapshot.indexableCount,
      input.snapshot.issues.filter((issue) => issue.severity === 'error').length,
      input.snapshot.issues.filter((issue) => issue.severity === 'warning').length,
      input.snapshot.issues.filter((issue) => issue.severity === 'notice').length,
      input.snapshot.scores.index,
      input.snapshot.scores.seo,
      input.snapshot.scores.sitemap,
      input.snapshot.fingerprint || null,
      Object.values(input.snapshot.sitemapHashes)[0] || null,
      input.isBaseline || !previous ? 1 : 0
    )
    .run();

  if (events.length) {
    const stmts = events.map((event) =>
      env.DB.prepare(
        `INSERT INTO change_events (id, project_id, snapshot_id, previous_snapshot_id, code, severity, url, before_json, after_json, grouped_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        newId('chg'),
        input.projectId,
        snapshotId,
        previous?.id || null,
        event.code,
        event.class,
        event.url || null,
        event.before === undefined ? null : JSON.stringify(event.before),
        event.after === undefined ? null : JSON.stringify(event.after),
        event.count,
        nowIso()
      )
    );
    await env.DB.batch(stmts);
  }

  await upsertIssues(env, input.projectId, input.snapshot);
  return { snapshotId, events, summary: summarizeChanges(events) };
}

async function upsertIssues(env: Env, projectId: string, snapshot: CrawlSnapshot): Promise<void> {
  const grouped = new Map<string, { severity: string; urls: Set<string>; evidence: string }>();
  for (const issue of snapshot.issues) {
    if (issue.code === 'INDEX_ONLY_NOT_FETCHED') continue;
    const row = grouped.get(issue.code) || { severity: issue.severity, urls: new Set<string>(), evidence: issue.evidence || issue.message || '' };
    if (issue.url) row.urls.add(issue.url);
    grouped.set(issue.code, row);
  }
  const existing = await env.DB.prepare('SELECT code, id FROM issues WHERE project_id = ? AND resolved_at IS NULL')
    .bind(projectId)
    .all<{ code: string; id: string }>();
  const open = new Map((existing.results || []).map((row) => [row.code, row.id]));
  const stmts = [];
  for (const [code, row] of grouped) {
    const seenAt = nowIso();
    stmts.push(
      env.DB.prepare(ISSUE_UPSERT_SQL).bind(newId('iss'), projectId, code, row.severity, seenAt, seenAt, row.urls.size, row.evidence)
    );
    open.delete(code);
  }
  for (const id of open.values()) {
    stmts.push(env.DB.prepare('UPDATE issues SET resolved_at = ? WHERE id = ?').bind(nowIso(), id));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

export async function createMonitoredSite(
  env: Env,
  user: SessionUser,
  siteUrl: string,
  shareId?: string
): Promise<{ ok: true; projectId: string } | { ok: false; status: number; error: string }> {
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`).hostname.toLowerCase();
  } catch {
    return { ok: false, status: 400, error: 'Invalid site URL.' };
  }

  const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM projects WHERE workspace_id = ?')
    .bind(user.workspaceId)
    .first<{ n: number }>();
  if (!canAddSite(user.entitlements, Number(countRow?.n || 0))) {
    return { ok: false, status: 402, error: `Plan ${user.entitlements.plan} allows ${user.entitlements.sites} monitored site(s). Upgrade to add more.` };
  }

  const existing = await env.DB.prepare('SELECT id FROM projects WHERE workspace_id = ? AND host = ?')
    .bind(user.workspaceId, host)
    .first<{ id: string }>();
  if (existing) return { ok: true, projectId: existing.id };

  const projectId = newId('prj');
  const monitorId = newId('mon');
  const nextRun = new Date(Date.now() + user.entitlements.frequencyMinutes * 60_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO projects (id, workspace_id, name, site_url, host, created_from_share_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(projectId, user.workspaceId, host, `https://${host}`, host, shareId || null, nowIso()),
    env.DB.prepare(
      'INSERT INTO monitors (id, project_id, enabled, frequency_minutes, next_run_at, last_status, fail_on_json, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)'
    ).bind(
      monitorId,
      projectId,
      user.entitlements.frequencyMinutes,
      nextRun,
      'pending',
      JSON.stringify({
        sitemapDisappeared: true,
        urlCountDropPercent: 20,
        newNoindex: true,
        new5xx: true,
        redirectLoop: true,
        robotsBlock: true,
      }),
      nowIso()
    ),
  ]);
  return { ok: true, projectId };
}

export async function enqueueCrawl(env: Env, projectId: string, workspaceId: string, siteUrl: string, kind: 'manual' | 'scheduled' | 'ci'): Promise<string> {
  const jobId = newId('job');
  const period = new Date().toISOString().slice(0, 13);
  const idempotency = kind === 'manual' ? `${projectId}:manual:${jobId}` : `${projectId}:${kind}:${period}`;
  try {
    await env.DB.prepare(
      'INSERT INTO crawl_jobs (id, project_id, workspace_id, kind, status, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(jobId, projectId, workspaceId, kind, 'queued', idempotency, nowIso())
      .run();
  } catch {
    const existing = await env.DB.prepare('SELECT id FROM crawl_jobs WHERE idempotency_key = ?').bind(idempotency).first<{ id: string }>();
    return existing?.id || jobId;
  }
  if (env.CRAWLS) {
    await env.CRAWLS.send({ jobId, projectId, workspaceId, kind, siteUrl });
  }
  return jobId;
}

export async function bumpUsage(env: Env, workspaceId: string, urls: number, deep: number): Promise<void> {
  const period = periodMonth();
  await env.DB.prepare(
    `INSERT INTO usage_counters (workspace_id, period, monitored_urls, deep_checks, scans)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(workspace_id, period) DO UPDATE SET
       monitored_urls = MAX(monitored_urls, excluded.monitored_urls),
       deep_checks = deep_checks + excluded.deep_checks,
       scans = scans + 1`
  )
    .bind(workspaceId, period, urls, deep)
    .run();
}

export async function assertUrlQuota(env: Env, user: SessionUser, urlCount: number): Promise<string | null> {
  const usage = await env.DB.prepare('SELECT monitored_urls FROM usage_counters WHERE workspace_id = ? AND period = ?')
    .bind(user.workspaceId, periodMonth())
    .first<{ monitored_urls: number }>();
  const current = Math.max(Number(usage?.monitored_urls || 0), urlCount);
  if (!canMonitorUrls(user.entitlements, current)) {
    return `This site has ${urlCount} declared URLs; plan ${user.entitlements.plan} allows ${user.entitlements.monitoredUrls} monitored URLs.`;
  }
  return null;
}
