import { impactFor, siteHealth } from '../../src/diff/impact.js';
import { ISSUE_CATALOG, issueDoc, issuePath } from '../../src/issues/catalog.js';
import { PLAN_PRICES_USD, PLANS, type PlanId } from '../../src/plans.js';
import { css, escapeHtml, humanize, shell } from '../render.js';
import type { SessionUser } from './auth.js';

type DashboardSite = {
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

type DashboardEvent = {
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

export function appShell(opts: {
  title: string;
  description: string;
  body: string;
  path: string;
  user?: SessionUser | null;
  wide?: boolean;
  noindex?: boolean;
  firstSiteId?: string;
}): string {
  const markup = shell({
    title: opts.title,
    description: opts.description,
    path: opts.path,
    noindex: opts.noindex ?? true,
    body: opts.body,
    chrome: opts.user ? 'app' : 'public',
    userEmail: opts.user?.email || undefined,
    workspaceName: opts.user?.brandName || opts.user?.name || undefined,
    firstSiteId: opts.firstSiteId,
    plan: opts.user?.entitlements?.plan || opts.user?.plan || undefined,
  });
  const signedIn = opts.user
    ? markup.replace('<a href="/login">Sign in</a>', '<a href="/app">App</a><a href="/logout">Sign out</a>')
    : markup;
  return signedIn
    .replace('class="wrap"', opts.wide ? 'class="wrap wide"' : 'class="wrap"')
    .replace('class="loading" id="loading"', 'class="loading" id="loading" hidden');
}

export function loginHtml(
  next: string,
  envFlags: { github: boolean; google: boolean; dev: boolean; email: boolean; oort: boolean },
  notice?: { error?: string; sent?: boolean },
  user?: SessionUser | null
): string {
  const q = `?next=${encodeURIComponent(next)}`;
  const buttons = [
    envFlags.oort ? `<a class="btn" href="https://oortstack.com/api/sso/sitemapper${q}">Continue with Oort</a>` : '',
    envFlags.github ? `<a class="btn" href="/auth/github${q}">Continue with GitHub</a>` : '',
    envFlags.google ? `<a class="btn" href="/auth/google${q}">Continue with Google</a>` : '',
    envFlags.dev ? `<a class="btn" href="/auth/dev${q}">Local dev login</a>` : '',
  ]
    .filter(Boolean)
    .join('');
  const emailForm = envFlags.email
    ? `<form method="post" action="/login" class="form-row">
        <input type="hidden" name="next" value="${escapeHtml(next)}">
        <input name="email" type="email" required autocomplete="email" placeholder="you@company.com">
        <button type="submit">Email a sign-in link</button>
      </form>
      <p class="hint">We email a 15-minute link. No password.</p>`
    : '';
  const empty = !buttons && !envFlags.email
    ? '<p>No login providers are configured on this deployment.</p>'
    : '';
  const body = `
<p class="kicker">Account</p>
<h1 class="serif">Sign in to watch production</h1>
<p class="lede">The checker stays free. An account can keep a baseline and monitor one site daily; Builder adds email alerts and CI guardrails.</p>
${notice?.sent ? `<div class="card"><p><strong>Check your email for the sign-in link.</strong></p></div>` : ''}
${notice?.error ? `<div class="card"><p><strong>${escapeHtml(notice.error)}</strong></p></div>` : ''}
<div class="card">
  ${cardHead('Sign in')}
  ${emailForm}
  ${buttons || empty ? `<div class="actions">${buttons}${empty}</div>` : ''}
  <p class="hint">Google sign-in also requests Search Console readonly access so we can label INDEXED state when you connect a property. Sitemap submission is a hint, not a guarantee of indexing.</p>
</div>`;
  return appShell({
    title: 'Sign in · Sitemapper',
    description: 'Sign in to monitor sitemap and indexability changes.',
    body,
    path: '/login',
    user,
    noindex: true,
  });
}

export function pricingHtml(user?: SessionUser | null): string {
  const cards = (Object.keys(PLANS) as PlanId[])
    .map((id) => {
      const plan = PLANS[id];
      const price = PLAN_PRICES_USD[id];
      const featured = id === 'builder' ? ' <span class="pill">Most used</span>' : '';
      const priceMark = price.monthly
        ? `<span class="plan-price"><b>$${price.monthly}</b> / month</span>`
        : '<span class="plan-price"><b>Free</b></span>';
      const cta =
        id === 'free'
          ? `<a class="btn primary" href="/">Run the free check</a>`
          : user
            ? `<form method="post" action="/app/billing/checkout"><input type="hidden" name="plan" value="${id}"><input type="hidden" name="interval" value="month"><button class="btn primary" type="submit">Start ${escapeHtml(price.label)}</button></form>
               <form method="post" action="/app/billing/checkout"><input type="hidden" name="plan" value="${id}"><input type="hidden" name="interval" value="year"><button class="btn" type="submit">$${price.annual}/yr</button></form>`
            : `<a class="btn primary" href="/login?next=${encodeURIComponent(`/app/billing?plan=${id}`)}">Start ${escapeHtml(price.label)}</a>`;
      return `<div class="card">
        <div class="card-head">
          <h2>${escapeHtml(price.label)}${featured}</h2>
          ${priceMark}
        </div>
        <ul class="list">
          <li>${plan.sites} site${plan.sites === 1 ? '' : 's'}</li>
          <li>${plan.monitoredUrls.toLocaleString()} monitored URLs</li>
          <li>${plan.frequencyMinutes >= 1440 ? 'Daily' : `Every ${plan.frequencyMinutes / 60}h`} change checks</li>
          <li>${plan.historyDays}-day history</li>
          <li>${plan.emailAlerts ? 'Email alerts' : 'No email alerts'}</li>
          <li>${plan.webhooks ? 'Webhooks' : 'No webhooks'}${plan.slack ? ' + Slack' : ''}</li>
          <li>${plan.gsc ? 'Google Search Console' : 'GSC: not included'}</li>
          <li>${plan.ciGuard || plan.github ? 'GitHub Action / CI guardrail' : 'CI guardrail: not included'}</li>
          <li>${plan.api ? 'API keys' : 'No API'}</li>
          <li>${plan.teamMembers > 1 ? `${plan.teamMembers} team seats` : 'Solo workspace'}</li>
          <li>${plan.brandedReports ? 'Branded client reports' : 'Sitemapper-branded reports'}</li>
        </ul>
        <div class="actions">${cta}</div>
      </div>`;
    })
    .join('');
  const body = `
<p class="kicker">Pricing</p>
<h1 class="serif">Check and monitor one site free. Upgrade for alerts, CI, and more capacity.</h1>
<p class="lede">Sitemapper compares each crawl with the previous snapshot across sitemap URLs, live page signals, and critical journeys. Free includes one daily monitor with 14-day history. Builder adds email alerts and CI; Pro and Agency add faster checks and integrations.</p>
<div class="plan-grid">${cards}</div>
<p class="hint">Free: 1 site, 2,000 monitored URLs, daily checks, 14-day history, no alerts or CI. Builder: 5 sites, 10,000 monitored URLs, daily checks, 90-day history, email alerts, and CI. Pro and Agency add faster checks and integrations. Limits are enforced on the server. Sitemap submission is a hint, not proof of Google indexing.</p>`;
  return appShell({
    title: 'Pricing · Sitemapper',
    description: 'Free sitemap checker. Builder $19, Pro $49, Agency $149 to monitor deploy diffs — not another SEO score.',
    body,
    path: '/pricing',
    user,
    wide: true,
    noindex: false,
  });
}

export function dashboardHtml(
  user: SessionUser,
  sites: Array<{
    id: string;
    host: string;
    last_status: string | null;
    last_finished_at: string | null;
    next_run_at: string | null;
    declared_urls: number | null;
    index_score: number | null;
    errors: number | null;
    critical: number | null;
  }>,
  events: Array<{
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
  }> = [],
  priorityEvents: Array<{
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
  }> = events.filter((event) => event.severity === 'critical' || event.severity === 'warning')
): string {
  const annotated = sites.map((site) => ({ ...site, health: siteHealth(site) }));
  const n = annotated.length;
  const pages = annotated.reduce((sum, site) => sum + Number(site.declared_urls || 0), 0);
  const attention = annotated.filter((site) => site.health === 'critical' || site.health === 'warning').length;
  const allHealthy = attention === 0;
  const overallCritical = annotated.some((site) => site.health === 'critical');
  const incidents = priorityIncidents(annotated, priorityEvents);
  const today = collapseTimelineEvents(
    events.filter((event) => isToday(event.created_at) && event.code !== 'LASTMOD_CHANGED')
  ).slice(0, 8);
  const planRaw = String(user.entitlements?.plan || user.plan || 'free');
  const planLabel = escapeHtml(planRaw.charAt(0).toUpperCase() + planRaw.slice(1));
  const main = !annotated.length
    ? `<div class="card">
        ${cardHead('Add your first site')}
        <p>No sites yet. Add a URL to monitor from this workspace — Sitemapper crawls it on a schedule and compares later snapshots.</p>
        <div class="actions">
          <a class="btn primary" href="/app/sites/new">Add site</a>
          <a class="btn" href="/app/billing">Billing</a>
        </div>
      </div>`
    : `<div class="dash-grid">
        <div>
          <div class="card">
            ${cardHead(
              `Priority incidents ${incidents.length ? `<span class="pill critical">${incidents.length}</span>` : ''}`,
              { href: '/app/changes', label: 'View all incidents' }
            )}
            ${incidents.join('') || '<p>No priority incidents.</p>'}
          </div>
          <div class="card">
            ${cardHead('Sites', { href: '/app/sites/new', label: 'Add site' })}
            <div class="portfolio">${annotated.map(siteCard).join('')}</div>
            <a class="view-all" href="/app/sites">View all sites</a>
          </div>
        </div>
        <div>
          <div class="card">
            ${cardHead('What changed today', { href: '/app/changes', label: 'View all changes' })}
            ${
              today.length
                ? `<div class="timeline">${today.map(timelineItem).join('')}</div>`
                : '<p>No changes yet.</p>'
            }
            <a class="view-all" href="/app/changes">View all changes</a>
          </div>
        </div>
      </div>`;
  const body = `
<h1 class="serif">Website change monitoring</h1>
<p class="lede">Detect important changes before they impact traffic, leads, or revenue.</p>
<div class="actions">
  <a class="btn primary" href="/app/sites/new">Add site</a>
  <a class="btn" href="/app/billing">Billing</a>
  <a class="btn" href="/app/settings">Settings</a>
</div>
<div class="stat-band">
  <div class="score">
    <span>Sites monitored</span>
    <b>${n.toLocaleString()}</b>
    <small>${allHealthy ? 'All sites healthy' : `${attention} need attention`}</small>
  </div>
  <div class="score">
    <span>Pages monitored</span>
    <b>${pages.toLocaleString()}</b>
    <small>Across all sites</small>
  </div>
  <div class="score">
    <span>Overall status</span>
    <b class="health ${overallCritical ? 'critical' : 'healthy'}">${overallCritical ? 'Critical' : 'Healthy'}</b>
    <small>${
      overallCritical
        ? 'Critical incidents open'
        : incidents.length
          ? 'Latest scan healthy · recorded incidents below'
          : 'No critical incidents'
    } · ${planLabel} plan</small>
  </div>
</div>
${main}`;
  return appShell({
    title: 'Website change monitoring · Sitemapper',
    description: 'Portfolio of monitored websites',
    body,
    path: '/app',
    user,
    wide: true,
    firstSiteId: sites[0]?.id,
  });
}

export function addSiteHtml(user: SessionUser, opts?: { error?: string; site?: string; notice?: string }): string {
  const errorCard = opts?.error
    ? `<div class="card"><p><strong>${escapeHtml(opts.error)}</strong></p></div>`
    : '';
  const noticeCard = opts?.notice
    ? `<div class="card"><p>${escapeHtml(opts.notice)}</p></div>`
    : '';
  const siteValue = opts?.site ? ` value="${escapeHtml(opts.site)}"` : '';
  const body = `
<p class="kicker">Workspace</p>
<h1 class="serif">Add a site</h1>
<p class="lede">Free monitors one site daily. Extra sites need a paid plan.</p>
${errorCard}
${noticeCard}
<div class="card">
  ${cardHead('Site URL')}
  <form class="form-row" method="post" action="/app/sites">
    <input name="site" type="url" required placeholder="https://example.com"${siteValue}>
    <button type="submit">Add site</button>
  </form>
  <p class="hint">If you already ran a public check, you can monitor that site from the report. This form starts a monitored crawl.</p>
</div>
<div class="actions">
  <a class="btn" href="/app">Back to monitoring</a>
  <a class="btn" href="/app/billing">Billing</a>
</div>`;
  return appShell({
    title: 'Add a site · Sitemapper',
    description: 'Add a site to monitor from this workspace',
    body,
    path: '/app/sites/new',
    user,
    wide: true,
  });
}

export function sitesListHtml(user: SessionUser, sites: DashboardSite[]): string {
  const annotated = sites.map((site) => ({ ...site, health: siteHealth(site) }));
  const main = !annotated.length
    ? `<div class="card">
        ${cardHead('No sites yet')}
        <p>Add a URL to monitor from this workspace. Free includes one daily monitor; extra sites need a paid plan.</p>
        <div class="actions"><a class="btn primary" href="/app/sites/new">Add site</a></div>
      </div>`
    : `<div class="card">
        ${cardHead('Sites', { href: '/app/sites/new', label: 'Add site' })}
        <div class="portfolio">${annotated.map(siteCard).join('')}</div>
      </div>`;
  const body = `
<p class="kicker">Workspace</p>
<h1 class="serif">Sites</h1>
<p class="lede">Sites this workspace monitors. Free includes one daily monitor; extra sites need a paid plan.</p>
<div class="actions">
  <a class="btn primary" href="/app/sites/new">Add site</a>
  <a class="btn" href="/app/billing">Billing</a>
</div>
${main}`;
  return appShell({
    title: 'Sites · Sitemapper',
    description: 'Sites monitored in this workspace',
    body,
    path: '/app/sites',
    user,
    wide: true,
    firstSiteId: sites[0]?.id,
  });
}

function priorityIncidents(
  sites: Array<DashboardSite & { health: ReturnType<typeof siteHealth> }>,
  events: DashboardEvent[]
): string[] {
  const fromEvents = collapseRelatedIncidents(
    events.filter((event) => event.severity === 'critical' || event.severity === 'warning')
  );
  if (fromEvents.length) return fromEvents.map(incidentFromEvent);
  return sites
    .filter((site) => site.health === 'critical')
    .map((site) =>
      incidentRow({
        href: `/app/sites/${site.id}/changes`,
        host: site.host,
        journey: 'Website',
        headline: `${Number(site.critical || 0)} critical change${Number(site.critical) === 1 ? '' : 's'} to review`,
        when: site.last_finished_at ? relativeAgo(site.last_finished_at) : 'recently',
        severity: 'critical',
      })
    );
}

function collapseRelatedIncidents(events: DashboardEvent[]): DashboardEvent[] {
  const seen = new Set<string>();
  const out: DashboardEvent[] = [];
  const dropDays = new Set(
    events
      .filter((event) => event.code === 'SITEMAP_URL_COUNT_DROP')
      .map((event) => `${event.projectId}:${event.created_at.slice(0, 10)}`)
  );
  for (const event of events) {
    if (event.code === 'LASTMOD_CHANGED') continue;
    if (event.code === 'URL_REMOVED' && dropDays.has(`${event.projectId}:${event.created_at.slice(0, 10)}`)) continue;
    const key = `${event.projectId}:${event.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}

function collapseTimelineEvents(events: DashboardEvent[]): DashboardEvent[] {
  const grouped = new Map<string, DashboardEvent>();
  for (const event of events) {
    const key = `${event.projectId}:${event.code}:${event.created_at}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...event });
      continue;
    }
    existing.grouped_count += event.grouped_count;
  }
  return [...grouped.values()];
}

function incidentFromEvent(event: DashboardEvent): string {
  const impact = impactOf(event);
  return incidentRow({
    href: `/app/sites/${event.projectId}/changes?event=${encodeURIComponent(event.id)}`,
    host: event.host,
    journey: impact.journey,
    headline: impact.headline,
    when: relativeAgo(event.created_at),
    severity: event.severity,
  });
}

function incidentRow(opts: {
  href: string;
  host: string;
  journey: string;
  headline: string;
  when: string;
  severity: string;
}): string {
  const tone = severityTone(opts.severity);
  return `<a class="incident ${tone}" href="${opts.href}">
    <span class="icon" aria-hidden="true"></span>
    <div>
      <strong>${escapeHtml(opts.host)}</strong>
      <p>${escapeHtml(opts.journey)}</p>
    </div>
    <div>
      <strong>${escapeHtml(opts.headline)}</strong>
      <p>Detected ${escapeHtml(opts.when)}</p>
    </div>
    ${incidentPill(opts.severity)}
    <span aria-hidden="true">›</span>
  </a>`;
}

function siteCard(site: DashboardSite & { health: ReturnType<typeof siteHealth> }): string {
  const count = Number(site.declared_urls || 0);
  const pages = count.toLocaleString();
  return `<a class="site-card" href="/app/sites/${site.id}">
    <span class="initials ${avatarTone(site.host)}">${escapeHtml(hostInitials(site.host))}</span>
    <strong>${escapeHtml(site.host)}</strong>
    <span>${pages} page${count === 1 ? '' : 's'}</span>
    ${healthMark(site.health)}
    <span aria-hidden="true">›</span>
  </a>`;
}

function timelineItem(event: DashboardEvent): string {
  const impact = impactOf(event);
  return `<div class="${severityTone(event.severity)}">
    <time datetime="${escapeHtml(event.created_at)}">${escapeHtml(relativeAgo(event.created_at))}</time>
    <div>
      <strong>${escapeHtml(event.host)}</strong>
      <p>${escapeHtml(impact.headline)}</p>
    </div>
    ${incidentPill(event.severity)}
  </div>`;
}

function impactOf(row: {
  code: string;
  severity: string;
  url: string | null;
  grouped_count: number;
  before_json?: string | null;
  after_json?: string | null;
  summary?: string;
}) {
  return impactFor({
    code: row.code,
    class: row.severity,
    url: row.url || undefined,
    before: parseEvidence(row.before_json),
    after: parseEvidence(row.after_json),
    summary: row.summary || humanize(row.code),
    count: row.grouped_count,
  });
}

function parseEvidence(value: string | null | undefined): unknown {
  if (value === null || value === undefined || value === '') return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function incidentPill(severity: string): string {
  if (severity === 'critical' || severity === 'error') return '<span class="pill critical">Critical</span>';
  if (severity === 'warning') return '<span class="pill high">High</span>';
  return '<span class="pill medium">Medium</span>';
}

function catalogPill(severity: string): string {
  if (severity === 'error' || severity === 'critical') return '<span class="pill critical">Critical</span>';
  if (severity === 'warning') return '<span class="pill warning">Warning</span>';
  return `<span class="pill">${escapeHtml(severity)}</span>`;
}

function healthMark(health: ReturnType<typeof siteHealth>): string {
  const label = health === 'critical' ? 'Critical' : health === 'warning' ? 'Warning' : health === 'pending' ? 'Pending' : 'Healthy';
  return `<span class="status ${health}">${label}</span>`;
}

function hostInitials(host: string): string {
  const cleaned = (host.replace(/^www\./i, '').split(':')[0] || host).trim();
  const skip = new Set(['com', 'net', 'org', 'io', 'co', 'uk', 'us', 'dev', 'app', 'info', 'edu', 'gov']);
  const labels = cleaned.split('.').filter((part) => part && !skip.has(part.toLowerCase()));
  if (labels.length >= 2) return `${labels[0][0] || ''}${labels[1][0] || ''}`.toUpperCase();
  return (labels[0] || cleaned).slice(0, 2).toUpperCase() || '?';
}

function avatarTone(host: string): string {
  let sum = 0;
  for (let i = 0; i < host.length; i++) sum += host.charCodeAt(i);
  return `c${sum % 6}`;
}

function severityTone(severity: string): 'critical' | 'warning' | 'medium' | 'low' {
  if (severity === 'critical' || severity === 'error') return 'critical';
  if (severity === 'warning') return 'warning';
  if (severity === 'low' || severity === 'info' || severity === 'ok' || severity === 'healthy') return 'low';
  return 'medium';
}

function relativeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

function isToday(iso: string): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const a = new Date(t);
  const b = new Date();
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function cardHead(titleHtml: string, viewAll?: { href: string; label: string }): string {
  return `<div class="card-head">
    <h2>${titleHtml}</h2>
    ${viewAll ? `<a class="view-all" href="${escapeHtml(viewAll.href)}">${escapeHtml(viewAll.label)}</a>` : ''}
  </div>`;
}

export function siteHtml(input: {
  user: SessionUser;
  project: { id: string; host: string; site_url: string; gsc_property: string | null };
  monitor: { enabled: number; frequency_minutes: number; last_status: string | null; next_run_at: string | null; last_finished_at: string | null };
  snapshot: {
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
  } | null;
  changes: Array<{
    id: string;
    code: string;
    severity: string;
    summary?: string;
    grouped_count: number;
    url: string | null;
    before_json: string | null;
    after_json: string | null;
    created_at: string;
  }>;
  delta?: { urls: number; errors: number };
}): string {
  const s = input.snapshot;
  const priority = collapseRelatedIncidents(
    input.changes
      .filter((row) => row.severity === 'critical' || row.severity === 'warning')
      .map((row) => ({
        ...row,
        host: input.project.host,
        projectId: input.project.id,
      }))
  );
  const changeRows = priority
    .map((row) => {
      const impact = impactOf(row);
      return incidentRow({
        href: `/app/sites/${input.project.id}/changes?event=${encodeURIComponent(row.id)}`,
        host: input.project.host,
        journey: impact.journey,
        headline: impact.headline,
        when: relativeAgo(row.created_at),
        severity: row.severity,
      });
    })
    .join('');
  const emptyChanges = !s ? '<p>No comparison yet — the next crawl becomes the baseline.</p>' : '<p>No priority incidents.</p>';
  const latestCritical = priority.find((row) => row.severity === 'critical');
  const latestImpact = latestCritical ? impactOf(latestCritical) : null;
  const currentCount = s ? `${s.declared_urls.toLocaleString()} sitemap URLs in the latest scan` : null;
  const lede = currentCount
    ? latestImpact
      ? `${currentCount}. Last recorded incident: ${latestImpact.headline}.`
      : `${currentCount}.`
    : input.project.gsc_property
      ? `Search Console property ${input.project.gsc_property}`
      : 'Google index state unknown until Search Console is connected. HTTP 200 is not indexed.';
  const body = `
<p class="kicker"><a href="/app">Portfolio</a> · ${escapeHtml(input.project.host)}</p>
<h1 class="serif">${escapeHtml(input.project.host)}</h1>
<p class="lede">${escapeHtml(lede)}</p>
<div class="stat-band">
  <div class="score">
    <span>Declared</span>
    <b>${s ? s.declared_urls.toLocaleString() : '—'}</b>
    <small>In sitemap</small>
  </div>
  <div class="score">
    <span>Live</span>
    <b>${s ? s.live_urls.toLocaleString() : '—'}</b>
    <small>Fetched</small>
  </div>
  <div class="score">
    <span>Indexable</span>
    <b>${s ? s.indexable_urls.toLocaleString() : '—'}</b>
    <small>Not Google indexed</small>
  </div>
</div>
<div class="stat-band">
  <div class="score">
    <span>Index</span>
    <b>${s?.index_score ?? '—'}</b>
    <small>Index score</small>
  </div>
  <div class="score">
    <span>SEO</span>
    <b>${s?.seo_score ?? '—'}</b>
    <small>SEO score</small>
  </div>
  <div class="score">
    <span>Sitemap</span>
    <b>${s?.sitemap_score ?? '—'}</b>
    <small>Sitemap score</small>
  </div>
</div>
<p class="hint">Last crawl ${escapeHtml(input.monitor.last_finished_at ? relativeAgo(input.monitor.last_finished_at) : 'never')} · next ${escapeHtml(input.monitor.next_run_at || '—')} · ${input.monitor.enabled ? `every ${input.monitor.frequency_minutes}m` : 'paused'}</p>
<div class="actions">
  <form method="post" action="/app/sites/${input.project.id}/crawl"><button class="btn primary" type="submit">Run crawl</button></form>
  <a class="btn" href="/app/sites/${input.project.id}/changes">Changes</a>
  <a class="btn" href="/app/sites/${input.project.id}/urls">URLs</a>
  <a class="btn" href="/app/sites/${input.project.id}/issues">Issues</a>
  <a class="btn" href="/app/sites/${input.project.id}/history">History</a>
  ${input.user.entitlements.ciGuard ? `<form method="post" action="/app/sites/${input.project.id}/guard"><button class="btn" type="submit">Run CI guard</button></form>` : ''}
  <a class="btn" href="/app/sites/${input.project.id}/settings">Site settings</a>
  <a class="btn" href="/app/sites/new">Add site</a>
  <a class="btn" href="/app/billing">Billing</a>
</div>
<div class="card">
  ${cardHead(
    `Priority incidents ${priority.length ? `<span class="pill critical">${priority.length}</span>` : ''}`,
    { href: `/app/sites/${input.project.id}/changes`, label: 'View all changes' }
  )}
  ${changeRows || emptyChanges}
</div>`;
  return appShell({
    title: `${input.project.host} · Sitemapper`,
    description: `Indexability overview for ${input.project.host}`,
    body,
    path: `/app/sites/${input.project.id}`,
    user: input.user,
    wide: true,
    firstSiteId: input.project.id,
  });
}

export function incidentHtml(input: {
  user: SessionUser;
  project: { id: string; host: string };
  event: {
    id: string;
    code: string;
    severity: string;
    url: string | null;
    before_json: string | null;
    after_json: string | null;
    grouped_count: number;
    created_at: string;
  };
  current?: { declared_urls: number; generated_at: string } | null;
}): string {
  const projectPath = encodeURIComponent(input.project.id);
  const impact = impactOf(input.event);
  const before = evidenceDisplay(parseEvidence(input.event.before_json));
  const after = evidenceDisplay(parseEvidence(input.event.after_json));
  const affected = Number(input.event.grouped_count || 0).toLocaleString('en-US');
  const guidance = incidentGuidance(input.event.code, before, after, affected);
  const hasIssueGuide = ISSUE_CATALOG.some((row) => row.code === input.event.code);
  const laterObservation =
    input.current && Date.parse(input.current.generated_at) > Date.parse(input.event.created_at)
      ? `<div class="card">
          ${cardHead('Latest observed state')}
          <p>The latest trusted snapshot records <strong>${escapeHtml(Number(input.current.declared_urls).toLocaleString('en-US'))} sitemap URLs</strong> at ${escapeHtml(String(input.current.generated_at).slice(0, 16).replace('T', ' '))} UTC.</p>
          <p class="hint">This is a later observation, not a claim about cause, recovery time, traffic, or rankings.</p>
        </div>`
      : '';
  const body = `
<p class="kicker"><a href="/app">Portfolio</a> · <a href="/app/sites/${projectPath}">${escapeHtml(input.project.host)}</a> · Incident evidence</p>
<h1 class="serif">${escapeHtml(impact.headline)}</h1>
<p class="lede">${escapeHtml(impact.label)}. Recorded ${escapeHtml(String(input.event.created_at).slice(0, 16).replace('T', ' '))} UTC from two consecutive crawl snapshots.</p>
<div class="stat-band">
  <div class="score"><span>Before</span><b>${escapeHtml(before)}</b><small>Previous snapshot</small></div>
  <div class="score ${after === '0' ? 'is-critical' : ''}"><span>After</span><b>${escapeHtml(after)}</b><small>Incident snapshot</small></div>
  <div class="score"><span>Grouped changes</span><b>${escapeHtml(affected)}</b><small>One incident, not ${escapeHtml(affected)} alerts</small></div>
</div>
<div class="card">
  ${cardHead('What changed')}
  <p>${escapeHtml(guidance.changed)}</p>
  <p class="hint">Evidence code: ${escapeHtml(input.event.code)}${input.event.url ? ` · ${escapeHtml(input.event.url)}` : ''}</p>
</div>
<div class="card">
  ${cardHead('What it could affect')}
  <p>${escapeHtml(guidance.risk)}</p>
</div>
<div class="card">
  ${cardHead('Recommended action')}
  <p>${escapeHtml(guidance.action)}</p>
</div>
${laterObservation}
<p class="hint">This is recorded product evidence. It shows what Sitemapper could inventory in each scan; it does not independently prove that URLs were deleted at the origin or claim measured traffic, ranking, lead, or revenue loss.</p>
<div class="actions">
  <a class="btn primary" href="/app/sites/${projectPath}/history">View crawl history</a>
  <a class="btn" href="/app/sites/${projectPath}/changes">All changes</a>
  <a class="btn" href="/app/sites/${projectPath}">Site overview</a>
  ${hasIssueGuide ? `<a class="btn" href="${issuePath(input.event.code)}">Evidence guide</a>` : ''}
  <a class="btn" href="/app">Back</a>
  <a class="btn" href="/app/sites/new">Add site</a>
  <a class="btn" href="/app/billing">Billing</a>
</div>`;
  return appShell({
    title: `${impact.headline} · ${input.project.host} · Sitemapper`,
    description: `Recorded ${impact.label.toLowerCase()} for ${input.project.host}`,
    body,
    path: `/app/sites/${projectPath}/changes`,
    user: input.user,
    wide: true,
    firstSiteId: input.project.id,
  });
}

function incidentGuidance(code: string, before: string, after: string, affected: string): { changed: string; risk: string; action: string } {
  if (code === 'SITEMAP_URL_COUNT_DROP') {
    return {
      changed: `Sitemapper's accessible sitemap inventory changed from ${before} URLs to ${after} between consecutive scans. It grouped ${affected} no-longer-observed URL changes into this incident.`,
      risk: 'New and updated pages may stop being discovered through the sitemap. This is a search-visibility risk, not proof that traffic or rankings changed.',
      action: 'Check sitemap generation, public crawler access, and bot-protection responses. Confirm robots.txt and sitemap directives use the public origin, then run another crawl after the site is corrected or access is restored.',
    };
  }
  if (code === 'SITEMAP_DISAPPEARED') {
    return {
      changed: 'A sitemap available in the previous snapshot was no longer available in the incident snapshot.',
      risk: 'Search engines may lose a reliable discovery source for new or updated pages.',
      action: 'Restore the sitemap response, verify its public URL and robots.txt reference, then run another crawl.',
    };
  }
  if (code === 'ROBOTS_ACCESS_CHANGED') {
    return {
      changed: `Crawler access changed from ${before} to ${after} between consecutive snapshots.`,
      risk: 'Important pages may become harder for search crawlers to reach.',
      action: 'Review the deployed robots.txt rules against the intended public paths, correct the source configuration, and verify with another crawl.',
    };
  }
  return {
    changed: `${humanize(code)} changed from ${before} to ${after}. ${affected} related change${affected === '1' ? '' : 's'} were grouped into this incident.`,
    risk: 'The affected website journey may behave differently from the previous snapshot. Review the preserved evidence before drawing a business-impact conclusion.',
    action: 'Compare the affected URL and deployment with the previous known-good state, correct the source if needed, then verify with a new crawl.',
  };
}

function evidenceDisplay(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString('en-US');
  if (typeof value === 'string') {
    const numeric = /^-?\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
    return Number.isFinite(numeric) ? numeric.toLocaleString('en-US') : value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function tablePage(opts: {
  user: SessionUser;
  title: string;
  path: string;
  kicker: string;
  lede: string;
  headers: string[];
  rows: string[][];
}): string {
  const body = `
<p class="kicker">${opts.kicker}</p>
<h1 class="serif">${escapeHtml(opts.title)}</h1>
<p class="lede">${opts.lede}</p>
<div class="actions">
  <a class="btn primary" href="/app/sites/new">Add site</a>
  <a class="btn" href="/app/billing">Billing</a>
</div>
<div class="card">
  ${cardHead(escapeHtml(opts.title))}
  <div class="table-wrap"><table class="data"><thead><tr>${opts.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
  <tbody>${
    opts.rows.length
      ? opts.rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${opts.headers.length}">None yet.</td></tr>`
  }</tbody></table></div>
</div>`;
  return appShell({ title: `${opts.title} · Sitemapper`, description: opts.title, body, path: opts.path, user: opts.user, wide: true });
}

export function issueEncyclopediaHtml(code?: string): string {
  if (code) {
    const doc = issueDoc(code) || ISSUE_CATALOG.find((row) => issuePath(row.code) === `/issues/${code}`);
    if (!doc) {
      return appShell({
        title: 'Unknown issue · Sitemapper',
        description: 'No such issue code.',
        body: `<p class="kicker">Issue encyclopedia</p><h1 class="serif">Unknown issue</h1><p class="lede">That code is not in the Sitemapper catalog.</p>`,
        path: `/issues/${code}`,
        noindex: true,
      });
    }
    const body = `
<p class="kicker">${catalogPill(doc.severity)}</p>
<h1 class="serif">${escapeHtml(doc.title)}</h1>
<p class="lede">${escapeHtml(doc.meaning)}</p>
<div class="card">${cardHead('Why it matters')}<p>${escapeHtml(doc.why)}</p></div>
<div class="card">${cardHead('Example')}<p>${escapeHtml(doc.example)}</p></div>
<div class="card">${cardHead('How Sitemapper detects it')}<p>${escapeHtml(doc.detect)}</p></div>
<div class="card">${cardHead('Verify it yourself')}<p>${escapeHtml(doc.verify)}</p></div>
<div class="card">${cardHead('Practical fix')}<p>${escapeHtml(doc.fix)}</p>${
      doc.official ? `<p><a href="${escapeHtml(doc.official)}">Official documentation</a></p>` : ''
    }</div>
<div class="actions"><a class="btn primary" href="/">Run this check on a site</a></div>`;
    return appShell({
      title: `${doc.title} · Sitemapper`,
      description: doc.meaning,
      body,
      path: issuePath(doc.code),
      noindex: false,
    });
  }
  const list = ISSUE_CATALOG.map(
    (doc) =>
      `<li><a href="${issuePath(doc.code)}">${escapeHtml(doc.title)}</a> ${catalogPill(doc.severity)}<div class="proof">${escapeHtml(doc.code)}</div></li>`
  ).join('');
  const body = `<p class="kicker">Issue encyclopedia</p><h1 class="serif">Deterministic issue codes</h1><p class="lede">Every Sitemapper diagnosis has a code, evidence, and a public explanation. AI never invents the underlying finding.</p><div class="card">${cardHead('Issue codes')}<ul class="list">${list}</ul></div>`;
  return appShell({
    title: 'Issue encyclopedia · Sitemapper',
    description: 'Public explanations for Sitemapper indexability issue codes.',
    body,
    path: '/issues',
    noindex: false,
  });
}

export function toolPageHtml(slug: string, title: string, lede: string, focus: string): string {
  const body = `
<p class="kicker">Free tool · no account</p>
<h1 class="serif">${escapeHtml(title)}</h1>
<p class="lede">${escapeHtml(lede)}</p>
<div class="card" id="map">
  ${cardHead('Check a site')}
  <form class="form-row" id="map-form" action="/api/report" method="get">
    <input type="hidden" name="focus" value="${escapeHtml(focus)}">
    <input id="site" name="site" type="url" required placeholder="https://example.com">
    <button type="submit">Check site</button>
  </form>
  <p class="hint">This runs the same public sitemap survey engine, then highlights ${escapeHtml(focus)} evidence. No signup.</p>
</div>`;
  return appShell({
    title: `${title} · Sitemapper`,
    description: lede,
    body,
    path: `/tools/${slug}`,
    noindex: false,
  });
}

export { css, escapeHtml, humanize };
