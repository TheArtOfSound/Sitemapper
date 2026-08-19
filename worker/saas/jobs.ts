import type { Result } from '../render.js';
import { resultToSnapshot, saveSnapshot } from './persist.js';
import { newId, nowIso, type CrawlMessage, type Env } from './env.js';

export async function handleScheduled(env: Env): Promise<void> {
  if (!env.DB) return;
  const due = await env.DB.prepare(
    `SELECT m.project_id, m.frequency_minutes, p.workspace_id, p.site_url
     FROM monitors m JOIN projects p ON p.id = m.project_id
     WHERE m.enabled = 1 AND (m.next_run_at IS NULL OR m.next_run_at <= ?)
     LIMIT 20`
  )
    .bind(nowIso())
    .all<{ project_id: string; frequency_minutes: number; workspace_id: string; site_url: string }>();

  for (const row of due.results || []) {
    const running = await env.DB.prepare(
      `SELECT id FROM crawl_jobs WHERE project_id = ? AND status IN ('queued', 'running') LIMIT 1`
    )
      .bind(row.project_id)
      .first();
    if (running) continue;
    const jobId = newId('job');
    const period = new Date().toISOString().slice(0, 13);
    await env.DB.prepare(
      'INSERT OR IGNORE INTO crawl_jobs (id, project_id, workspace_id, kind, status, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(jobId, row.project_id, row.workspace_id, 'scheduled', 'queued', `${row.project_id}:scheduled:${period}`, nowIso())
      .run();
    const next = new Date(Date.now() + row.frequency_minutes * 60_000).toISOString();
    await env.DB.prepare('UPDATE monitors SET last_started_at = ?, next_run_at = ?, last_status = ? WHERE project_id = ?')
      .bind(nowIso(), next, 'queued', row.project_id)
      .run();
    if (env.CRAWLS) {
      await env.CRAWLS.send({
        jobId,
        projectId: row.project_id,
        workspaceId: row.workspace_id,
        kind: 'scheduled',
        siteUrl: row.site_url,
      });
    }
  }
}

export async function handleQueue(batch: MessageBatch<CrawlMessage>, env: Env, analyze: (site: string) => Promise<Result>): Promise<void> {
  for (const message of batch.messages) {
    try {
      await runCrawlJob(env, message.body, analyze);
      message.ack();
    } catch (error) {
      await env.DB.prepare('UPDATE crawl_jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?')
        .bind('failed', error instanceof Error ? error.message : String(error), nowIso(), message.body.jobId)
        .run();
      message.retry();
    }
  }
}

export async function runCrawlJob(env: Env, msg: CrawlMessage, analyze: (site: string) => Promise<Result>): Promise<void> {
  await env.DB.prepare('UPDATE crawl_jobs SET status = ?, started_at = ? WHERE id = ?').bind('running', nowIso(), msg.jobId).run();
  const result = await analyze(msg.siteUrl);
  const snapshot = resultToSnapshot(result);
  const saved = await saveSnapshot(env, { projectId: msg.projectId, jobId: msg.jobId, kind: msg.kind, snapshot });
  await env.DB.prepare('UPDATE crawl_jobs SET status = ?, finished_at = ?, snapshot_id = ? WHERE id = ?')
    .bind('complete', nowIso(), saved.snapshotId, msg.jobId)
    .run();
  await env.DB.prepare('UPDATE monitors SET last_finished_at = ?, last_status = ? WHERE project_id = ?')
    .bind(nowIso(), saved.events.some((event) => event.class === 'critical') ? 'regression' : 'ok', msg.projectId)
    .run();
  await env.DB.prepare(
    `INSERT INTO usage_counters (workspace_id, period, monitored_urls, deep_checks, scans)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(workspace_id, period) DO UPDATE SET
       monitored_urls = MAX(monitored_urls, excluded.monitored_urls),
       deep_checks = deep_checks + excluded.deep_checks,
       scans = scans + 1`
  )
    .bind(msg.workspaceId, new Date().toISOString().slice(0, 7), snapshot.declaredCount, snapshot.urls.filter((row) => row.deepChecked).length)
    .run();

  if (saved.events.some((event) => event.class === 'critical' || event.class === 'warning')) {
    await deliverAlerts(env, msg.projectId, saved.snapshotId, saved.summary, saved.events);
  }
}

async function deliverAlerts(
  env: Env,
  projectId: string,
  snapshotId: string,
  summary: string,
  events: Array<{ code: string; class: string; count: number; summary: string }>
): Promise<void> {
  const project = await env.DB.prepare('SELECT workspace_id, host FROM projects WHERE id = ?').bind(projectId).first<{ workspace_id: string; host: string }>();
  if (!project) return;
  const channels = await env.DB.prepare(
    'SELECT * FROM alert_channels WHERE enabled = 1 AND workspace_id = ? AND (project_id IS NULL OR project_id = ?)'
  )
    .bind(project.workspace_id, projectId)
    .all<{ id: string; type: string; destination: string }>();
  const fingerprint = `${snapshotId}:${events.map((event) => event.code).sort().join(',')}`;
  for (const channel of channels.results || []) {
    const recent = await env.DB.prepare(
      'SELECT id FROM alert_deliveries WHERE project_id = ? AND fingerprint = ? AND created_at > ? LIMIT 1'
    )
      .bind(projectId, fingerprint, new Date(Date.now() - 6 * 3600_000).toISOString())
      .first();
    if (recent) continue;
    let status = 'skipped';
    let detail = '';
    try {
      if (channel.type === 'webhook' || channel.type === 'slack') {
        const res = await fetch(channel.destination, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text: `Sitemapper · ${project.host}\n${summary}`,
            host: project.host,
            snapshotId,
            events: events.slice(0, 25),
          }),
        });
        status = res.ok ? 'sent' : `http_${res.status}`;
        detail = await res.text();
      } else {
        status = 'unconfigured';
        detail = 'Email delivery requires EMAIL_FROM and a mail provider secret.';
      }
    } catch (error) {
      status = 'failed';
      detail = error instanceof Error ? error.message : String(error);
    }
    await env.DB.prepare(
      'INSERT INTO alert_deliveries (id, channel_id, project_id, snapshot_id, fingerprint, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(newId('alr'), channel.id, projectId, snapshotId, fingerprint, status, detail.slice(0, 500), nowIso())
      .run();
  }
}
