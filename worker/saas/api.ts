import { entitlementsFor, type Entitlements } from '../../src/plans.js';
import { json, newId, nowIso, periodMonth, randomToken, sha256Hex, type Env } from './env.js';

export type ApiAuth = {
  workspaceId: string;
  entitlements: Entitlements;
};

export async function authApiKey(request: Request, env: Env): Promise<ApiAuth | Response> {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !token.startsWith('sk_live_')) return json({ error: 'Missing or invalid Bearer API key.' }, 401);
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT k.workspace_id, k.revoked_at, w.plan, w.stripe_status, w.owner_user_id
     FROM api_keys k JOIN workspaces w ON w.id = k.workspace_id
     WHERE k.hashed_secret = ?`
  )
    .bind(hash)
    .first<{ workspace_id: string; revoked_at: string | null; plan: string; stripe_status: string }>();
  if (!row || row.revoked_at) return json({ error: 'Invalid API key.' }, 401);
  const entitlements = entitlementsFor(row.plan, row.stripe_status);
  if (!entitlements.api) return json({ error: 'API access requires Pro or Agency.' }, 402);
  await env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE hashed_secret = ?').bind(nowIso(), hash).run();
  return { workspaceId: row.workspace_id, entitlements };
}

export async function mintApiKey(env: Env, workspaceId: string, name: string): Promise<{ plaintext: string; prefix: string }> {
  const secret = `sk_live_${await randomToken(24)}`;
  const prefix = secret.slice(0, 12);
  await env.DB.prepare(
    'INSERT INTO api_keys (id, workspace_id, prefix, hashed_secret, name, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(newId('key'), workspaceId, prefix, await sha256Hex(secret), name, nowIso())
    .run();
  return { plaintext: secret, prefix };
}

export async function handlePublicApi(request: Request, env: Env, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/v1/')) return null;
  const auth = await authApiKey(request, env);
  if (auth instanceof Response) return auth;

  if (path === '/api/v1/sites' && request.method === 'GET') {
    const sites = await env.DB.prepare(
      `SELECT p.id, p.host, p.site_url, m.enabled, m.last_status, m.last_finished_at, m.next_run_at
       FROM projects p LEFT JOIN monitors m ON m.project_id = p.id
       WHERE p.workspace_id = ? ORDER BY p.created_at DESC`
    )
      .bind(auth.workspaceId)
      .all();
    return json({ sites: sites.results || [] });
  }

  const siteMatch = path.match(/^\/api\/v1\/sites\/([^/]+)(?:\/(changes|issues|crawl))?$/);
  if (!siteMatch) return json({ error: 'Not found.' }, 404);
  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND workspace_id = ?')
    .bind(siteMatch[1], auth.workspaceId)
    .first<{ id: string; host: string; site_url: string }>();
  if (!project) return json({ error: 'Project not found.' }, 404);

  if (siteMatch[2] === 'crawl' && request.method === 'POST') {
    const { enqueueCrawl } = await import('./persist.js');
    const jobId = await enqueueCrawl(env, project.id, auth.workspaceId, project.site_url, 'manual');
    return json({ ok: true, jobId });
  }

  if (siteMatch[2] === 'changes') {
    const since = new Date(Date.now() - auth.entitlements.historyDays * 86400_000).toISOString();
    const rows = await env.DB.prepare(
      `SELECT c.code, c.severity, c.url, c.grouped_count, c.created_at
       FROM change_events c
       JOIN snapshots s ON s.id = c.snapshot_id
       JOIN snapshots ps ON ps.id = c.previous_snapshot_id
       LEFT JOIN crawl_jobs j ON j.id = s.job_id
       WHERE c.project_id = ?
         AND c.created_at >= ?
         AND (s.job_id IS NULL OR j.status = 'complete')
         AND ps.declared_urls > 0
       ORDER BY c.created_at DESC
       LIMIT 200`
    )
      .bind(project.id, since)
      .all();
    return json({ host: project.host, changes: rows.results || [] });
  }

  if (siteMatch[2] === 'issues') {
    const rows = await env.DB.prepare(
      'SELECT code, severity, affected_urls, first_seen_at, last_seen_at, resolved_at FROM issues WHERE project_id = ? ORDER BY resolved_at IS NULL DESC'
    )
      .bind(project.id)
      .all();
    return json({ host: project.host, issues: rows.results || [] });
  }

  const snap = await env.DB.prepare(
    `SELECT s.declared_urls, s.errors, s.warnings, s.index_score, s.seo_score, s.sitemap_score, s.generated_at, s.fingerprint
     FROM snapshots s
     LEFT JOIN crawl_jobs j ON j.id = s.job_id
     WHERE s.project_id = ?
       AND (s.job_id IS NULL OR j.status = 'complete')
       AND s.declared_urls > 0
     ORDER BY s.generated_at DESC
     LIMIT 1`
  )
    .bind(project.id)
    .first();
  return json({ site: project, snapshot: snap, period: periodMonth() });
}
