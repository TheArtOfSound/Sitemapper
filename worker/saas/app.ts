import { ISSUE_CATALOG, issuePath } from '../../src/issues/catalog.js';
import type { PlanId } from '../../src/plans.js';
import { loadReport } from '../store.js';
import { escapeHtml, humanize } from '../render.js';
import {
  finishGithub,
  finishGoogle,
  finishLogin,
  finishMagicLink,
  finishOortSso,
  logout,
  readSession,
  requireUser,
  startMagicLink,
  startOAuth,
  upsertEmailUser,
  type SessionUser,
} from './auth.js';
import { emailConfigured } from './email.js';
import { billingPortal, handleStripeWebhook, startCheckout } from './billing.js';
import { json, newId, nowIso, originOf, redirect, track, type Env } from './env.js';
import { handleGscRoutes } from './gsc.js';
import {
  appShell,
  dashboardHtml,
  issueEncyclopediaHtml,
  loginHtml,
  pricingHtml,
  siteHtml,
  tablePage,
  toolPageHtml,
} from './html.js';
import { enqueueCrawl, createMonitoredSite, resultToSnapshot, saveSnapshot } from './persist.js';

const TOOLS: Record<string, { title: string; lede: string; focus: string }> = {
  'sitemap-checker': {
    title: 'Free XML sitemap checker',
    lede: 'Paste a site or sitemap URL. We discover robots.txt, walk sitemap indexes, and show live indexability evidence.',
    focus: 'sitemap inventory',
  },
  'xml-sitemap-validator': {
    title: 'XML sitemap validator',
    lede: 'Check whether sitemap files parse, stay on-host, and expose usable URL entries.',
    focus: 'parser and sitemap fetch failures',
  },
  'sitemap-finder': {
    title: 'Sitemap finder',
    lede: 'Find XML sitemaps from robots.txt and common fallback paths, including www/apex variants.',
    focus: 'discovery diagnostics',
  },
  'sitemap-explorer': {
    title: 'Sitemap explorer',
    lede: 'Turn a sitemap into a searchable URL inventory with sections, types, and evidence.',
    focus: 'URL inventory',
  },
  'sitemap-diff': {
    title: 'Sitemap change checker',
    lede: 'Monitoring diffs declared URLs, noindex, canonicals, and HTTP status against the previous snapshot.',
    focus: 'change intelligence',
  },
  'robots-txt-checker': {
    title: 'robots.txt checker',
    lede: 'Parse robots.txt and flag sitemap URLs that Disallow blocks.',
    focus: 'robots conflicts',
  },
  'canonical-checker': {
    title: 'Canonical checker',
    lede: 'Deep-check sampled sitemap URLs for missing, mismatched, or cross-host canonicals.',
    focus: 'canonical evidence',
  },
  'noindex-checker': {
    title: 'noindex checker',
    lede: 'Find sitemap URLs that carry a noindex robots directive.',
    focus: 'noindex-in-sitemap',
  },
  'lastmod-checker': {
    title: 'lastmod checker',
    lede: 'Measure lastmod coverage and freshness decay across the sitemap inventory.',
    focus: 'lastmod coverage',
  },
  'meta-tag-checker': {
    title: 'Meta tag checker',
    lede: 'Sample titles, descriptions, Open Graph, and obvious duplicate metadata.',
    focus: 'metadata',
  },
  'indexability-checker': {
    title: 'Indexability checker',
    lede: 'Reconcile DECLARED sitemap URLs with LIVE fetch state. INDEXED requires Search Console.',
    focus: 'indexability',
  },
};

export async function handleSaas(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/api/stripe/webhook' && request.method === 'POST') {
    return handleStripeWebhook(env, request);
  }

  if (path === '/login' && request.method === 'GET') {
    const user = await readSession(request, env);
    if (user) return redirect(url.searchParams.get('next') || '/app');
    return html(
      loginHtml(url.searchParams.get('next') || '/app', {
        github: Boolean(env.GITHUB_CLIENT_ID),
        google: Boolean(env.GOOGLE_CLIENT_ID),
        dev: env.AUTH_DEV_LOGIN === '1',
        email: emailConfigured(env),
        oort: Boolean(env.OORT_SSO_SECRET || env.FLOWS_SSO_SECRET),
      }, { error: url.searchParams.get('error') || undefined, sent: url.searchParams.get('sent') === '1' })
    );
  }
  if (path === '/login' && request.method === 'POST') {
    const form = await request.formData();
    return startMagicLink(env, request, String(form.get('email') || ''), String(form.get('next') || '/app'));
  }
  if (path === '/logout') return logout(request, env);
  if (path === '/auth/github') return startOAuth(env, request, 'github');
  if (path === '/auth/google') return startOAuth(env, request, 'google');
  if (path === '/auth/github/callback') return finishGithub(env, request);
  if (path === '/auth/google/callback') return finishGoogle(env, request);
  if (path === '/auth/magic') return finishMagicLink(env, request);
  if (path === '/auth/oort/callback') return finishOortSso(env, request);
  if (path === '/auth/dev' && env.AUTH_DEV_LOGIN === '1') {
    const ident = await upsertEmailUser(env, 'dev@localhost');
    await track(env, 'signup_completed', { provider: 'dev' }, ident.userId, ident.workspaceId);
    return finishLogin(env, request, ident.userId, ident.workspaceId, url.searchParams.get('next') || '/app');
  }

  if (path === '/pricing') {
    const user = await readSession(request, env);
    return html(pricingHtml(user), 200, 'public, max-age=300');
  }

  if (path === '/issues') return html(issueEncyclopediaHtml(), 200, 'public, max-age=600');
  if (path.startsWith('/issues/')) {
    const slug = path.slice('/issues/'.length);
    const code = ISSUE_CATALOG.find((row) => issuePath(row.code) === path)?.code || slug.replace(/-/g, '_').toUpperCase();
    return html(issueEncyclopediaHtml(code), 200, 'public, max-age=600');
  }

  if (path.startsWith('/tools/')) {
    const slug = path.slice('/tools/'.length);
    const tool = TOOLS[slug];
    if (!tool) return null;
    return html(toolPageHtml(slug, tool.title, tool.lede, tool.focus), 200, 'public, max-age=600');
  }

  if (path === '/app' || path.startsWith('/app/')) {
    return handleApp(request, env, path, url);
  }

  if (path === '/api/v1/sites' || path.startsWith('/api/v1/')) {
    return handleApi(request, env, path);
  }

  return null;
}

async function handleApp(request: Request, env: Env, path: string, url: URL): Promise<Response> {
  const needed = await requireUser(request, env);
  if (needed instanceof Response) return needed;
  const user = needed;

  const gsc = await handleGscRoutes(request, env, user, path);
  if (gsc) return gsc;

  if (path === '/app' && request.method === 'GET') {
    const sites = await env.DB.prepare(
      `SELECT p.id, p.host, m.last_status, m.last_finished_at, m.next_run_at,
              s.declared_urls, s.index_score, s.errors,
              (SELECT COUNT(*) FROM change_events c WHERE c.project_id = p.id AND c.severity = 'critical' AND c.created_at > ?) AS critical
       FROM projects p
       LEFT JOIN monitors m ON m.project_id = p.id
       LEFT JOIN snapshots s ON s.id = (
         SELECT id FROM snapshots WHERE project_id = p.id ORDER BY generated_at DESC LIMIT 1
       )
       WHERE p.workspace_id = ?
       ORDER BY p.created_at DESC`
    )
      .bind(new Date(Date.now() - 7 * 86400_000).toISOString(), user.workspaceId)
      .all();
    await track(env, 'dashboard_viewed', {}, user.userId, user.workspaceId);
    return html(dashboardHtml(user, (sites.results || []) as never));
  }

  if ((path === '/app/sites/new' || path === '/app/sites') && request.method === 'GET') {
    let site = url.searchParams.get('site') || url.searchParams.get('url') || '';
    const share = url.searchParams.get('share') || '';
    let stored = share ? await loadReport(env.SITEMAPPER_STATS, share) : null;
    if (!site && stored) site = stored.result.site;
    if (!site) return redirect('/');
    const created = await createMonitoredSite(env, user, site, share || undefined);
    if (!created.ok) {
      if (created.status === 402) return redirect(`/pricing?reason=${encodeURIComponent(created.error)}`);
      return json({ error: created.error }, created.status);
    }
    if (stored) {
      await saveSnapshot(env, { projectId: created.projectId, kind: 'anonymous', snapshot: resultToSnapshot(stored.result), isBaseline: true });
    }
    await track(env, 'first_site_saved', { share: Boolean(share) }, user.userId, user.workspaceId);
    await enqueueCrawl(env, created.projectId, user.workspaceId, site, 'manual');
    return redirect(`/app/sites/${created.projectId}`);
  }

  if (path === '/app/sites' && request.method === 'POST') {
    const form = await request.formData();
    const site = String(form.get('site') || '');
    const share = String(form.get('share') || '');
    const created = await createMonitoredSite(env, user, site, share || undefined);
    if (!created.ok) return json({ error: created.error }, created.status);
    if (share) {
      const stored = await loadReport(env.SITEMAPPER_STATS, share);
      if (stored) await saveSnapshot(env, { projectId: created.projectId, kind: 'anonymous', snapshot: resultToSnapshot(stored.result), isBaseline: true });
    }
    await enqueueCrawl(env, created.projectId, user.workspaceId, site, 'manual');
    await track(env, 'monitoring_enabled', {}, user.userId, user.workspaceId);
    return redirect(`/app/sites/${created.projectId}`);
  }

  const siteMatch = path.match(/^\/app\/sites\/([^/]+)(?:\/(changes|urls|issues|history|settings|crawl))?$/);
  if (siteMatch) {
    return handleSite(request, env, user, siteMatch[1], siteMatch[2] || 'overview');
  }

  if (path === '/app/billing' && request.method === 'GET') {
    const body = `
<p class="kicker">${escapeHtml(user.entitlements.plan)} · Stripe ${escapeHtml(user.stripeStatus)}</p>
<h1>Billing</h1>
<p class="lede">Entitlements are read from the workspace subscription on the server. This page never trusts a client-side plan variable.</p>
<div class="card">
  <p>Current plan: <strong style="color:var(--text)">${escapeHtml(user.plan)}</strong></p>
  <p>Sites: ${user.entitlements.sites} · URLs: ${user.entitlements.monitoredUrls.toLocaleString()} · history: ${user.entitlements.historyDays} days</p>
  <div class="actions">
    <form method="post" action="/app/billing/portal"><button class="btn" type="submit">Open billing portal</button></form>
    <a class="btn primary" href="/pricing">Change plan</a>
  </div>
  <p class="hint">${env.STRIPE_SECRET_KEY ? 'Checkout uses Stripe-hosted pages.' : 'Stripe secrets are not configured on this deployment. Checkout is disabled rather than faked.'}</p>
</div>`;
    return html(appShell({ title: 'Billing · Sitemapper', description: 'Billing', body, path: '/app/billing', user }));
  }
  if (path === '/app/billing/checkout' && request.method === 'POST') {
    const form = await request.formData();
    const plan = String(form.get('plan') || 'builder') as PlanId;
    const interval = String(form.get('interval') || 'month') === 'year' ? 'year' : 'month';
    await track(env, 'checkout_started', { plan, interval }, user.userId, user.workspaceId);
    return startCheckout(env, request, user, plan, interval);
  }
  if (path === '/app/billing/portal' && request.method === 'POST') {
    return billingPortal(env, request, user);
  }

  if (path === '/app/settings') {
    const channels = await env.DB.prepare('SELECT id, type, destination, enabled FROM alert_channels WHERE workspace_id = ?')
      .bind(user.workspaceId)
      .all();
    const rows = (channels.results || [])
      .map((row) => `<tr><td>${escapeHtml(String(row.type))}</td><td>${escapeHtml(String(row.destination))}</td><td>${row.enabled ? 'on' : 'off'}</td></tr>`)
      .join('');
    const body = `
<p class="kicker">Workspace</p>
<h1>Settings</h1>
<div class="card">
  <h2>Email alerts</h2>
  <p>Send grouped regression mail from hello@oortstack.com when a crawl finds something that matters.</p>
  <form class="form-row" method="post" action="/app/settings/email">
    <input name="destination" type="email" required placeholder="alerts@yourdomain.com">
    <button type="submit">Add email</button>
  </form>
</div>
<div class="card">
  <h2>Webhook alerts</h2>
  <p>POST a JSON payload when a crawl finds grouped regressions. Slack incoming webhooks work here too.</p>
  <form class="form-row" method="post" action="/app/settings/webhook">
    <input name="destination" type="url" required placeholder="https://hooks.example.com/sitemapper">
    <button type="submit">Add webhook</button>
  </form>
  <div class="table-wrap" style="margin-top:14px"><table class="data"><thead><tr><th>Type</th><th>Destination</th><th>Enabled</th></tr></thead><tbody>${rows || '<tr><td colspan="3">None yet.</td></tr>'}</tbody></table></div>
</div>
<div class="card">
  <h2>API keys</h2>
  <p>${user.entitlements.api ? 'Pro/Agency can mint keys.' : 'API access is included on Pro and Agency.'}</p>
  ${user.entitlements.api ? `<form method="post" action="/app/settings/apikey"><button class="btn" type="submit">Create API key</button></form>` : ''}
</div>`;
    return html(appShell({ title: 'Settings · Sitemapper', description: 'Workspace settings', body, path: '/app/settings', user }));
  }
  if (path === '/app/settings/email' && request.method === 'POST') {
    if (!user.entitlements.emailAlerts) return json({ error: 'Email alerts require Builder or higher.' }, 402);
    const form = await request.formData();
    const destination = String(form.get('destination') || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) return json({ error: 'Valid email required.' }, 400);
    await env.DB.prepare('INSERT INTO alert_channels (id, workspace_id, type, destination, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)')
      .bind(newId('chn'), user.workspaceId, 'email', destination, nowIso())
      .run();
    return redirect('/app/settings');
  }
  if (path === '/app/settings/webhook' && request.method === 'POST') {
    if (!user.entitlements.webhooks) return json({ error: 'Webhooks require Pro or Agency.' }, 402);
    const form = await request.formData();
    const destination = String(form.get('destination') || '');
    if (!/^https:\/\//i.test(destination)) return json({ error: 'HTTPS webhook URL required.' }, 400);
    await env.DB.prepare('INSERT INTO alert_channels (id, workspace_id, type, destination, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)')
      .bind(newId('chn'), user.workspaceId, 'webhook', destination, nowIso())
      .run();
    return redirect('/app/settings');
  }

  return json({ error: 'Not found.' }, 404);
}

async function handleSite(request: Request, env: Env, user: SessionUser, projectId: string, view: string): Promise<Response> {
  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND workspace_id = ?')
    .bind(projectId, user.workspaceId)
    .first<{ id: string; host: string; site_url: string; gsc_property: string | null }>();
  if (!project) return json({ error: 'Project not found.' }, 404);
  const monitor = await env.DB.prepare('SELECT * FROM monitors WHERE project_id = ?')
    .bind(projectId)
    .first<{ enabled: number; frequency_minutes: number; last_status: string | null; next_run_at: string | null; last_finished_at: string | null }>();

  if (view === 'crawl' && request.method === 'POST') {
    await enqueueCrawl(env, project.id, user.workspaceId, project.site_url, 'manual');
    return redirect(`/app/sites/${project.id}`);
  }

  const snapshot = await env.DB.prepare('SELECT * FROM snapshots WHERE project_id = ? ORDER BY generated_at DESC LIMIT 1')
    .bind(projectId)
    .first<{
      id: string;
      r2_key: string;
      declared_urls: number;
      live_urls: number;
      indexable_urls: number;
      errors: number;
      warnings: number;
      index_score: number | null;
      seo_score: number | null;
      sitemap_score: number | null;
      generated_at: string;
      fingerprint: string | null;
    }>();

  if (view === 'overview') {
    const changes = await env.DB.prepare(
      'SELECT code, severity, url, grouped_count, created_at FROM change_events WHERE project_id = ? ORDER BY created_at DESC LIMIT 30'
    )
      .bind(projectId)
      .all();
    return html(
      siteHtml({
        user,
        project,
        monitor: monitor || { enabled: 0, frequency_minutes: 1440, last_status: null, next_run_at: null, last_finished_at: null },
        snapshot: snapshot || null,
        changes: (changes.results || []) as never,
      })
    );
  }

  if (view === 'changes') {
    const changes = await env.DB.prepare(
      'SELECT code, severity, url, grouped_count, before_json, after_json, created_at FROM change_events WHERE project_id = ? ORDER BY created_at DESC LIMIT 200'
    )
      .bind(projectId)
      .all();
    return html(
      tablePage({
        user,
        title: 'Changes',
        path: `/app/sites/${projectId}/changes`,
        kicker: project.host,
        lede: 'Deterministic diffs versus the previous snapshot. Related URLs are grouped so 400 identical noindex events become one alert.',
        headers: ['When', 'Class', 'Event', 'Count', 'URL', 'Before', 'After'],
        rows: (changes.results || []).map((row) => [
          escapeHtml(String(row.created_at).slice(0, 16).replace('T', ' ')),
          escapeHtml(String(row.severity)),
          escapeHtml(humanize(String(row.code))),
          String(row.grouped_count),
          escapeHtml(String(row.url || '—')),
          escapeHtml(String(row.before_json || '—').slice(0, 80)),
          escapeHtml(String(row.after_json || '—').slice(0, 80)),
        ]),
      })
    );
  }

  if (view === 'issues') {
    const issues = await env.DB.prepare(
      'SELECT code, severity, affected_urls, first_seen_at, last_seen_at, resolved_at, evidence FROM issues WHERE project_id = ? ORDER BY resolved_at IS NULL DESC, last_seen_at DESC'
    )
      .bind(projectId)
      .all();
    return html(
      tablePage({
        user,
        title: 'Issues',
        path: `/app/sites/${projectId}/issues`,
        kicker: project.host,
        lede: 'Issue codes are deterministic. Open an encyclopedia page for the evidence definition.',
        headers: ['Code', 'Severity', 'URLs', 'First', 'Last', 'Resolved', 'Evidence'],
        rows: (issues.results || []).map((row) => [
          `<a href="${issuePath(String(row.code))}">${escapeHtml(humanize(String(row.code)))}</a>`,
          escapeHtml(String(row.severity)),
          String(row.affected_urls),
          escapeHtml(String(row.first_seen_at).slice(0, 10)),
          escapeHtml(String(row.last_seen_at).slice(0, 10)),
          row.resolved_at ? escapeHtml(String(row.resolved_at).slice(0, 10)) : 'open',
          escapeHtml(String(row.evidence || '').slice(0, 80)),
        ]),
      })
    );
  }

  if (view === 'history') {
    const snaps = await env.DB.prepare(
      'SELECT id, generated_at, declared_urls, errors, warnings, index_score, seo_score, sitemap_score, fingerprint FROM snapshots WHERE project_id = ? ORDER BY generated_at DESC LIMIT 50'
    )
      .bind(projectId)
      .all();
    return html(
      tablePage({
        user,
        title: 'History',
        path: `/app/sites/${projectId}/history`,
        kicker: project.host,
        lede: 'Each successful crawl is an immutable snapshot. Compare scores and URL counts over time.',
        headers: ['When', 'URLs', 'Errors', 'Warnings', 'Index', 'SEO', 'Sitemap', 'Fingerprint'],
        rows: (snaps.results || []).map((row) => [
          escapeHtml(String(row.generated_at).slice(0, 16).replace('T', ' ')),
          String(row.declared_urls),
          String(row.errors),
          String(row.warnings),
          String(row.index_score ?? '—'),
          String(row.seo_score ?? '—'),
          String(row.sitemap_score ?? '—'),
          escapeHtml(String(row.fingerprint || '—')),
        ]),
      })
    );
  }

  if (view === 'urls') {
    if (!snapshot) {
      return html(
        tablePage({
          user,
          title: 'URLs',
          path: `/app/sites/${projectId}/urls`,
          kicker: project.host,
          lede: 'No snapshot yet.',
          headers: ['URL'],
          rows: [],
        })
      );
    }
    const obj = await env.SNAPSHOTS.get(snapshot.r2_key);
    const parsed = obj ? (JSON.parse(await obj.text()) as { urls: Array<{ url: string; status?: number; title?: string; canonical?: string; noindex: boolean; robotsAllowed: boolean; lastmod?: string; deepChecked: boolean }> }) : { urls: [] };
    const q = (new URL(request.url).searchParams.get('q') || '').toLowerCase();
    const rows = parsed.urls
      .filter((row) => !q || row.url.toLowerCase().includes(q) || (row.title || '').toLowerCase().includes(q))
      .slice(0, 500)
      .map((row) => [
        `<a href="${escapeHtml(row.url)}">${escapeHtml(row.url)}</a>`,
        String(row.status ?? '—'),
        row.deepChecked ? 'deep' : 'index',
        row.noindex ? 'noindex' : row.robotsAllowed ? 'indexable?' : 'robots-blocked',
        escapeHtml(row.title || '—'),
        escapeHtml(row.canonical || '—'),
        escapeHtml(row.lastmod || '—'),
        'unknown',
      ]);
    return html(
      tablePage({
        user,
        title: 'URL explorer',
        path: `/app/sites/${projectId}/urls`,
        kicker: project.host,
        lede: 'Live fetch state from the latest snapshot. Google column stays unknown unless Search Console is connected — we do not infer indexing from HTTP 200.',
        headers: ['URL', 'Status', 'Mode', 'Indexability', 'Title', 'Canonical', 'lastmod', 'Google'],
        rows,
      })
    );
  }

  if (view === 'settings' && request.method === 'GET') {
    const body = `
<p class="kicker">${escapeHtml(project.host)}</p>
<h1>Site settings</h1>
<div class="card">
  <h2>Monitoring</h2>
  <p>Frequency is capped by plan (${user.entitlements.frequencyMinutes} minutes). Sitemapper diffs robots/sitemaps often and deep-checks new, changed, broken, and high-value URLs.</p>
  <form method="post">
    <label><input type="checkbox" name="enabled" value="1" ${monitor?.enabled ? 'checked' : ''}> Enabled</label>
    <div class="actions" style="margin-top:12px"><button class="btn primary" type="submit">Save</button></div>
  </form>
</div>
<div class="card">
  <h2>Search Console</h2>
  <p>${project.gsc_property ? escapeHtml(project.gsc_property) : 'Not linked. Connect Google, then match a property. Indexed state stays unknown until then.'}</p>
  <a class="btn" href="/auth/google?next=/app/sites/${project.id}/settings">Connect Google</a>
</div>`;
    return html(appShell({ title: `Settings · ${project.host}`, description: 'Site settings', body, path: `/app/sites/${project.id}/settings`, user }));
  }
  if (view === 'settings' && request.method === 'POST') {
    const form = await request.formData();
    const enabled = form.get('enabled') === '1' ? 1 : 0;
    await env.DB.prepare('UPDATE monitors SET enabled = ? WHERE project_id = ?').bind(enabled, projectId).run();
    return redirect(`/app/sites/${projectId}/settings`);
  }

  return json({ error: 'Not found.' }, 404);
}

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return json({ error: 'Missing Bearer token.' }, 401);
  // API key path is minted later; keep a real 401 rather than a fake success.
  void path;
  void env;
  return json({ error: 'Invalid API key.' }, 401);
}

function html(markup: string, status = 200, cache = 'no-store'): Response {
  return new Response(markup, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cache },
  });
}

export { originOf };
