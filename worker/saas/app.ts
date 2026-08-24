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
import { json, newId, nowIso, originOf, randomToken, redirect, sha256Hex, track, type Env } from './env.js';
import { evaluateGuard } from '../../src/guard.js';
import type { CrawlSnapshot } from '../../src/diff/snapshot.js';
import { handleGscRoutes } from './gsc.js';
import {
  addSiteHtml,
  appShell,
  dashboardHtml,
  incidentHtml,
  issueEncyclopediaHtml,
  loginHtml,
  pricingHtml,
  siteHtml,
  sitesListHtml,
  tablePage,
  toolPageHtml,
} from './html.js';
import { mintApiKey, handlePublicApi } from './api.js';
import { inspectUrl, inspectUrlStates, listGscProperties, submitSitemap } from './gsc.js';
import { enqueueCrawl, createMonitoredSite, resultToSnapshot, saveSnapshot } from './persist.js';
import { sendEmail } from './email.js';

type WorkspaceChangeEvent = {
  id: string;
  host: string;
  projectId: string;
  code: string;
  severity: string;
  url: string | null;
  before_json: string | null;
  after_json: string | null;
  created_at: string;
  grouped_count: number;
};

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

function sevPill(sev: string): string {
  const s = sev === 'critical' || sev === 'error' ? 'critical' : sev === 'warning' ? 'high' : 'medium';
  const label = s === 'critical' ? 'Critical' : s === 'high' ? 'High' : 'Medium';
  return `<span class="pill ${s}">${label}</span>`;
}

const WORKSPACE_SITES_SQL = `SELECT p.id, p.host, m.last_status, m.last_finished_at, m.next_run_at,
              s.declared_urls, s.index_score, s.errors,
              (SELECT COUNT(*)
               FROM change_events c
               JOIN snapshots cs ON cs.id = c.snapshot_id
               JOIN snapshots ps ON ps.id = c.previous_snapshot_id
               LEFT JOIN crawl_jobs cj ON cj.id = cs.job_id
               WHERE c.project_id = p.id
                 AND c.severity = 'critical'
                 AND c.created_at > ?
                 AND (cs.job_id IS NULL OR cj.status = 'complete')
                 AND ps.declared_urls > 0) AS critical
       FROM projects p
       LEFT JOIN monitors m ON m.project_id = p.id
       LEFT JOIN snapshots s ON s.id = (
         SELECT ss.id
         FROM snapshots ss
         LEFT JOIN crawl_jobs sj ON sj.id = ss.job_id
         WHERE ss.project_id = p.id
           AND (ss.job_id IS NULL OR sj.status = 'complete')
           AND ss.declared_urls > 0
         ORDER BY ss.generated_at DESC
         LIMIT 1
       )
       WHERE p.workspace_id = ?
       ORDER BY p.created_at DESC`;

type WorkspaceSiteRow = {
  id: string;
  host: string;
  last_status: string | null;
  last_finished_at: string | null;
  next_run_at: string | null;
  declared_urls: number | null;
  index_score: number | null;
  errors: number | null;
  critical: number | null;
};

async function listWorkspaceSites(env: Env, workspaceId: string): Promise<WorkspaceSiteRow[]> {
  const sites = await env.DB.prepare(WORKSPACE_SITES_SQL)
    .bind(new Date(Date.now() - 7 * 86400_000).toISOString(), workspaceId)
    .all<WorkspaceSiteRow>();
  return sites.results || [];
}

export function wantsJson(request: Request): boolean {
  const accept = (request.headers.get('accept') || '').toLowerCase();
  if (/\btext\/html\b/.test(accept)) return false;
  return /\bapplication\/json\b/.test(accept);
}

export function planLimitBillingPath(error: string): string {
  return `/app/billing?reason=${encodeURIComponent(error)}`;
}

export function matchLoggedInAppRoute(
  method: string,
  path: string,
  search: URLSearchParams = new URLSearchParams()
): string {
  if (method === 'GET' && path === '/app/sites') return 'sites-list';
  if (method === 'GET' && path === '/app/sites/new') {
    if (search.get('site') || search.get('url') || search.get('share')) return 'sites-new-autocreate';
    return 'sites-new-form';
  }
  if (method === 'POST' && path === '/app/sites') return 'sites-create';
  const siteMatch = path.match(/^\/app\/sites\/([^/]+)(?:\/(changes|urls|issues|history|settings|crawl|export|guard))?$/);
  if (siteMatch && siteMatch[1] !== 'new') return `site:${siteMatch[1]}:${siteMatch[2] || 'overview'}`;
  if (method === 'GET' && path === '/app/billing') return 'billing';
  if (method === 'GET' && path === '/app/settings') return 'settings';
  if (method === 'GET' && path === '/app/alerts') return 'alerts-redirect';
  return 'unmatched';
}

function planGate(enabled: boolean, live: string, locked: string): string {
  return enabled ? live : `${locked} <a href="/app/billing">Billing</a>`;
}

export function workspaceSettingsBody(
  user: SessionUser,
  channels: Array<Record<string, unknown>>,
  opts: { googleClientId?: boolean } = {}
): string {
  const rows = channels
    .map(
      (row) =>
        `<tr><td>${escapeHtml(String(row.type))}</td><td>${escapeHtml(String(row.destination))}</td><td>${row.enabled ? 'on' : 'off'}</td></tr>`
    )
    .join('');
  return `
<p class="kicker">Workspace</p>
<h1>Settings</h1>
<div class="actions">
  <a class="btn primary" href="/app/sites/new">Add site</a>
  <a class="btn" href="/app/billing">Billing</a>
  <a class="btn" href="/logout">Sign out</a>
</div>
<div class="dash-grid">
  <div>
    <div class="card" id="alerts">
      <div class="card-head"><h2>Email alerts</h2></div>
      <p>${planGate(
        user.entitlements.emailAlerts,
        'Send grouped regression mail from hello@oortstack.com when a crawl finds something that matters.',
        'Email alerts start on Builder.'
      )}</p>
      ${user.entitlements.emailAlerts ? `<form class="form-row" method="post" action="/app/settings/email">
    <input name="destination" type="email" required placeholder="alerts@yourdomain.com">
    <button type="submit">Add email</button>
  </form>` : ''}
    </div>
    <div class="card">
      <div class="card-head"><h2>Webhooks</h2></div>
      <p>${planGate(
        user.entitlements.webhooks,
        'POST a JSON payload when a crawl finds grouped regressions.',
        'Webhooks are on Pro and Agency.'
      )}</p>
      ${user.entitlements.webhooks ? `<form class="form-row" method="post" action="/app/settings/webhook">
    <input name="destination" type="url" required placeholder="https://hooks.example.com/sitemapper">
    <button type="submit">Add webhook</button>
  </form>` : ''}
      <div class="table-wrap" style="margin-top:14px"><table class="data"><thead><tr><th>Type</th><th>Destination</th><th>Enabled</th></tr></thead><tbody>${rows || '<tr><td colspan="3">None yet.</td></tr>'}</tbody></table></div>
      ${user.entitlements.emailAlerts || user.entitlements.webhooks || user.entitlements.slack ? `<form method="post" action="/app/settings/test-alert" style="margin-top:12px"><button class="btn" type="submit">Send test alert</button></form>` : ''}
    </div>
    <div class="card">
      <div class="card-head"><h2>Slack</h2></div>
      <p>${planGate(user.entitlements.slack, 'Incoming webhook URL from Slack.', 'Slack routing is on Pro and Agency.')}</p>
      ${user.entitlements.slack ? `<form class="form-row" method="post" action="/app/settings/slack"><input name="destination" type="url" required placeholder="https://hooks.slack.com/services/..."><button type="submit">Add Slack</button></form>` : ''}
    </div>
    <div class="card">
      <div class="card-head"><h2>API keys</h2></div>
      <p>${planGate(
        user.entitlements.api,
        'Bearer keys for /api/v1/sites, /changes, /issues, /crawl.',
        'API access is included on Pro and Agency.'
      )}</p>
      ${user.entitlements.api ? `<form method="post" action="/app/settings/apikey"><button class="btn" type="submit">Create API key</button></form>` : ''}
    </div>
  </div>
  <div>
    <div class="card">
      <div class="card-head"><h2>Team</h2></div>
      <p>${user.entitlements.teamMembers} seat${user.entitlements.teamMembers === 1 ? '' : 's'} on this plan.</p>
      ${user.entitlements.teamMembers > 1 ? `<form class="form-row" method="post" action="/app/settings/invite"><input name="email" type="email" required placeholder="teammate@agency.com"><button type="submit">Invite</button></form>` : ''}
    </div>
    <div class="card">
      <div class="card-head"><h2>Branded reports</h2></div>
      <p>${planGate(
        user.entitlements.brandedReports,
        `Client-facing reports use ${escapeHtml(user.brandName || 'your name')} instead of Sitemapper.`,
        'Branded reports are on Agency.'
      )}</p>
      ${user.entitlements.brandedReports ? `<form class="form-row" method="post" action="/app/settings/brand"><input name="brand_name" required placeholder="Northwind SEO" value="${escapeHtml(user.brandName || '')}"><button type="submit">Save brand</button></form>` : ''}
    </div>
    <div class="card">
      <div class="card-head"><h2>GitHub Action</h2></div>
      <p>${planGate(
        user.entitlements.ciGuard,
        'Fails a deploy on deterministic regressions only — sitemap gone, URL drop, new noindex, 5xx. Run it against the last two snapshots on a site, or in GitHub Actions.',
        'CI guard is on Builder+.'
      )}</p>
      ${user.entitlements.ciGuard ? `<pre style="white-space:pre-wrap;font:12px/1.4 var(--mono);color:var(--mute)">- uses: TheArtOfSound/Sitemapper@main
  with:
    site: https://YOUR-DOMAIN
    baseline: sitemapper-baseline.json</pre>
  <p class="hint">Or: <code>npx sitemapper guard --current now.json --baseline before.json</code></p>` : ''}
    </div>
    <div class="card">
      <div class="card-head"><h2>Search Console</h2></div>
      <p>${planGate(
        user.entitlements.gsc,
        'Attach a property on a site. HTTP 200 is never treated as indexed. URL Inspection does not request indexing.',
        'GSC is on Pro and Agency. HTTP 200 is never treated as indexed.'
      )}</p>
      ${user.entitlements.gsc ? `<div class="actions">${opts.googleClientId ? `<a class="btn" href="/auth/google?next=/app/gsc">Connect a Google account</a>` : ''}<a class="btn primary" href="/app/gsc">Properties</a></div>` : ''}
    </div>
  </div>
</div>`;
}

export function billingPageBody(
  user: SessionUser,
  opts: { stripeConfigured: boolean; reason?: string | null; checkout?: string | null }
): string {
  const reason = opts.reason
    ? `<div class="card">
  <div class="card-head"><h2>Notice</h2></div>
  <p>${escapeHtml(opts.reason)}</p>
</div>`
    : '';
  const checkout =
    opts.checkout === 'success'
      ? `<div class="card">
  <div class="card-head"><h2>Checkout</h2></div>
  <p>Checkout completed. Entitlements update after Stripe confirms the subscription.</p>
</div>`
      : '';
  return `
<p class="kicker">${escapeHtml(user.entitlements.plan)} · Stripe ${escapeHtml(user.stripeStatus)}</p>
<h1>Billing</h1>
<p class="lede">Entitlements are read from the workspace subscription on the server. This page never trusts a client-side plan variable.</p>
<div class="actions">
  <a class="btn primary" href="/app/sites/new">Add site</a>
  <a class="btn" href="/app/settings">Settings</a>
</div>
${reason}
${checkout}
<div class="stat-band">
  <div class="score"><span>Plan</span><b>${escapeHtml(user.entitlements.plan)}</b><small>${escapeHtml(user.plan)}</small></div>
  <div class="score"><span>Sites quota</span><b>${user.entitlements.sites}</b><small>this workspace</small></div>
  <div class="score"><span>URLs quota</span><b>${user.entitlements.monitoredUrls.toLocaleString()}</b><small>${user.entitlements.historyDays} day history</small></div>
</div>
<div class="card">
  <div class="card-head"><h2>Subscription</h2></div>
  <div class="actions">
    <form method="post" action="/app/billing/portal"><button class="btn" type="submit">Open billing portal</button></form>
    <a class="btn primary" href="/pricing">Change plan</a>
  </div>
  <p class="hint">${opts.stripeConfigured ? 'Checkout uses Stripe-hosted pages.' : 'Stripe secrets are not configured on this deployment. Checkout is disabled rather than faked.'}</p>
</div>`;
}

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
  if (path === '/join' && request.method === 'GET') {
    const token = url.searchParams.get('token') || '';
    const needed = await requireUser(request, env, `/join?token=${encodeURIComponent(token)}`);
    if (needed instanceof Response) return needed;
    const hash = await sha256Hex(token);
    const invite = await env.DB.prepare('SELECT * FROM invites WHERE token_hash = ?')
      .bind(hash)
      .first<{ workspace_id: string; email: string; expires_at: string; accepted_at: string | null }>();
    if (!invite || invite.accepted_at || Date.parse(invite.expires_at) < Date.now()) {
      return html(
        appShell({
          title: 'Invite expired',
          description: 'Invite expired',
          body: `<p class="kicker">Workspace</p>
<h1>Invite expired</h1>
<p class="lede">This invite is invalid, already accepted, or past its expiry.</p>
<div class="card">
  <div class="card-head"><h2>Join</h2></div>
  <p>Ask the workspace owner to send a new invite, then try again.</p>
  <div class="actions"><a class="btn primary" href="/app">Go to app</a></div>
</div>`,
          path: '/join',
          user: needed,
        })
      );
    }
    await env.DB.prepare('INSERT OR IGNORE INTO memberships (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
      .bind(invite.workspace_id, needed.userId, 'member', nowIso())
      .run();
    await env.DB.prepare('UPDATE invites SET accepted_at = ? WHERE token_hash = ?').bind(nowIso(), hash).run();
    return redirect('/app');
  }
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

  const api = await handlePublicApi(request, env, path);
  if (api) return api;

  return null;
}

async function handleApp(request: Request, env: Env, path: string, url: URL): Promise<Response> {
  const needed = await requireUser(request, env);
  if (needed instanceof Response) return needed;
  const user = needed;

  const gsc = await handleGscRoutes(request, env, user, path);
  if (gsc) return gsc;

  if (path === '/app' && request.method === 'GET') {
    const sites = await listWorkspaceSites(env, user.workspaceId);
    const events = await env.DB.prepare(
      `SELECT c.id, p.host, p.id AS projectId, c.code, c.severity, c.url, c.before_json, c.after_json, c.created_at, c.grouped_count
       FROM change_events c
       JOIN projects p ON p.id = c.project_id
       JOIN snapshots s ON s.id = c.snapshot_id
       JOIN snapshots ps ON ps.id = c.previous_snapshot_id
       LEFT JOIN crawl_jobs j ON j.id = s.job_id
       WHERE p.workspace_id = ?
         AND (s.job_id IS NULL OR j.status = 'complete')
       AND ps.declared_urls > 0
       ORDER BY c.created_at DESC
       LIMIT 100`
    )
      .bind(user.workspaceId)
      .all<WorkspaceChangeEvent>();
    const priorityEvents = await env.DB.prepare(
      `SELECT c.id, p.host, p.id AS projectId, c.code, c.severity, c.url, c.before_json, c.after_json, c.created_at, c.grouped_count
       FROM change_events c
       JOIN projects p ON p.id = c.project_id
       JOIN snapshots s ON s.id = c.snapshot_id
       JOIN snapshots ps ON ps.id = c.previous_snapshot_id
       LEFT JOIN crawl_jobs j ON j.id = s.job_id
       WHERE p.workspace_id = ?
         AND c.severity IN ('critical', 'warning')
         AND (s.job_id IS NULL OR j.status = 'complete')
         AND ps.declared_urls > 0
       ORDER BY c.created_at DESC
       LIMIT 8`
    )
      .bind(user.workspaceId)
      .all<WorkspaceChangeEvent>();
    await track(env, 'dashboard_viewed', {}, user.userId, user.workspaceId);
    return html(dashboardHtml(user, sites, events.results || [], priorityEvents.results || []));
  }

  if (path === '/app/changes' && request.method === 'GET') {
    const events = await env.DB.prepare(
      `SELECT c.id, p.host, p.id AS projectId, c.code, c.severity, c.url, c.before_json, c.after_json, c.created_at, c.grouped_count
       FROM change_events c
       JOIN projects p ON p.id = c.project_id
       JOIN snapshots s ON s.id = c.snapshot_id
       JOIN snapshots ps ON ps.id = c.previous_snapshot_id
       LEFT JOIN crawl_jobs j ON j.id = s.job_id
       WHERE p.workspace_id = ?
         AND (s.job_id IS NULL OR j.status = 'complete')
         AND ps.declared_urls > 0
       ORDER BY c.created_at DESC
       LIMIT 100`
    )
      .bind(user.workspaceId)
      .all<WorkspaceChangeEvent>();
    return html(
      tablePage({
        user,
        title: 'Changes',
        path: '/app/changes',
        kicker: 'Workspace',
        lede: 'Recent change events across monitored sites. Related URLs are grouped so identical diffs become one row.',
        headers: ['When', 'Site', 'Class', 'Event', 'Count', 'URL'],
        rows: (events.results || []).map((row) => [
          escapeHtml(String(row.created_at).slice(0, 16).replace('T', ' ')),
          `<a href="/app/sites/${encodeURIComponent(row.projectId)}/changes">${escapeHtml(row.host)}</a>`,
          sevPill(row.severity),
          `<a href="/app/sites/${encodeURIComponent(row.projectId)}/changes?event=${encodeURIComponent(row.id)}">${escapeHtml(humanize(row.code))}</a>`,
          String(row.grouped_count),
          escapeHtml(row.url || '—'),
        ]),
      })
    );
  }

  if (path === '/app/sites' && request.method === 'GET') {
    const sites = await listWorkspaceSites(env, user.workspaceId);
    return html(sitesListHtml(user, sites));
  }

  if (path === '/app/sites/new' && request.method === 'GET') {
    let site = url.searchParams.get('site') || url.searchParams.get('url') || '';
    const share = url.searchParams.get('share') || '';
    const stored = share ? await loadReport(env.SITEMAPPER_STATS, share) : null;
    if (!site && stored) site = stored.result.site;
    if (!site) return html(addSiteHtml(user));
    if (stored?.result.scores.available === false) {
      return json({ error: 'This survey was inconclusive and cannot be used as a monitoring baseline. Run it again first.' }, 409);
    }
    const created = await createMonitoredSite(env, user, site, share || undefined);
    if (!created.ok) {
      if (created.status === 402) return redirect(planLimitBillingPath(created.error));
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
    const stored = share ? await loadReport(env.SITEMAPPER_STATS, share) : null;
    if (stored?.result.scores.available === false) {
      return json({ error: 'This survey was inconclusive and cannot be used as a monitoring baseline. Run it again first.' }, 409);
    }
    const created = await createMonitoredSite(env, user, site, share || undefined);
    if (!created.ok) {
      if (created.status === 402) {
        if (wantsJson(request)) return json({ error: created.error }, 402);
        return html(addSiteHtml(user, { error: created.error }), 402);
      }
      return json({ error: created.error }, created.status);
    }
    if (stored) await saveSnapshot(env, { projectId: created.projectId, kind: 'anonymous', snapshot: resultToSnapshot(stored.result), isBaseline: true });
    await enqueueCrawl(env, created.projectId, user.workspaceId, site, 'manual');
    await track(env, 'monitoring_enabled', {}, user.userId, user.workspaceId);
    return redirect(`/app/sites/${created.projectId}`);
  }

  const siteMatch = path.match(/^\/app\/sites\/([^/]+)(?:\/(changes|urls|issues|history|settings|crawl|export|guard))?$/);
  if (siteMatch && siteMatch[1] !== 'new') {
    return handleSite(request, env, user, siteMatch[1], siteMatch[2] || 'overview');
  }

  if (path === '/app/billing' && request.method === 'GET') {
    const body = billingPageBody(user, {
      stripeConfigured: Boolean(env.STRIPE_SECRET_KEY),
      reason: url.searchParams.get('reason'),
      checkout: url.searchParams.get('checkout'),
    });
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

  if (path === '/app/alerts' && request.method === 'GET') {
    return redirect('/app/settings#alerts');
  }

  if (path === '/app/settings') {
    const channels = await env.DB.prepare('SELECT id, type, destination, enabled FROM alert_channels WHERE workspace_id = ?')
      .bind(user.workspaceId)
      .all();
    const body = workspaceSettingsBody(user, channels.results || [], { googleClientId: Boolean(env.GOOGLE_CLIENT_ID) });
    return html(appShell({ title: 'Settings · Sitemapper', description: 'Workspace settings', body, path: '/app/settings', user, wide: true }));
  }
  if (path === '/app/settings/apikey' && request.method === 'POST') {
    if (!user.entitlements.api) return json({ error: 'API keys require Pro or Agency.' }, 402);
    const minted = await mintApiKey(env, user.workspaceId, 'default');
    const body = `<p class="kicker">API</p>
<h1>Copy this key now</h1>
<p class="lede">It will not be shown again.</p>
<div class="card">
  <div class="card-head"><h2>API key</h2></div>
  <pre id="apikey">${escapeHtml(minted.plaintext)}</pre>
  <div class="actions"><button type="button" class="btn" data-copy="apikey">Copy</button></div>
</div>
<p><a href="/app/settings">Back to settings</a></p>`;
    return html(appShell({ title: 'API key · Sitemapper', description: 'New API key', body, path: '/app/settings/apikey', user }));
  }
  if (path === '/app/settings/slack' && request.method === 'POST') {
    if (!user.entitlements.slack) return json({ error: 'Slack requires Pro or Agency.' }, 402);
    const form = await request.formData();
    const destination = String(form.get('destination') || '');
    if (!/^https:\/\/hooks\.slack\.com\//i.test(destination)) return json({ error: 'Use a Slack incoming webhook URL.' }, 400);
    await env.DB.prepare('INSERT INTO alert_channels (id, workspace_id, type, destination, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)')
      .bind(newId('chn'), user.workspaceId, 'slack', destination, nowIso())
      .run();
    return redirect('/app/settings');
  }
  if (path === '/app/settings/invite' && request.method === 'POST') {
    if (user.entitlements.teamMembers < 2) return json({ error: 'Team seats require Pro or Agency.' }, 402);
    const members = await env.DB.prepare('SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ?').bind(user.workspaceId).first<{ n: number }>();
    if (Number(members?.n || 0) >= user.entitlements.teamMembers) return json({ error: 'Seat limit reached.' }, 402);
    const form = await request.formData();
    const email = String(form.get('email') || '').trim().toLowerCase();
    const raw = await randomToken(16);
    await env.DB.prepare('INSERT INTO invites (id, workspace_id, email, role, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(newId('inv'), user.workspaceId, email, 'member', await sha256Hex(raw), nowIso(), new Date(Date.now() + 7 * 86400_000).toISOString())
      .run();
    const link = `${originOf(request, env)}/join?token=${raw}`;
    await sendEmail(env, {
      to: email,
      subject: 'Join a Sitemapper workspace',
      text: `You were invited to a Sitemapper workspace.\n${link}\n`,
      html: `<p>You were invited to a Sitemapper workspace.</p><p><a href="${link}">${link}</a></p>`,
    });
    return redirect('/app/settings');
  }
  if (path === '/app/settings/brand' && request.method === 'POST') {
    if (!user.entitlements.brandedReports) return json({ error: 'Branded reports require Agency.' }, 402);
    const form = await request.formData();
    const brand = String(form.get('brand_name') || '').trim().slice(0, 80);
    await env.DB.prepare('UPDATE workspaces SET brand_name = ? WHERE id = ?').bind(brand || null, user.workspaceId).run();
    return redirect('/app/settings');
  }
  if (path === '/app/gsc' && request.method === 'GET') {
    if (!user.entitlements.gsc) return json({ error: 'Search Console requires Pro or Agency.' }, 402);
    const listing = await listGscProperties(env, user);
    const notice = url.searchParams.get('note');
    const props = (listing.properties || [])
      .map((p) => `<tr><td>${escapeHtml(p.siteUrl)}</td><td>${escapeHtml(p.permissionLevel)}</td></tr>`)
      .join('');
    const propertyOptions = (listing.properties || [])
      .map((p) => `<option value="${escapeHtml(p.siteUrl)}">${escapeHtml(p.siteUrl)}</option>`)
      .join('');
    const body = `<p class="kicker">Google</p>
      <h1>Search Console</h1>
      <p class="lede">${listing.connected ? 'Authorized properties from the connected Google account. Attach one on a site’s settings. URL Inspection does not request indexing.' : listing.note || 'Not connected.'}</p>
      ${listing.error ? `<div class="verdict"><strong>${escapeHtml(listing.error)}</strong></div>` : ''}
      ${notice ? `<div class="verdict"><strong>${escapeHtml(notice)}</strong></div>` : ''}
      ${listing.connected ? `<div class="card">
        <div class="card-head"><h2>Properties</h2></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Property</th><th>Permission</th></tr></thead><tbody>${props || '<tr><td colspan="2">No properties on this Google account.</td></tr>'}</tbody></table></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Inspect a URL</h2></div>
        <p>Reports Google’s known index state. This does not request indexing.</p>
        <form class="form-row" method="post" action="/app/gsc/inspect">
          <select name="siteUrl" required>${propertyOptions}</select>
          <input name="inspectionUrl" type="url" required placeholder="https://example.com/page">
          <button type="submit">Inspect</button>
        </form>
      </div>
      <div class="card">
        <div class="card-head"><h2>Submit a sitemap</h2></div>
        <p>A hint to Google, not a guarantee those URLs will be indexed.</p>
        <form class="form-row" method="post" action="/app/gsc/sitemaps/submit">
          <select name="siteUrl" required>${propertyOptions}</select>
          <input name="feedpath" type="url" required placeholder="https://example.com/sitemap.xml">
          <button type="submit">Submit hint</button>
        </form>
      </div>` : env.GOOGLE_CLIENT_ID ? `<div class="card"><div class="card-head"><h2>Connect</h2></div><p>Authorize a Google account to list Search Console properties.</p><div class="actions"><a class="btn primary" href="/auth/google?next=/app/gsc">Connect Google</a></div></div>` : `<div class="card"><div class="card-head"><h2>Properties</h2></div><p>Search Console for this workspace uses the operator Google login already authorized on this Mac. Properties should appear after the first successful list.</p></div>`}
      <p class="hint">Sitemap submission is a hint, not a guarantee of indexing. HTTP 200 is not indexed.</p>`;
    return html(appShell({ title: 'Search Console · Sitemapper', description: 'GSC properties', body, path: '/app/gsc', user, wide: true }));
  }
  if (path === '/app/gsc/inspect' && request.method === 'POST') {
    if (!user.entitlements.gsc) return json({ error: 'Search Console requires Pro or Agency.' }, 402);
    const form = await request.formData();
    const siteUrl = String(form.get('siteUrl') || '');
    const inspectionUrl = String(form.get('inspectionUrl') || '');
    const result = (await inspectUrl(env, user, siteUrl, inspectionUrl)) as {
      coverageState?: string | null;
      verdict?: string | null;
      lastCrawlTime?: string | null;
      error?: string;
      inspection?: { inspectionResult?: { inspectionResultLink?: string } };
    };
    const link = result.inspection?.inspectionResult?.inspectionResultLink;
    const body = `<p class="kicker">Google</p>
      <h1>URL Inspection</h1>
      <div class="card">
        <div class="card-head"><h2>Inspection</h2></div>
        <ul class="list">
          <li><strong>URL</strong>${escapeHtml(inspectionUrl)}</li>
          <li><strong>Property</strong>${escapeHtml(siteUrl)}</li>
          <li><strong>Coverage</strong>${escapeHtml(result.coverageState || result.verdict || result.error || 'unknown')}</li>
          <li><strong>Last Google crawl</strong>${escapeHtml(result.lastCrawlTime || 'unknown')}</li>
        </ul>
        <p class="hint">This is Google’s known index state. It is not a request to index. HTTP 200 is not indexed.</p>
        ${link ? `<div class="actions"><a class="btn" href="${escapeHtml(link)}">Open in Search Console</a></div>` : ''}
      </div>
      <p><a href="/app/gsc">Back to properties</a></p>`;
    return html(appShell({ title: 'Inspect · Sitemapper', description: 'URL Inspection', body, path: '/app/gsc/inspect', user }));
  }
  if (path === '/app/gsc/sitemaps/submit' && request.method === 'POST') {
    if (!user.entitlements.gsc) return json({ error: 'Search Console requires Pro or Agency.' }, 402);
    const form = await request.formData();
    const submitted = (await submitSitemap(env, user, String(form.get('siteUrl') || ''), String(form.get('feedpath') || ''))) as {
      ok?: boolean;
      status?: number;
      note?: string;
    };
    const note = submitted.ok ? `Sitemap hint accepted (${submitted.status}).` : `Sitemap hint failed (${submitted.status}). ${submitted.note || ''}`;
    return redirect(`/app/gsc?note=${encodeURIComponent(note)}`);
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
  if (path === '/app/settings/test-alert' && request.method === 'POST') {
    if (!user.entitlements.emailAlerts && !user.entitlements.webhooks && !user.entitlements.slack) {
      return json({ error: 'Alerts require Builder or higher.' }, 402);
    }
    const channels = await env.DB.prepare('SELECT id, type, destination FROM alert_channels WHERE workspace_id = ? AND enabled = 1')
      .bind(user.workspaceId)
      .all<{ id: string; type: string; destination: string }>();
    const payload = {
      text: `Sitemapper test alert for ${user.email || user.workspaceId}`,
      host: 'test',
      test: true,
      events: [{ code: 'TEST_ALERT', class: 'notice', count: 1, summary: 'Manual test from Settings.' }],
    };
    for (const channel of channels.results || []) {
      let status = 'skipped';
      let detail = '';
      try {
        if (channel.type === 'webhook' || channel.type === 'slack') {
          const res = await fetch(channel.destination, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          status = res.ok ? 'sent' : `http_${res.status}`;
          detail = (await res.text()).slice(0, 500);
        } else if (channel.type === 'email') {
          const sent = await sendEmail(env, {
            to: channel.destination,
            subject: 'Sitemapper test alert',
            text: `${payload.text}\nThis is a manual test from Settings. No site changed.\n`,
            html: `<p>${payload.text}</p><p>This is a manual test from Settings. No site changed.</p>`,
          });
          status = sent.ok ? 'sent' : 'failed';
          detail = sent.error || '';
        }
      } catch (error) {
        status = 'failed';
        detail = error instanceof Error ? error.message : String(error);
      }
      await env.DB.prepare(
        'INSERT INTO alert_deliveries (id, channel_id, project_id, snapshot_id, fingerprint, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(newId('alr'), channel.id, 'test', null, `test:${nowIso()}`, status, detail, nowIso())
        .run();
    }
    return redirect('/app/settings');
  }

  return json({ error: 'Not found.' }, 404);
}

async function handleSite(request: Request, env: Env, user: SessionUser, projectId: string, view: string): Promise<Response> {
  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND workspace_id = ?')
    .bind(projectId, user.workspaceId)
    .first<{ id: string; host: string; site_url: string; gsc_property: string | null; github_repo: string | null }>();
  if (!project) return json({ error: 'Project not found.' }, 404);
  const monitor = await env.DB.prepare('SELECT * FROM monitors WHERE project_id = ?')
    .bind(projectId)
    .first<{ enabled: number; frequency_minutes: number; last_status: string | null; next_run_at: string | null; last_finished_at: string | null }>();

  if (view === 'crawl' && request.method === 'POST') {
    await enqueueCrawl(env, project.id, user.workspaceId, project.site_url, 'manual');
    return redirect(`/app/sites/${project.id}`);
  }

  const snapshot = await env.DB.prepare(
    `SELECT s.*
     FROM snapshots s
     LEFT JOIN crawl_jobs j ON j.id = s.job_id
     WHERE s.project_id = ?
       AND (s.job_id IS NULL OR j.status = 'complete')
       AND s.declared_urls > 0
     ORDER BY s.generated_at DESC
     LIMIT 1`
  )
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
      `SELECT c.id, c.code, c.severity, c.url, c.grouped_count, c.before_json, c.after_json, c.created_at
       FROM change_events c
       JOIN snapshots s ON s.id = c.snapshot_id
       JOIN snapshots ps ON ps.id = c.previous_snapshot_id
       LEFT JOIN crawl_jobs j ON j.id = s.job_id
       WHERE c.project_id = ?
         AND c.severity IN ('critical', 'warning')
         AND (s.job_id IS NULL OR j.status = 'complete')
         AND ps.declared_urls > 0
       ORDER BY c.created_at DESC
       LIMIT 8`
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
    const eventId = new URL(request.url).searchParams.get('event');
    if (eventId) {
      const event = await env.DB.prepare(
        `SELECT c.id, c.code, c.severity, c.url, c.grouped_count, c.before_json, c.after_json, c.created_at
         FROM change_events c
         JOIN snapshots s ON s.id = c.snapshot_id
         JOIN snapshots ps ON ps.id = c.previous_snapshot_id
         LEFT JOIN crawl_jobs j ON j.id = s.job_id
         WHERE c.id = ?
           AND c.project_id = ?
           AND (s.job_id IS NULL OR j.status = 'complete')
           AND ps.declared_urls > 0`
      )
        .bind(eventId, projectId)
        .first<{
          id: string;
          code: string;
          severity: string;
          url: string | null;
          grouped_count: number;
          before_json: string | null;
          after_json: string | null;
          created_at: string;
        }>();
      if (!event) return json({ error: 'Change event not found.' }, 404);
      return html(
        incidentHtml({
          user,
          project,
          event,
          current: snapshot ? { declared_urls: snapshot.declared_urls, generated_at: snapshot.generated_at } : null,
        })
      );
    }
    const changes = await env.DB.prepare(
      `SELECT c.id, c.code, c.severity, c.url, c.grouped_count, c.before_json, c.after_json, c.created_at
       FROM change_events c
       JOIN snapshots s ON s.id = c.snapshot_id
       JOIN snapshots ps ON ps.id = c.previous_snapshot_id
       LEFT JOIN crawl_jobs j ON j.id = s.job_id
       WHERE c.project_id = ?
         AND (s.job_id IS NULL OR j.status = 'complete')
         AND ps.declared_urls > 0
       ORDER BY c.created_at DESC
       LIMIT 200`
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
          sevPill(String(row.severity)),
          `<a href="/app/sites/${encodeURIComponent(projectId)}/changes?event=${encodeURIComponent(String(row.id))}">${escapeHtml(humanize(String(row.code)))}</a>`,
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
          sevPill(String(row.severity)),
          String(row.affected_urls),
          escapeHtml(String(row.first_seen_at).slice(0, 10)),
          escapeHtml(String(row.last_seen_at).slice(0, 10)),
          row.resolved_at ? escapeHtml(String(row.resolved_at).slice(0, 10)) : 'open',
          escapeHtml(String(row.evidence || '').slice(0, 80)),
        ]),
      })
    );
  }

  if (view === 'export') {
    if (!snapshot) return json({ error: 'No snapshot yet.' }, 404);
    const obj = await env.SNAPSHOTS.get(snapshot.r2_key);
    if (!obj) return json({ error: 'Snapshot blob missing.' }, 404);
    const brand = user.entitlements.brandedReports
      ? await env.DB.prepare('SELECT brand_name FROM workspaces WHERE id = ?').bind(user.workspaceId).first<{ brand_name: string | null }>()
      : null;
    const payload = JSON.parse(await obj.text()) as { urls: Array<{ url: string; status?: number; title?: string; canonical?: string; lastmod?: string }> };
    const header = brand?.brand_name ? `# ${brand.brand_name} indexability export for ${project.host}\n` : '';
    const csv =
      header +
      ['url,status,title,canonical,lastmod']
        .concat(
          (payload.urls || []).map((row) =>
            [row.url, row.status ?? '', row.title ?? '', row.canonical ?? '', row.lastmod ?? '']
              .map((v) => `"${String(v).replace(/"/g, '""')}"`)
              .join(',')
          )
        )
        .join('\n');
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${project.host}${brand?.brand_name ? `-${brand.brand_name}` : ''}.csv"`,
        'cache-control': 'no-store',
      },
    });
  }

  if (view === 'history') {
    const since = new Date(Date.now() - user.entitlements.historyDays * 86400_000).toISOString();
    const snaps = await env.DB.prepare(
      `SELECT s.id, s.generated_at, s.declared_urls, s.errors, s.warnings, s.index_score, s.seo_score, s.sitemap_score, s.fingerprint
       FROM snapshots s
       LEFT JOIN crawl_jobs j ON j.id = s.job_id
       WHERE s.project_id = ?
         AND s.generated_at >= ?
         AND (s.job_id IS NULL OR j.status = 'complete')
         AND s.declared_urls > 0
       ORDER BY s.generated_at DESC
       LIMIT 50`
    )
      .bind(projectId, since)
      .all();
    return html(
      tablePage({
        user,
        title: 'History',
        path: `/app/sites/${projectId}/history`,
        kicker: project.host,
        lede: `Each successful crawl is an immutable snapshot. This plan keeps ${user.entitlements.historyDays} days.`,
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
    const filtered = parsed.urls.filter((row) => !q || row.url.toLowerCase().includes(q) || (row.title || '').toLowerCase().includes(q));
    const googleStates =
      user.entitlements.gsc && project.gsc_property
        ? await inspectUrlStates(
            env,
            user,
            project.gsc_property,
            filtered.slice(0, 12).map((row) => row.url),
            12
          )
        : {};
    const rows = filtered.slice(0, 500).map((row) => [
        `<a href="${escapeHtml(row.url)}">${escapeHtml(row.url)}</a>`,
        String(row.status ?? '—'),
        row.deepChecked ? 'deep' : 'index',
        row.noindex
          ? '<span class="pill high">noindex</span>'
          : row.robotsAllowed
            ? '<span class="pill medium">indexable?</span>'
            : '<span class="pill critical">robots-blocked</span>',
        escapeHtml(row.title || '—'),
        escapeHtml(row.canonical || '—'),
        escapeHtml(row.lastmod || '—'),
        escapeHtml(
          googleStates[row.url] ||
            (user.entitlements.gsc ? (project.gsc_property ? 'not inspected' : 'attach GSC property') : 'GSC not on this plan')
        ),
      ]);
    return html(
      tablePage({
        user,
        title: 'URL explorer',
        path: `/app/sites/${projectId}/urls`,
        kicker: project.host,
        lede: `Live fetch state from the latest snapshot. <a href="/app/sites/${projectId}/export">Download CSV</a>. Google stays unknown unless Search Console is connected.`,
        headers: ['URL', 'Status', 'Mode', 'Indexability', 'Title', 'Canonical', 'lastmod', 'Google'],
        rows,
      })
    );
  }

  if (view === 'settings' && request.method === 'GET') {
    const listing = user.entitlements.gsc ? await listGscProperties(env, user) : { connected: false, properties: [] };
    const propertyOptions = listing.properties
      .map((p) => `<option value="${escapeHtml(p.siteUrl)}" ${p.siteUrl === project.gsc_property ? 'selected' : ''}>${escapeHtml(p.siteUrl)}</option>`)
      .join('');
    const body = `
<p class="kicker">${escapeHtml(project.host)}</p>
<h1>Site settings</h1>
<div class="dash-grid">
  <div>
    <div class="card">
      <div class="card-head"><h2>Monitor</h2></div>
      <p>Frequency is capped by plan (${user.entitlements.frequencyMinutes} minutes). Sitemapper diffs robots/sitemaps often and deep-checks new, changed, broken, and high-value URLs.</p>
      <form method="post">
        <label><input type="checkbox" name="enabled" value="1" ${monitor?.enabled ? 'checked' : ''}> Enabled</label>
        <div class="actions" style="margin-top:12px"><button class="btn primary" type="submit">Save</button></div>
      </form>
    </div>
    <div class="card">
      <div class="card-head"><h2>Search Console</h2></div>
      <p>${project.gsc_property ? escapeHtml(project.gsc_property) : 'Not linked. Indexed state stays unknown until a property is attached. HTTP 200 is not indexed.'}</p>
      ${user.entitlements.gsc ? `<form method="post" action="/app/sites/${project.id}/settings" style="margin-top:12px">
        <input type="hidden" name="enabled" value="${monitor?.enabled ? '1' : '0'}">
        <div class="form-row">${propertyOptions ? `<select name="gsc_property"><option value="">Select property</option>${propertyOptions}</select>` : `<input name="gsc_property" placeholder="sc-domain:example.com or https://example.com/" value="${escapeHtml(project.gsc_property || '')}">`}<button type="submit">Attach property</button></div>
      </form>` : '<p>Upgrade to Pro to attach Search Console.</p>'}
    </div>
  </div>
  <div>
    <div class="card">
      <div class="card-head"><h2>GitHub repo</h2></div>
      <p>${user.entitlements.github || user.entitlements.ciGuard ? 'Store the repo to copy into the Action. Guard fails a deploy on deterministic regressions only.' : 'GitHub / CI guard is on Builder+.'}</p>
      ${user.entitlements.ciGuard ? `<form method="post" action="/app/sites/${project.id}/settings">
        <input type="hidden" name="enabled" value="${monitor?.enabled ? '1' : '0'}">
        <div class="form-row"><input name="github_repo" placeholder="owner/repo" value="${escapeHtml(project.github_repo || '')}"><button type="submit">Save repo</button></div>
      </form>
      <pre style="white-space:pre-wrap;font:12px/1.4 var(--mono);color:var(--mute)">- uses: TheArtOfSound/Sitemapper@main
  with:
    site: ${escapeHtml(project.site_url)}
    baseline: sitemapper-baseline.json</pre>
      <form method="post" action="/app/sites/${project.id}/guard"><button class="btn" type="submit">Run guard vs previous snapshot</button></form>` : ''}
    </div>
    <div class="card">
      <div class="card-head"><h2>Identifiers</h2></div>
      <ul class="list">
        <li><strong>Host</strong>${escapeHtml(project.host)}</li>
        <li><strong>Site URL</strong>${escapeHtml(project.site_url)}</li>
        <li><strong>Project</strong>${escapeHtml(project.id)}</li>
      </ul>
    </div>
  </div>
</div>`;
    return html(appShell({ title: `Settings · ${project.host}`, description: 'Site settings', body, path: `/app/sites/${project.id}/settings`, user, wide: true }));
  }
  if (view === 'settings' && request.method === 'POST') {
    const form = await request.formData();
    const enabled = form.get('enabled') === '1' ? 1 : 0;
    await env.DB.prepare('UPDATE monitors SET enabled = ? WHERE project_id = ?').bind(enabled, projectId).run();
    const gscProperty = String(form.get('gsc_property') || '').trim();
    if (gscProperty && user.entitlements.gsc) {
      await env.DB.prepare('UPDATE projects SET gsc_property = ? WHERE id = ? AND workspace_id = ?')
        .bind(gscProperty, projectId, user.workspaceId)
        .run();
    }
    const repo = String(form.get('github_repo') || '').trim();
    if (repo && user.entitlements.ciGuard) {
      await env.DB.prepare('UPDATE projects SET github_repo = ? WHERE id = ? AND workspace_id = ?')
        .bind(repo.slice(0, 200), projectId, user.workspaceId)
        .run();
    }
    return redirect(`/app/sites/${projectId}/settings`);
  }
  if (view === 'guard' && request.method === 'POST') {
    if (!user.entitlements.ciGuard) return json({ error: 'CI guard requires Builder or higher.' }, 402);
    const snaps = await env.DB.prepare(
      `SELECT s.id, s.r2_key, s.generated_at
       FROM snapshots s
       LEFT JOIN crawl_jobs j ON j.id = s.job_id
       WHERE s.project_id = ?
         AND (s.job_id IS NULL OR j.status = 'complete')
         AND s.declared_urls > 0
       ORDER BY s.generated_at DESC
       LIMIT 2`
    )
      .bind(projectId)
      .all<{ id: string; r2_key: string; generated_at: string }>();
    const pair = snaps.results || [];
    if (pair.length < 2) {
      return html(
        appShell({
          title: `Guard · ${project.host}`,
          description: 'CI guard',
          body: `<p class="kicker">${escapeHtml(project.host)}</p>
<h1>CI guard</h1>
<p class="lede">Need two snapshots to compare.</p>
<div class="card">
  <div class="card-head"><h2>Run a crawl</h2></div>
  <p>Run a crawl now, then another after a change. Guard compares the latest snapshot to the previous one.</p>
  <div class="actions"><form method="post" action="/app/sites/${project.id}/crawl"><button class="btn primary" type="submit">Run crawl</button></form></div>
</div>`,
          path: `/app/sites/${project.id}/guard`,
          user,
        })
      );
    }
    const [currentObj, previousObj] = await Promise.all([env.SNAPSHOTS.get(pair[0].r2_key), env.SNAPSHOTS.get(pair[1].r2_key)]);
    if (!currentObj || !previousObj) return json({ error: 'Snapshot blobs missing.' }, 404);
    const result = evaluateGuard(JSON.parse(await previousObj.text()) as CrawlSnapshot, JSON.parse(await currentObj.text()) as CrawlSnapshot);
    const failures = result.failures
      .map((event) => `<tr><td>${sevPill(event.class)}</td><td>${escapeHtml(humanize(event.code))}</td><td>${event.count}</td><td>${escapeHtml(event.url || '—')}</td></tr>`)
      .join('');
    const body = `<p class="kicker">${escapeHtml(project.host)}</p>
      <h1>CI guard</h1>
      <p class="lede">${escapeHtml(result.summary)}</p>
      <div class="stat-band">
        <div class="score"><span>Result</span><b>${result.passed ? 'Passed' : 'Failed'}</b><small>${escapeHtml(project.host)}</small></div>
        <div class="score"><span>Failures</span><b>${result.failures.length}</b><small>deploy regressions</small></div>
        <div class="score"><span>Events</span><b>${result.events.length}</b><small>in this diff</small></div>
      </div>
      <p class="hint">Compared ${escapeHtml(pair[1].generated_at.slice(0, 16))} → ${escapeHtml(pair[0].generated_at.slice(0, 16))}. This is the same rule set the GitHub Action uses.</p>
      <div class="card">
        <div class="card-head"><h2>Regressions</h2></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Class</th><th>Event</th><th>Count</th><th>URL</th></tr></thead><tbody>${failures || '<tr><td colspan="4">No configured deploy regressions.</td></tr>'}</tbody></table></div>
      </div>
      <p><a href="/app/sites/${project.id}">Back to site</a></p>`;
    return html(appShell({ title: `Guard · ${project.host}`, description: 'CI guard', body, path: `/app/sites/${project.id}/guard`, user, wide: true }));
  }

  return json({ error: 'Not found.' }, 404);
}

async function handleApi(_request: Request, _env: Env, _path: string): Promise<Response> {
  return json({ error: 'Use /api/v1 with a Bearer key.' }, 404);
}

function html(markup: string, status = 200, cache = 'no-store'): Response {
  return new Response(markup, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cache },
  });
}

export { originOf };
