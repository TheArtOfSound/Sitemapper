import { describe, expect, it } from 'vitest';
import { addSiteHtml, dashboardHtml, incidentHtml, siteHtml, sitesListHtml } from './html.js';

const user = {
  userId: 'usr_demo',
  workspaceId: 'wsp_demo',
  email: 'operator@example.com',
  name: 'Demo workspace',
  brandName: 'Demo workspace',
  plan: 'free',
  stripeStatus: 'none',
  entitlements: {},
} as never;

describe('incident surfaces', () => {
  it('renders the preserved sitemap collapse evidence and bounded guidance', () => {
    const markup = incidentHtml({
      user,
      project: { id: 'prj_demo', host: 'example.com' },
      event: {
        id: 'chg_demo',
        code: 'SITEMAP_URL_COUNT_DROP',
        severity: 'critical',
        url: null,
        before_json: '1361',
        after_json: '0',
        grouped_count: 1361,
        created_at: '2026-08-21T08:15:38.000Z',
      },
      current: { declared_urls: 1361, generated_at: '2026-08-21T12:00:48.000Z' },
    });

    expect(markup).toContain('Sitemap URLs 1,361 → 0');
    expect(markup).toContain('Search visibility risk');
    expect(markup).toContain('not proof that traffic or rankings changed');
    expect(markup).toContain('Grouped changes');
    expect(markup).toContain('Latest observed state');
    expect(markup).toContain('The latest trusted snapshot records <strong>1,361 sitemap URLs</strong>');
    expect(markup).toContain('does not independently prove that URLs were deleted');
  });

  it('keeps a recovered site healthy while preserving its historical incident link', () => {
    const markup = dashboardHtml(
      user,
      [
        {
          id: 'prj_demo',
          host: 'example.com',
          last_status: 'ok',
          last_finished_at: '2026-08-21T12:00:00.000Z',
          next_run_at: '2026-08-22T12:00:00.000Z',
          declared_urls: 1361,
          index_score: 92,
          errors: 0,
          critical: 4,
        },
      ],
      [],
      [
        {
          id: 'chg_demo',
          host: 'example.com',
          projectId: 'prj_demo',
          code: 'SITEMAP_URL_COUNT_DROP',
          severity: 'critical',
          url: null,
          before_json: '1361',
          after_json: '0',
          created_at: '2026-08-21T08:15:38.000Z',
          grouped_count: 1361,
        },
      ]
    );

    expect(markup).toContain('<b class="health healthy">Healthy</b>');
    expect(markup).toContain('Sitemap URLs 1,361 → 0');
    expect(markup).toContain('/app/sites/prj_demo/changes?event=chg_demo');
  });

  it('collapses same-scan timeline noise and caps the dashboard list', () => {
    const today = new Date().toISOString().slice(0, 10);
    const events = Array.from({ length: 12 }, (_, index) => ({
      id: `chg_${index}`,
      host: 'example.com',
      projectId: 'prj_demo',
      code: index < 4 ? 'CANONICAL_CHANGED' : `CHANGE_${index}`,
      severity: 'warning',
      url: `https://example.com/${index}`,
      before_json: null,
      after_json: null,
      created_at: index < 4 ? `${today}T08:00:00.000Z` : `${today}T07:${String(index).padStart(2, '0')}:00.000Z`,
      grouped_count: 1,
    }));
    const markup = dashboardHtml(user, [demoSite], events, []);

    expect(markup.match(/CANONICAL CHANGED/g)).toHaveLength(1);
    expect(markup.match(/<time datetime=/g)).toHaveLength(8);
  });

  it('shows one canonical sitemap-collapse incident on the site overview', () => {
    const base = {
      severity: 'critical',
      url: null,
      before_json: '1361',
      after_json: '0',
      grouped_count: 1361,
    };
    const markup = siteHtml({
      user,
      project: { id: 'prj_demo', host: 'example.com', site_url: 'https://example.com', gsc_property: null },
      monitor: {
        enabled: 1,
        frequency_minutes: 60,
        last_status: 'ok',
        next_run_at: '2026-08-24T09:00:00.000Z',
        last_finished_at: '2026-08-24T08:00:00.000Z',
      },
      snapshot: {
        declared_urls: 1361,
        live_urls: 200,
        indexable_urls: 200,
        errors: 0,
        warnings: 0,
        index_score: 100,
        seo_score: 35,
        sitemap_score: 100,
        generated_at: '2026-08-24T08:00:00.000Z',
        fingerprint: 'demo',
      },
      changes: [
        { ...base, id: 'chg_removed', code: 'URL_REMOVED', created_at: '2026-08-21T08:00:00.000Z' },
        { ...base, id: 'chg_drop', code: 'SITEMAP_URL_COUNT_DROP', created_at: '2026-08-21T08:00:00.000Z' },
        { ...base, id: 'chg_old', code: 'SITEMAP_URL_COUNT_DROP', created_at: '2026-08-20T08:00:00.000Z' },
      ],
    });

    expect(markup).toContain('Priority incidents <span class="pill critical">1</span>');
    expect(markup).toContain('Last recorded incident: Sitemap URLs 1,361 → 0.');
    expect(markup).toContain('event=chg_drop');
    expect(markup).not.toContain('event=chg_removed');
    expect(markup).not.toContain('event=chg_old');
  });
});

const demoSite = {
  id: 'prj_demo',
  host: 'example.com',
  last_status: 'ok',
  last_finished_at: '2026-08-21T12:00:00.000Z',
  next_run_at: '2026-08-22T12:00:00.000Z',
  declared_urls: 1361,
  index_score: 92,
  errors: 0,
  critical: 4,
};

describe('workspace CTAs', () => {
  it('dashboard empty state points to add-site and billing, not the public checker', () => {
    const markup = dashboardHtml(user, []);
    expect(markup).toContain('href="/app/sites/new"');
    expect(markup).toContain('href="/app/billing"');
    expect(markup).toContain('Add your first site');
    expect(markup).not.toMatch(/class="btn primary"[^>]*href="\/"/);
    expect(markup).not.toContain('Run a free check');
  });

  it('dashboard with a site includes Add site, Billing, and the sites index', () => {
    const markup = dashboardHtml(user, [demoSite], [], []);
    expect(markup).toContain('href="/app/sites/new"');
    expect(markup).toContain('>Add site</a>');
    expect(markup).toContain('href="/app/billing"');
    expect(markup).toContain('href="/app/sites"');
    expect(markup).toContain('Free plan');
  });

  it('addSiteHtml posts to /app/sites and links billing', () => {
    const markup = addSiteHtml(user);
    expect(markup).toContain('action="/app/sites"');
    expect(markup).toContain('method="post"');
    expect(markup).toContain('href="/app/billing"');
    expect(markup).toContain('name="site"');
    expect(markup).toContain('placeholder="https://example.com"');
  });

  it('sitesListHtml empty state adds a site without sending users to the public checker', () => {
    const markup = sitesListHtml(user, []);
    expect(markup).toContain('href="/app/sites/new"');
    expect(markup).toContain('Add site');
    expect(markup).toContain('No sites yet');
    expect(markup).not.toMatch(/class="btn primary"[^>]*href="\/"/);
  });
});
