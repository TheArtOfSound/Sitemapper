import { describe, expect, it } from 'vitest';
import { agentPackMarkdown, buildAgentPack } from './agent-pack.js';
import { buildInsights } from './insights.js';
import { homeHtml, reportHtml, shell, type Result } from './render.js';

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
