import { describe, expect, it } from 'vitest';
import { agentPackMarkdown, buildAgentPack } from './agent-pack.js';
import { buildInsights } from './insights.js';
import { aboutHtml, compareHtml, homeHtml, reportHtml, shell, type Result } from './render.js';

function resultWithScores(scores: Result['scores']): Result {
  const site = 'https://example.com';
  const source: Result['source'] = {
    robotsUrl: 'https://example.com/robots.txt',
    sitemapUrls: ['https://example.com/sitemap.xml'],
    discoveredFromRobots: true,
    inputMode: 'site',
    testedUrls: ['https://example.com/sitemap.xml'],
    failures: [],
    compatibility: scores.available === false ? 'Inconclusive — insufficient crawl evidence' : 'Compatible',
    discoveredUrlCount: 1,
    deepCheckedCount: scores.available === false ? 0 : 1,
  };
  const pages: Result['pages'] = [
    {
      url: 'https://example.com/',
      path: '/',
      type: 'page',
      section: '/',
      deepChecked: scores.available !== false,
      status: scores.available === false ? undefined : 200,
      issues: [],
    },
  ];
  return {
    site,
    generatedAt: '2026-08-22T12:00:00.000Z',
    source,
    scores,
    stats: { pages: 1, sections: 1, errors: 0, warnings: 0, notices: 0 },
    pages,
    issues: [],
    insights: buildInsights(site, pages, source, scores),
  };
}

describe('public scan progress copy', () => {
  it('does not extrapolate a numeric ETA from fixed discovery milestones', () => {
    const markup = homeHtml({ runs: 10, pages: 200 });

    expect(markup).toContain('Timing depends on origin and sitemap size; slow discovery is reported as inconclusive.');
    expect(markup).toContain("lastStage==='pages'");
    expect(markup).toContain('checking sitemap source');
    expect(markup).not.toContain('(s*(100-lastPercent))/lastPercent');
    expect(markup).not.toContain('Typical time 8–40s');
  });
});

describe('score availability', () => {
  it('shows and exports Not scored without leaking stale numeric values', () => {
    const result = resultWithScores({ index: 99, seo: 98, sitemap: 97, available: false });
    const markup = reportHtml(result);

    expect(markup.match(/<b>Not scored<\/b>/g)).toHaveLength(3);
    expect(markup).toContain('Not scored because the crawl returned insufficient evidence.');
    expect(markup).not.toContain('<b>99</b>');
    expect(markup).not.toContain('Index 99');
    expect(markup).toContain('Run the survey again before monitoring');
    expect(markup).not.toContain('Monitor this site');
    expect(markup).toContain('What to do next');
    expect(markup).toContain('Retry and verify sitemap availability');
    expect(markup).not.toContain('Publish a fetchable XML sitemap');

    const pack = buildAgentPack(result);
    const serialized = JSON.stringify(pack);
    const markdown = agentPackMarkdown(pack);
    const context = JSON.parse(pack.files.find((file) => file.path === 'sitemapper/context.json')!.content);

    expect(pack.summary.scores).toEqual({ available: false, label: 'Not scored' });
    expect(context.scores).toEqual({ available: false, label: 'Not scored' });
    expect(markdown).toContain('- Scores: Not scored');
    expect(markdown).not.toContain('Index 99');
    expect(serialized).not.toContain('"index":99');
    expect(serialized).not.toContain('"seo":98');
    expect(serialized).not.toContain('"sitemap":97');
    expect(serialized).not.toContain('Publish a fetchable XML sitemap');
    expect(serialized).toContain('Sitemap candidates checked');
    expect(serialized).not.toContain('Sitemaps loaded');
    expect(result.insights.proof[0]).toContain('Not scored marker');
    expect(result.insights.proof[0]).not.toContain('99');
  });

  it('keeps unscored fingerprints independent of placeholder numbers', () => {
    const stale = resultWithScores({ index: 99, seo: 98, sitemap: 97, available: false });
    const zeroed = resultWithScores({ index: 0, seo: 0, sitemap: 0, available: false });

    expect(stale.insights.fingerprint).toBe(zeroed.insights.fingerprint);
  });

  it('preserves numeric reports and exports when the marker is absent', () => {
    const result = resultWithScores({ index: 88, seo: 72, sitemap: 91 });
    const markup = reportHtml(result);
    const pack = buildAgentPack(result);
    const markdown = agentPackMarkdown(pack);
    const context = JSON.parse(pack.files.find((file) => file.path === 'sitemapper/context.json')!.content);

    expect(markup).toContain('<span>Index</span><b>88</b>');
    expect(markup).toContain('Index 88, SEO 72, Sitemap 91.');
    expect(markup).toContain('Keep this as a baseline');
    expect(markup).toContain('Monitor this site');
    expect(pack.summary.scores).toEqual({ index: 88, seo: 72, sitemap: 91 });
    expect(context.scores).toEqual({ index: 88, seo: 72, sitemap: 91 });
    expect(markdown).toContain('- Scores: Index 88 · SEO 72 · Sitemap 91');
    expect(result.insights.proof[0]).toContain('structural signature, scores, and discovered sitemap set');
  });
});

describe('logged-in app chrome', () => {
  const markup = shell({
    title: 'Dashboard',
    description: 'Workspace',
    body: '<p>dashboard</p>',
    chrome: 'app',
    path: '/app',
    userEmail: 'operator@example.com',
    workspaceName: 'Oortstack',
  });

  it('links billing, sites, changes, settings, add site, and sign out from chrome', () => {
    expect(markup).toContain('href="/app/sites/new"');
    expect(markup).toContain('href="/app/billing"');
    expect(markup).toContain('href="/app/sites"');
    expect(markup).toContain('<a href="/app/sites" title="Sites" aria-label="Sites">');
    expect(markup).not.toContain('<a href="/app" title="Sites" aria-label="Sites">');
    expect(markup).toContain('href="/app/changes"');
    expect(markup).toContain('href="/logout"');
    expect(markup).toContain('href="/app/settings"');
  });

  it('does not use the public marketing footer on app pages', () => {
    expect(markup).not.toContain('Free check · website safety');
    expect(markup).toContain('href="/app/sites/new">Add site</a> ·');
    expect(markup).toContain('href="/logout">Sign out</a>');
  });

  it('exposes account destinations from the topbar menu and rail', () => {
    expect(markup).toContain('class="account-menu"');
    expect(markup).toContain('<a href="/app/settings" class="initials" aria-label="Account">');
    expect(markup).toContain('href="/guides/xml-sitemap-checker"');
    expect(markup).toContain('href="/app/settings#alerts"');
    expect(markup).toContain('Oortstack');
  });

  it('uses the generated Sitemapper mark in app chrome and platform icons', () => {
    expect(markup.match(/src="\/brand\/logo-mark\.png"/g)).toHaveLength(2);
    expect(markup).toContain('href="/brand/favicon-32.png" type="image/png" sizes="32x32"');
    expect(markup).toContain('href="/brand/apple-touch-icon.png" sizes="180x180"');
    expect(markup).not.toContain('href="/brand/mark.jpg"');
  });
});

describe('operator trust and truthful product boundaries', () => {
  const markup = aboutHtml();

  it('names the person and company responsible for Sitemapper', () => {
    expect(markup).toContain('Built by Bryan Leonard.');
    expect(markup).toContain('https://imagineqira.com/bryanleonard/?view=systems');
    expect(markup).toContain('https://github.com/TheArtOfSound/Sitemapper');
    expect(markup).toContain('mailto:bryanleonard@imagineqira.com?subject=Sitemapper%20question');
  });

  it('states sampling limits and avoids claiming crawler results are business impact', () => {
    expect(markup).toContain('not a full penetration test, uptime guarantee');
    expect(markup).toContain('should be treated as inconclusive');
    expect(markup).toContain('do not convert a broken page into an invented dollar-loss estimate');
    expect(markup).toContain('14 days of history');
    expect(markup).toContain('href="/pricing"');
  });

  it('keeps the builder link only in public chrome, not the signed-in workspace', () => {
    const publicMarkup = homeHtml({ runs: 1, pages: 1 });
    expect(publicMarkup).toContain('href="/about">Built by Bryan Leonard</a>');
    const appMarkup = shell({ title: 'Dashboard', description: 'Workspace', body: 'dashboard', chrome: 'app' });
    expect(appMarkup).not.toContain('href="/about">Built by Bryan Leonard</a>');
  });
});


describe('scan-first editorial public experience', () => {
  const markup = homeHtml({ runs: 27, pages: 908 });

  it('puts a real scan form before secondary narrative or recorded video', () => {
    const hero = markup.indexOf('id="sm-hero-title"');
    const form = markup.indexOf('id="map-form"');
    const nextSection = markup.indexOf('id="how-it-works"');
    const video = markup.indexOf('<video controls');
    expect(hero).toBeGreaterThan(0);
    expect(form).toBeGreaterThan(hero);
    expect(nextSection).toBeGreaterThan(form);
    expect(video).toBeGreaterThan(nextSection);
    expect(markup).toContain('action="/api/report"');
    expect(markup).toContain('name="site" type="url"');
    expect(markup).toContain('id="site"');
    expect(markup).toContain("fetch('/api/scan?site='+encodeURIComponent(site)");
    expect(markup).not.toContain('autoplay muted loop');
  });

  it('renders accurate limits, source-specific examples and actual dynamic stats', () => {
    expect(markup).toContain('Up to 1,200 sitemap URLs inventoried and 40 live pages sampled per free scan.');
    expect(markup).toContain('slow discovery is reported as inconclusive.');
    expect(markup).toContain('27 surveys');
    expect(markup).toContain('908 sitemap URLs discovered across checks');
    expect(markup).toContain('href="/api/report?site=https%3A%2F%2Fwesearch.press"');
    expect(markup).toContain('href="/api/report?site=https%3A%2F%2Fimagineqira.com"');
  });

  it('keeps pricing, account access, support links and public scope separate from the app', () => {
    expect(markup).toContain('class="site-public"');
    expect(markup).toContain('href="/pricing"');
    expect(markup).toContain('href="/about"');
    expect(markup).toContain('href="/login"');
    expect(markup).toContain('href="/#how-it-works"');
    expect(markup).toContain('Built by Bryan Leonard');
    expect(markup).toContain('not a live report');
    const workspace = shell({title:'Workspace',description:'Workspace',body:'content',chrome:'app'});
    expect(workspace).toContain('class="app-shell"');
    expect(workspace).not.toContain('class="site-public"');
  });
});

describe('Sitemapper topology identity and comparison flow', () => {
  it('makes the illustration explicit rather than presenting it as observed output', () => {
    const page = homeHtml({runs:27,pages:908});
    expect(page).toContain('ILLUSTRATIVE ROUTE MAP');
    expect(page).toContain('ILLUSTRATIVE EXAMPLE');
    expect(page).toContain('role="img" aria-label="Illustration:');
    expect(page).toContain('id="map-form"');
    expect(page).not.toContain('autoplay muted loop');
  });
  it('replaces the hard-to-read horizontal comparison table with three guided use cases', () => {
    const page = compareHtml();
    expect(page).toContain('sm-compare-grid');
    expect(page).toContain('Check now.');
    expect(page).toContain('Watch the change.');
    expect(page).toContain('Build a guardrail.');
    expect(page).toContain('Detection is not proof of business impact');
    expect(page).toContain('href="/pricing"');
    expect(page).not.toContain('<table class="data">');
  });
});
