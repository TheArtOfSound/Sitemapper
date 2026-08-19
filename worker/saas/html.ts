import { ISSUE_CATALOG, issueDoc, issuePath } from '../../src/issues/catalog.js';
import { PLAN_PRICES_USD, PLANS, type PlanId } from '../../src/plans.js';
import { css, escapeHtml, humanize, shell } from '../render.js';
import type { SessionUser } from './auth.js';

export function appShell(opts: {
  title: string;
  description: string;
  body: string;
  path: string;
  user?: SessionUser | null;
  wide?: boolean;
  noindex?: boolean;
}): string {
  const markup = shell({
    title: opts.title,
    description: opts.description,
    path: opts.path,
    noindex: opts.noindex ?? true,
    body: opts.body,
  });
  const signedIn = opts.user
    ? markup.replace('<a href="/login">Sign in</a>', '<a href="/app">App</a><a href="/logout">Sign out</a>')
    : markup;
  return signedIn
    .replace('class="wrap"', opts.wide ? 'class="wrap" style="max-width:1120px"' : 'class="wrap"')
    .replace('class="loading" id="loading"', 'class="loading" id="loading" hidden');
}

export function loginHtml(next: string, envFlags: { github: boolean; google: boolean; dev: boolean }, error?: string): string {
  const q = `?next=${encodeURIComponent(next)}`;
  const buttons = [
    envFlags.github ? `<a class="btn primary" href="/auth/github${q}">Continue with GitHub</a>` : '',
    envFlags.google ? `<a class="btn" href="/auth/google${q}">Continue with Google</a>` : '',
    envFlags.dev ? `<a class="btn" href="/auth/dev${q}">Local dev login</a>` : '',
  ]
    .filter(Boolean)
    .join('');
  const body = `
<p class="kicker">Account</p>
<h1>Sign in to monitor a site</h1>
<p class="lede">Anonymous scans stay free. An account unlocks history, diffs, alerts, and deploy guardrails.</p>
${error ? `<div class="verdict"><strong>${escapeHtml(error)}</strong></div>` : ''}
<div class="card">
  <h2>Choose a sign-in method</h2>
  <div class="actions">${buttons || '<p>No login providers are configured on this deployment. Set GitHub/Google OAuth secrets, or AUTH_DEV_LOGIN=1 for local development.</p>'}</div>
  <p class="hint">Google sign-in also requests Search Console readonly access so we can label INDEXED state when you connect a property. Sitemap submission is a hint, not a guarantee of indexing.</p>
</div>`;
  return appShell({ title: 'Sign in · Sitemapper', description: 'Sign in to monitor sitemap and indexability changes.', body, path: '/login', noindex: true });
}

export function pricingHtml(user?: SessionUser | null): string {
  const cards = (Object.keys(PLANS) as PlanId[])
    .map((id) => {
      const plan = PLANS[id];
      const price = PLAN_PRICES_USD[id];
      const cta =
        id === 'free'
          ? `<a class="btn" href="/">Run a free scan</a>`
          : user
            ? `<form method="post" action="/app/billing/checkout"><input type="hidden" name="plan" value="${id}"><input type="hidden" name="interval" value="month"><button class="btn primary" type="submit">Upgrade to ${price.label}</button></form>`
            : `<a class="btn primary" href="/login?next=${encodeURIComponent(`/app/billing?plan=${id}`)}">Start ${price.label}</a>`;
      return `<div class="card">
        <h2>${escapeHtml(price.label)}</h2>
        <p><strong style="color:var(--text);font:700 1.6rem/1 var(--mono)">${price.monthly ? `$${price.monthly}/mo` : 'Free'}</strong>${price.annual ? ` · $${price.annual}/yr` : ''}</p>
        <ul class="list">
          <li>${plan.sites} site${plan.sites === 1 ? '' : 's'}</li>
          <li>${plan.monitoredUrls.toLocaleString()} monitored URLs</li>
          <li>${plan.frequencyMinutes >= 1440 ? 'Daily' : `Every ${plan.frequencyMinutes / 60}h`} change checks</li>
          <li>${plan.historyDays}-day history</li>
          <li>${plan.emailAlerts ? 'Email alerts' : 'No email alerts'}</li>
          <li>${plan.gsc ? 'Google Search Console' : 'GSC: not included'}</li>
          <li>${plan.github ? 'GitHub / CI guardrail' : 'CI guardrail: not included'}</li>
        </ul>
        <div class="actions">${cta}</div>
      </div>`;
    })
    .join('');
  const body = `
<p class="kicker">Pricing</p>
<h1>Pay for change intelligence, not another score.</h1>
<p class="lede">Anonymous scans stay free. Monitoring is metered by URLs and expensive deep checks — not unlimited hourly crawls of 100k-page sites.</p>
<div class="scores" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));align-items:stretch">${cards}</div>
<p class="hint">Quotas are enforced server-side from the Stripe subscription. A client-side plan label never grants access. Sitemap submission to Google is a hint, not indexing.</p>`;
  return appShell({
    title: 'Pricing · Sitemapper',
    description: 'Free sitemap surveys. Builder $19, Pro $49, Agency $149 for indexability monitoring and deploy regression alerts.',
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
  }>
): string {
  const rows =
    sites
      .map(
        (site) => `<tr>
      <td><a href="/app/sites/${site.id}">${escapeHtml(site.host)}</a></td>
      <td>${site.index_score ?? '—'}</td>
      <td>${site.declared_urls ?? '—'}</td>
      <td>${site.errors ?? 0} errors · ${site.critical ?? 0} critical diffs</td>
      <td>${escapeHtml(site.last_status || 'pending')}</td>
      <td>${site.last_finished_at ? escapeHtml(site.last_finished_at.slice(0, 16).replace('T', ' ')) : '—'}</td>
      <td>${site.next_run_at ? escapeHtml(site.next_run_at.slice(0, 16).replace('T', ' ')) : '—'}</td>
    </tr>`
      )
      .join('') || `<tr><td colspan="7">No monitored sites yet. Run a free scan, then click Monitor this site.</td></tr>`;
  const body = `
<p class="kicker">${escapeHtml(user.entitlements.plan)} · ${escapeHtml(user.email || user.userId)}</p>
<h1>Monitored sites</h1>
<p class="lede">Declared inventory, live fetch state, and what changed since the last snapshot. Google index state is unknown until Search Console is connected.</p>
<div class="actions" style="margin-bottom:16px">
  <a class="btn primary" href="/">New scan</a>
  <a class="btn" href="/app/billing">Billing</a>
  <a class="btn" href="/app/settings">Settings</a>
</div>
<div class="table-wrap">
  <table class="data">
    <thead><tr><th>Host</th><th>Index</th><th>URLs</th><th>Regressions</th><th>Last crawl</th><th>Finished</th><th>Next</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
  return appShell({ title: 'Dashboard · Sitemapper', description: 'Monitored sites', body, path: '/app', user, wide: true });
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
  changes: Array<{ code: string; severity: string; summary?: string; grouped_count: number; url: string | null; created_at: string }>;
  delta?: { urls: number; errors: number };
}): string {
  const s = input.snapshot;
  const changeRows =
    input.changes
      .map(
        (row) =>
          `<tr><td>${escapeHtml(row.severity)}</td><td>${escapeHtml(humanize(row.code))}</td><td>${row.grouped_count}</td><td>${escapeHtml(row.url || '—')}</td><td>${escapeHtml(row.created_at.slice(0, 16).replace('T', ' '))}</td></tr>`
      )
      .join('') || '<tr><td colspan="5">No snapshot comparison yet — the next crawl becomes the first baseline.</td></tr>';
  const gsc = input.project.gsc_property
    ? `Search Console property ${escapeHtml(input.project.gsc_property)}`
    : 'Google index state: unknown (Search Console not connected). HTTP 200 is not evidence of indexing.';
  const body = `
<p class="kicker"><a href="/app">Dashboard</a> · ${escapeHtml(input.project.host)}</p>
<h1>${escapeHtml(input.project.host)}</h1>
<p class="lede">${gsc}</p>
<div class="scores">
  <div class="score"><b>${s?.declared_urls ?? '—'}</b><span>Declared</span></div>
  <div class="score"><b>${s?.live_urls ?? '—'}</b><span>Live</span></div>
  <div class="score"><b>${s?.indexable_urls ?? '—'}</b><span>Indexable (live)</span></div>
</div>
<div class="scores">
  <div class="score"><b>${s?.index_score ?? '—'}</b><span>Index</span></div>
  <div class="score"><b>${s?.seo_score ?? '—'}</b><span>SEO</span></div>
  <div class="score"><b>${s?.sitemap_score ?? '—'}</b><span>Sitemap</span></div>
</div>
<p class="hint">Last crawl ${escapeHtml(input.monitor.last_finished_at || 'never')} · next ${escapeHtml(input.monitor.next_run_at || '—')} · ${input.monitor.enabled ? `every ${input.monitor.frequency_minutes}m` : 'paused'}</p>
<div class="actions">
  <form method="post" action="/app/sites/${input.project.id}/crawl"><button class="btn primary" type="submit">Run crawl now</button></form>
  <a class="btn" href="/app/sites/${input.project.id}/changes">Changes</a>
  <a class="btn" href="/app/sites/${input.project.id}/urls">URLs</a>
  <a class="btn" href="/app/sites/${input.project.id}/issues">Issues</a>
  <a class="btn" href="/app/sites/${input.project.id}/history">History</a>
  <a class="btn" href="/app/sites/${input.project.id}/settings">Site settings</a>
</div>
<div class="card">
  <h2>What changed</h2>
  <div class="table-wrap"><table class="data"><thead><tr><th>Class</th><th>Event</th><th>Count</th><th>URL</th><th>When</th></tr></thead><tbody>${changeRows}</tbody></table></div>
</div>`;
  return appShell({
    title: `${input.project.host} · Sitemapper`,
    description: `Indexability overview for ${input.project.host}`,
    body,
    path: `/app/sites/${input.project.id}`,
    user: input.user,
    wide: true,
  });
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
<h1>${escapeHtml(opts.title)}</h1>
<p class="lede">${opts.lede}</p>
<div class="table-wrap"><table class="data"><thead><tr>${opts.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
<tbody>${
    opts.rows.length
      ? opts.rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${opts.headers.length}">None yet.</td></tr>`
  }</tbody></table></div>`;
  return appShell({ title: `${opts.title} · Sitemapper`, description: opts.title, body, path: opts.path, user: opts.user, wide: true });
}

export function issueEncyclopediaHtml(code?: string): string {
  if (code) {
    const doc = issueDoc(code) || ISSUE_CATALOG.find((row) => issuePath(row.code) === `/issues/${code}`);
    if (!doc) {
      return appShell({
        title: 'Unknown issue · Sitemapper',
        description: 'No such issue code.',
        body: `<h1>Unknown issue</h1><p>That code is not in the Sitemapper catalog.</p>`,
        path: `/issues/${code}`,
        noindex: true,
      });
    }
    const body = `
<p class="kicker">${escapeHtml(doc.severity)}</p>
<h1>${escapeHtml(doc.title)}</h1>
<p class="lede">${escapeHtml(doc.meaning)}</p>
<div class="card"><h2>Why it matters</h2><p>${escapeHtml(doc.why)}</p></div>
<div class="card"><h2>Example</h2><p>${escapeHtml(doc.example)}</p></div>
<div class="card"><h2>How Sitemapper detects it</h2><p>${escapeHtml(doc.detect)}</p></div>
<div class="card"><h2>Verify it yourself</h2><p>${escapeHtml(doc.verify)}</p></div>
<div class="card"><h2>Practical fix</h2><p>${escapeHtml(doc.fix)}</p>${
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
      `<li><a href="${issuePath(doc.code)}">${escapeHtml(doc.title)}</a><div class="proof">${escapeHtml(doc.code)} · ${escapeHtml(doc.severity)}</div></li>`
  ).join('');
  const body = `<p class="kicker">Issue encyclopedia</p><h1>Deterministic issue codes</h1><p class="lede">Every Sitemapper diagnosis has a code, evidence, and a public explanation. AI never invents the underlying finding.</p><ul class="list">${list}</ul>`;
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
<h1>${escapeHtml(title)}</h1>
<p class="lede">${escapeHtml(lede)}</p>
<div class="card" id="map">
  <form class="form-row" id="map-form" action="/api/report" method="get">
    <input type="hidden" name="focus" value="${escapeHtml(focus)}">
    <input id="site" name="site" type="url" required placeholder="https://example.com">
    <button type="submit">Run check</button>
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
