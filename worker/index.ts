import { XMLParser } from 'fast-xml-parser';
import { parseRobots, isPathAllowed, requestPath, type RobotsRules } from '../src/core/robots.js';
import { assertPublicHttpUrl, readLimitedBody, resolveAndAssertPublic, SsrfError } from '../src/security/ssrf.js';
import { buildInsights, type Issue as InsightIssue } from './insights.js';
import { agentPackFlat, agentPackMarkdown, buildAgentPack } from './agent-pack.js';
import {
  aboutHtml,
  agentPackPageHtml,
  compareHtml,
  csvFromResult,
  errorHtml,
  guideConflictsHtml,
  guideXmlCheckerHtml,
  homeHtml,
  llmsTxt,
  reportHtml,
  robotsTxt,
  sitemapXml,
  type Issue,
  type Page,
  type Result,
  type Source,
} from './render.js';
import { handleSaas } from './saas/app.js';
import type { Env as SaasEnv } from './saas/env.js';
import { handleQueue, handleScheduled } from './saas/jobs.js';
import { isValidReportId, loadReport, saveReport, type StoredReport } from './store.js';
import { criticalJourneyHrefs } from '../src/diff/impact.js';

type Env = SaasEnv;
type Entry = { url: string; lastmod?: string };
type Candidate = Source & { site: string; rules: RobotsRules; discoveryInconclusive?: boolean };

const MAX_SITEMAPS = 35;
const MAX_URLS = 1200;
const MAX_DEEP = 40;
const FETCH_BATCH = 6;
const TIMEOUT_MS = 6500;
const ANONYMOUS_DISCOVERY_BUDGET_MS = 40_000;
const MAX_REDIRECTS = 8;
const UA = 'SitemapperWorker/1.2 (+https://sitemapper.oortstack.com; +https://github.com/TheArtOfSound/Sitemapper)';
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', trimValues: true });
const ORIGIN = 'https://sitemapper.oortstack.com';

type ScanStage = 'start' | 'robots' | 'sitemaps' | 'pages' | 'score' | 'save' | 'done' | 'error';
type ScanProgress = {
  stage: ScanStage;
  label: string;
  detail?: string;
  percent: number;
  current?: number;
  total?: number;
  shareUrl?: string;
  error?: string;
};
type AnalyzeOpts = {
  maxUrls?: number;
  maxDeep?: number;
  discoveryBudgetMs?: number;
  onProgress?: (event: ScanProgress) => Promise<void> | void;
};

class DiscoveryBudgetError extends Error {
  constructor() {
    super('Anonymous sitemap discovery reached its time limit.');
    this.name = 'DiscoveryBudgetError';
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') return json({ ok: true }, 204);

    try {
      const saas = await handleSaas(request, env);
      if (saas) return saas;
    } catch (error) {
      if (error instanceof SsrfError) return json({ error: error.message }, 400);
      console.error('saas_error', { message: messageOf(error) });
    }

    if (path === '/api/analyze' || path === '/api/report' || path === '/api/scan' || path === '/api/csv' || path === '/api/agent-pack' || path === '/api/pack') {
      const limited = await enforceAnonymousRateLimit(request, env);
      if (limited) return limited;
    }

    // SEO / discovery surfaces
    if (path === '/robots.txt') return text(robotsTxt(), 'text/plain; charset=utf-8', 200, 'public, max-age=3600');
    if (path === '/sitemap.xml') return text(sitemapXml(), 'application/xml; charset=utf-8', 200, 'public, max-age=3600');
    if (path === '/llms.txt') return text(llmsTxt(), 'text/plain; charset=utf-8', 200, 'public, max-age=3600');
    if (path === '/about') return html(aboutHtml(), 200, 'public, max-age=600');
    if (path === '/compare') return html(compareHtml(), 200, 'public, max-age=600');
    if (path === '/guides/xml-sitemap-checker') return html(guideXmlCheckerHtml(), 200, 'public, max-age=600');
    if (path === '/guides/robots-sitemap-conflicts') return html(guideConflictsHtml(), 200, 'public, max-age=600');

    // Saved share URLs: /r/{id}[/json|csv|pack|/pack/view]
    const shareMatch = path.match(/^\/r\/([a-z0-9]{8,16})(?:\/(json|csv|pack)(?:\/(view))?)?$/i);
    if (shareMatch) {
      return handleShare(shareMatch[1], shareMatch[2] || 'report', shareMatch[3], url, env);
    }

    // APIs
    if (path === '/api/stats') return json(await readStats(env));
    if (path === '/api/analyze') return handleAnalyze(url, env);
    if (path === '/api/scan') return handleScanStream(url, env);
    if (path === '/api/report') return handleReport(url, env, request);
    if (path === '/api/csv') return handleCsv(url, env);
    if (path === '/api/agent-pack') return handleAgentPack(url, env);
    if (path === '/api/pack') return handleAgentPackPage(url, env);

    if (path === '/') return html(homeHtml(await readStats(env)), 200, 'public, max-age=30, must-revalidate');

    return html(
      errorHtml('Not found', 'That path is not part of Sitemapper. Try the map form or a guide.', `Path: ${path}`),
      404
    );
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(env));
  },

  async queue(batch: MessageBatch<{ jobId: string; projectId: string; workspaceId: string; kind: 'manual' | 'scheduled' | 'ci'; siteUrl: string }>, env: Env): Promise<void> {
    await handleQueue(batch, env, analyze);
  },
};

async function handleShare(
  id: string,
  kind: string,
  sub: string | undefined,
  url: URL,
  env: Env
): Promise<Response> {
  const stored = await loadReport(env.SITEMAPPER_STATS, id);
  if (!stored) {
    return html(
      errorHtml(
        'Survey not found',
        'This share link is missing or expired (saved reports last 30 days).',
        `ID: ${id}`
      ),
      404
    );
  }

  const result = stored.result;
  const host = safeHost(result.site).replace(/[^a-z0-9.-]+/gi, '_');

  if (kind === 'report') {
    return html(
      reportHtml(result, {
        shareId: stored.id,
        expiresAt: stored.expiresAt,
        createdAt: stored.createdAt,
      }),
      200,
      'public, max-age=300'
    );
  }

  if (kind === 'json') {
    return json({
      shareId: stored.id,
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
      ...result,
    });
  }

  if (kind === 'csv') {
    return new Response(csvFromResult(result), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="sitemapper-${host}-${stored.id}.csv"`,
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=300',
      },
    });
  }

  if (kind === 'pack') {
    if (sub === 'view') {
      const pack = buildAgentPack(result);
      return html(agentPackPageHtml(result, pack, { shareId: stored.id }), 200, 'public, max-age=300');
    }
    return packResponse(result, url.searchParams.get('format') || 'json', host, stored.id);
  }

  return html(errorHtml('Not found', 'Unknown share path.'), 404);
}

async function handleScanStream(url: URL, env: Env): Promise<Response> {
  const site = url.searchParams.get('site') || '';
  if (!site.trim()) return json({ error: 'Missing site parameter.' }, 400);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const send = async (event: ScanProgress) => {
    await writer.write(encoder.encode(`${JSON.stringify(event)}\n`));
  };

  void (async () => {
    try {
      const result = await analyze(site, {
        discoveryBudgetMs: ANONYMOUS_DISCOVERY_BUDGET_MS,
        onProgress: send,
      });
      await send({
        stage: 'save',
        label: 'Saving snapshot',
        detail: `${result.source.discoveredUrlCount.toLocaleString()} URLs · ${result.stats.errors} errors`,
        percent: 96,
      });
      await incrementStats(env, result.source.discoveredUrlCount);
      const stored = await saveReport(env.SITEMAPPER_STATS, result);
      if (!stored) {
        await send({ stage: 'error', label: 'Survey finished but the snapshot could not be stored.', percent: 96, error: 'Snapshot store failed.' });
        return;
      }
      await send({
        stage: 'done',
        label: 'Report ready',
        detail: result.site,
        percent: 100,
        shareUrl: `/r/${stored.id}`,
      });
    } catch (error) {
      const message = error instanceof SsrfError ? error.message : messageOf(error);
      try {
        await send({ stage: 'error', label: 'Survey stopped', detail: message, percent: 0, error: message });
      } catch {
        /* client gone */
      }
    } finally {
      try {
        await writer.close();
      } catch {
        /* already closed */
      }
    }
  })();

  return new Response(readable, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'access-control-allow-origin': '*',
    },
  });
}

async function handleAnalyze(url: URL, env: Env): Promise<Response> {
  try {
    const id = url.searchParams.get('id') || '';
    if (id) {
      const stored = await loadReport(env.SITEMAPPER_STATS, id);
      if (!stored) return json({ error: 'Survey not found or expired.', id }, 404);
      return json({ shareId: stored.id, createdAt: stored.createdAt, expiresAt: stored.expiresAt, ...stored.result });
    }
    const site = url.searchParams.get('site') || '';
    if (!site.trim()) return json({ error: 'Missing site parameter (or id for a saved survey).' }, 400);
    const result = await analyze(site, { discoveryBudgetMs: ANONYMOUS_DISCOVERY_BUDGET_MS });
    await incrementStats(env, result.source.discoveredUrlCount);
    const stored = await saveReport(env.SITEMAPPER_STATS, result);
    return json(
      stored
        ? { shareId: stored.id, shareUrl: `${ORIGIN}/r/${stored.id}`, expiresAt: stored.expiresAt, ...result }
        : result
    );
  } catch (error) {
    if (error instanceof SsrfError) return json({ error: error.message }, 400);
    return json({ error: messageOf(error) }, 500);
  }
}

async function handleReport(url: URL, env: Env, request: Request): Promise<Response> {
  try {
    const id = url.searchParams.get('id') || '';
    if (id) {
      const stored = await loadReport(env.SITEMAPPER_STATS, id);
      if (!stored) {
        return html(
          errorHtml('Survey not found', 'This share link is missing or expired (30 days).', `ID: ${id}`),
          404
        );
      }
      return redirect(`${new URL(request.url).origin}/r/${stored.id}`);
    }

    const site = url.searchParams.get('site') || '';
    if (!site.trim()) {
      return html(errorHtml('Missing site', 'Enter a website URL or direct sitemap URL.'), 400);
    }
    const result = await analyze(site, { discoveryBudgetMs: ANONYMOUS_DISCOVERY_BUDGET_MS });
    await incrementStats(env, result.source.discoveredUrlCount);
    const stored = await saveReport(env.SITEMAPPER_STATS, result);
    if (stored) {
      // Canonical share URL — packs/json/csv open without re-crawling
      return redirect(`${new URL(request.url).origin}/r/${stored.id}`);
    }
    return html(reportHtml(result));
  } catch (error) {
    const status = error instanceof SsrfError ? 400 : 500;
    return html(
      errorHtml(
        'Report failed',
        messageOf(error),
        'Try a direct sitemap URL, a smaller public site, or the www/non-www variant.'
      ),
      status
    );
  }
}

async function handleCsv(url: URL, env: Env): Promise<Response> {
  try {
    const result = await resolveResult(url, env, true);
    if (!result.ok) return text(`error,message\n${result.status},"${result.error}"\n`, 'text/csv; charset=utf-8', result.status);
    const host = safeHost(result.data.site).replace(/[^a-z0-9.-]+/gi, '_');
    const suffix = result.shareId ? `-${result.shareId}` : '';
    return new Response(csvFromResult(result.data), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="sitemapper-${host}${suffix}.csv"`,
        'access-control-allow-origin': '*',
        'cache-control': result.shareId ? 'public, max-age=300' : 'no-store',
      },
    });
  } catch (error) {
    return text(`error,message\n500,"${messageOf(error).replace(/"/g, '""')}"\n`, 'text/csv; charset=utf-8', 500);
  }
}

async function handleAgentPack(url: URL, env: Env): Promise<Response> {
  try {
    const result = await resolveResult(url, env, true);
    if (!result.ok) return json({ error: result.error }, result.status);
    const host = safeHost(result.data.site).replace(/[^a-z0-9.-]+/gi, '_');
    return packResponse(result.data, url.searchParams.get('format') || 'json', host, result.shareId);
  } catch (error) {
    return json({ error: messageOf(error) }, 500);
  }
}

async function handleAgentPackPage(url: URL, env: Env): Promise<Response> {
  try {
    const result = await resolveResult(url, env, true);
    if (!result.ok) {
      return html(errorHtml(result.status === 404 ? 'Survey not found' : 'Missing site', result.error), result.status);
    }
    const pack = buildAgentPack(result.data);
    return html(agentPackPageHtml(result.data, pack, { shareId: result.shareId }));
  } catch (error) {
    return html(errorHtml('Pack failed', messageOf(error), 'Try a direct sitemap URL or a smaller public site.'), 500);
  }
}

/** Load by id (no crawl) or run + optionally save by site. */
async function resolveResult(
  url: URL,
  env: Env,
  countNewSurvey: boolean
): Promise<
  | { ok: true; data: Result; shareId?: string; stored?: StoredReport }
  | { ok: false; status: number; error: string }
> {
  const id = url.searchParams.get('id') || '';
  if (id) {
    if (!isValidReportId(id)) return { ok: false, status: 400, error: 'Invalid share id.' };
    const stored = await loadReport(env.SITEMAPPER_STATS, id);
    if (!stored) return { ok: false, status: 404, error: 'Survey not found or expired.' };
    return { ok: true, data: stored.result, shareId: stored.id, stored };
  }
  const site = url.searchParams.get('site') || '';
  if (!site.trim()) return { ok: false, status: 400, error: 'Missing site or id parameter.' };
  const data = await analyze(site, { discoveryBudgetMs: ANONYMOUS_DISCOVERY_BUDGET_MS });
  if (countNewSurvey) await incrementStats(env, data.source.discoveredUrlCount);
  const stored = await saveReport(env.SITEMAPPER_STATS, data);
  return { ok: true, data, shareId: stored?.id, stored: stored || undefined };
}

function packResponse(result: Result, format: string, host: string, shareId?: string): Response {
  const pack = buildAgentPack(result);
  const suffix = shareId ? `-${shareId}` : '';
  const fmt = format.toLowerCase();
  if (fmt === 'md' || fmt === 'markdown') {
    return new Response(agentPackMarkdown(pack), {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="sitemapper-agent-pack-${host}${suffix}.md"`,
        'access-control-allow-origin': '*',
        'cache-control': shareId ? 'public, max-age=300' : 'no-store',
      },
    });
  }
  if (fmt === 'flat' || fmt === 'txt') {
    return new Response(agentPackFlat(pack), {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="sitemapper-agent-pack-${host}${suffix}.txt"`,
        'access-control-allow-origin': '*',
        'cache-control': shareId ? 'public, max-age=300' : 'no-store',
      },
    });
  }
  const body = shareId
    ? JSON.stringify({ shareId, shareUrl: `${ORIGIN}/r/${shareId}`, ...pack }, null, 2)
    : JSON.stringify(pack, null, 2);
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="sitemapper-agent-pack-${host}${suffix}.json"`,
      'access-control-allow-origin': '*',
      'cache-control': shareId ? 'public, max-age=300' : 'no-store',
    },
  });
}

function redirect(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { location, 'cache-control': 'no-store' },
  });
}

export async function analyze(input: string, opts: AnalyzeOpts = {}): Promise<Result> {
  const maxUrls = opts.maxUrls ?? MAX_URLS;
  const maxDeep = opts.maxDeep ?? MAX_DEEP;
  const discoveryDeadline = opts.discoveryBudgetMs
    ? Date.now() + Math.max(1, opts.discoveryBudgetMs)
    : undefined;
  const progress = async (event: ScanProgress) => {
    await opts.onProgress?.(event);
  };
  assertPublicHttpUrl(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  const target = normalizeInput(input);
  await progress({
    stage: 'start',
    label: 'Starting survey',
    detail: safeHost(target.site),
    percent: 4,
  });
  let bestLoad: Awaited<ReturnType<typeof loadSitemaps>> | undefined;
  let bestSource: Candidate | undefined;
  let discoveryWasInconclusive = false;

  for await (const candidate of discoverCandidates(target, progress, discoveryDeadline)) {
    await progress({
      stage: 'sitemaps',
      label: 'Loading XML sitemaps',
      detail: candidate.sitemapUrls[0] || candidate.site,
      percent: 16,
    });
    const loaded = await loadSitemaps(
      candidate.site,
      candidate.sitemapUrls,
      maxUrls,
      progress,
      discoveryDeadline
    );
    if (candidate.discoveryInconclusive && loaded.entries.length === 0) loaded.inconclusive = true;
    discoveryWasInconclusive ||= loaded.inconclusive;
    candidate.testedUrls.push(...loaded.loaded, ...loaded.failed);
    candidate.failures.push(...loaded.failures);
    if (
      !bestLoad ||
      loaded.entries.length > bestLoad.entries.length ||
      (loaded.loaded.length > 0 && bestLoad.loaded.length === 0) ||
      (bestLoad.inconclusive && !loaded.inconclusive)
    ) {
      bestLoad = loaded;
      bestSource = candidate;
    }
    if (loaded.entries.length > 0) break;
    if (loaded.budgetExceeded) break;
  }

  if (!bestLoad || !bestSource) throw new Error('No discovery candidate was produced.');
  if (bestLoad.entries.length === 0 && discoveryWasInconclusive) bestLoad.inconclusive = true;

  const issues = rootIssues(bestSource, bestLoad, maxUrls, maxDeep);
  const sample = bestLoad.entries.slice(0, maxDeep);
  await progress({
    stage: 'pages',
    label: sample.length ? 'Checking live pages' : 'No URLs to deep-check',
    detail: sample.length ? `0 / ${sample.length} sampled` : bestSource.site,
    percent: 44,
    current: 0,
    total: sample.length,
  });
  const deepPages = maxDeep > 0 ? await inspectPages(sample, progress) : [];
  await progress({
    stage: 'score',
    label: 'Scoring indexability',
    detail: `${bestLoad.entries.length.toLocaleString()} declared · ${deepPages.length} live-checked`,
    percent: 92,
  });
  addDuplicateMetadataIssues(deepPages);
  const declaredEntries = new Map(bestLoad.entries.map((entry) => [normalizeUrl(entry.url), entry]));
  const journeyPages = bestLoad.inconclusive
    ? []
    : await probeCriticalJourneys(bestSource.site, new Set(deepPages.map((page) => page.url)), declaredEntries);
  const extraUrls = new Set(journeyPages.map((page) => page.url));
  const pages = [
    ...deepPages,
    ...journeyPages,
    ...bestLoad.entries.slice(maxDeep).filter((entry) => !extraUrls.has(entry.url)).map(inventoryOnlyPage),
  ];
  const inventoryPages = pages.filter((page) => page.sitemapListed !== false);
  applyRobotsConflicts(inventoryPages, bestSource.rules, issues);
  const allIssues = [...issues, ...pages.flatMap((page) => page.issues)];
  const stats = summarize(inventoryPages, allIssues);
  bestSource.discoveredUrlCount = bestLoad.entries.length;
  bestSource.deepCheckedCount = deepPages.length + journeyPages.length;
  bestSource.compatibility = bestLoad.inconclusive
    ? 'Inconclusive: sitemap discovery timed out before availability could be determined.'
    : compatibilityVerdict(
        bestLoad.entries.length,
        bestLoad.loaded.length,
        bestLoad.failed.length,
        deepPages.filter((page) => page.issues.some((issue) => issue.severity === 'error')).length
      );
  const { site, rules: _rules, discoveryInconclusive: _discoveryInconclusive, ...safeSource } = bestSource;
  void _rules;
  void _discoveryInconclusive;

  const scores = score(
    [...deepPages, ...journeyPages],
    issues,
    inventoryPages,
    bestLoad.entries.length > 0 && !bestLoad.inconclusive
  );
  const insights = buildInsights(
    site,
    inventoryPages.map((p) => ({
      url: p.url,
      path: p.path,
      type: p.type,
      section: p.section,
      deepChecked: p.deepChecked,
      lastmod: p.lastmod,
      issues: p.issues as InsightIssue[],
    })),
    {
      sitemapUrls: bestLoad.loaded.length ? bestLoad.loaded : bestSource.sitemapUrls,
      discoveredUrlCount: bestSource.discoveredUrlCount,
      deepCheckedCount: bestSource.deepCheckedCount,
      compatibility: bestSource.compatibility,
    },
    scores
  );

  return {
    site,
    generatedAt: new Date().toISOString(),
    source: { ...safeSource, sitemapUrls: bestLoad.loaded.length ? bestLoad.loaded : bestSource.sitemapUrls },
    scores,
    stats,
    pages,
    issues,
    insights,
  };
}

function rootIssues(
  source: Candidate,
  loaded: Awaited<ReturnType<typeof loadSitemaps>>,
  maxUrls = MAX_URLS,
  maxDeep = MAX_DEEP
): Issue[] {
  const issues: Issue[] = [];
  const count = loaded.entries.length;
  if (!source.discoveredFromRobots && source.inputMode === 'site') {
    issues.push(
      note(
        'ROBOTS_NO_USABLE_SITEMAP_REFERENCE',
        'robots.txt did not expose a usable XML Sitemap directive; Sitemapper attempted common paths and, when time allowed, a host variant.',
        source.robotsUrl
      )
    );
  }
  if (count === 0 && loaded.inconclusive) {
    issues.push(
      note(
        'SCAN_INCONCLUSIVE',
        'Sitemap discovery timed out before Sitemapper could determine whether a usable sitemap is available. No sitemap outage is asserted from this scan.',
        loaded.failures.slice(0, 5).join(' | ') || source.sitemapUrls.join(', ')
      )
    );
  } else if (count === 0 && loaded.loaded.length > 0) {
    issues.push(
      errorIssue(
        'SITEMAPS_FOUND_BUT_UNUSABLE',
        'Sitemap references were found, but no usable URL entries could be extracted.',
        loaded.loaded.join(', ')
      )
    );
  }
  if (count === 0 && loaded.loaded.length === 0 && !loaded.inconclusive) {
    issues.push(errorIssue('NO_ACCESSIBLE_SITEMAP', 'No accessible XML sitemap could be loaded.', source.sitemapUrls.join(', ')));
  }
  if (count === 1) {
    issues.push(
      warning(
        'SINGLE_URL_SITEMAP',
        'Only 1 URL was found in the sitemap inventory. This is thin unless the site is intentionally one page.',
        `count=${count}`
      )
    );
  } else if (count > 1 && count < 5) {
    issues.push(warning('THIN_SITEMAP', `Only ${count} URLs were found in the sitemap inventory.`, `count=${count}`));
  }
  if (count >= maxUrls) {
    issues.push(
      note(
        'URL_INDEX_LIMIT_REACHED',
        `Added the first ${maxUrls.toLocaleString()} sitemap URLs to this crawl's inventory. The source sitemap may contain more; live checks remain sampled.`,
        `MAX_URLS=${maxUrls}`
      )
    );
  }
  if (count > maxDeep) {
    issues.push(
      note(
        'DEEP_CHECK_LIMIT_REACHED',
        `Live checked ${maxDeep.toLocaleString()} pages and kept the remaining sitemap URLs as inventory-only rows.`,
        `MAX_DEEP=${maxDeep}`
      )
    );
  }
  for (const failed of loaded.failed.slice(0, 25)) {
    issues.push(
      loaded.inconclusive
        ? note('DISCOVERY_ATTEMPT_INCONCLUSIVE', `Could not finish checking sitemap: ${failed}`, failed)
        : warning('SITEMAP_FETCH_FAILED', `Could not load sitemap: ${failed}`, failed)
    );
  }
  for (const failure of loaded.failures.slice(0, 25)) {
    issues.push(note('DISCOVERY_NOTE', failure, failure));
  }
  return issues;
}

async function* discoverCandidates(
  target: {
    input: string;
    site: string;
    mode: 'site' | 'sitemap';
  },
  progress?: (event: ScanProgress) => Promise<void>,
  discoveryDeadline?: number
): AsyncGenerator<Candidate> {
  if (target.mode === 'sitemap') {
    const origin = new URL(target.input).origin;
    await progress?.({
      stage: 'robots',
      label: 'Using a direct sitemap URL',
      detail: target.input,
      percent: 12,
    });
    yield makeCandidate(
      origin,
      `${origin}/robots.txt`,
      [target.input],
      false,
      'sitemap',
      ['Direct sitemap input.'],
      parseRobots('')
    );
    return;
  }

  const origins = candidateOrigins(target.site);
  let originIndex = 0;
  for (const site of origins) {
    originIndex += 1;
    const origin = new URL(site).origin;
    const robotsUrl = `${origin}/robots.txt`;
    await progress?.({
      stage: 'robots',
      label: 'Reading robots.txt',
      detail: robotsUrl,
      percent: 8 + Math.round((originIndex / Math.max(origins.length, 1)) * 6),
    });
    const failures: string[] = [];
    let rules = parseRobots('');
    let discoveryInconclusive = false;
    let budgetExceeded = false;
    try {
      const robots = await fetchText(robotsUrl, discoveryDeadline);
      rules = parseRobots(robots.text);
      const extracted = sitemapsFromRobots(robots.text);
      for (const ignored of extracted.ignored.slice(0, 10)) {
        failures.push(`Ignored non-XML Sitemap directive: ${ignored}`);
      }
      const usable = extracted.urls.filter((item) => sameHost(item, site));
      if (usable.length) {
        yield makeCandidate(site, robotsUrl, usable, true, 'site', failures, rules);
        continue;
      }
      failures.push(`${robotsUrl} loaded but did not expose usable same-host XML Sitemap directives.`);
    } catch (error) {
      discoveryInconclusive = isTimeoutLike(error);
      budgetExceeded = error instanceof DiscoveryBudgetError;
      failures.push(`${robotsUrl} failed: ${messageOf(error)}`);
    }
    const candidate = makeCandidate(site, robotsUrl, commonSitemaps(origin), false, 'site', failures, rules);
    candidate.discoveryInconclusive = discoveryInconclusive;
    yield candidate;
    if (budgetExceeded) return;
  }
}

function makeCandidate(
  site: string,
  robotsUrl: string,
  sitemapUrls: string[],
  discoveredFromRobots: boolean,
  inputMode: 'site' | 'sitemap',
  failures: string[],
  rules: RobotsRules
): Candidate {
  return {
    site,
    robotsUrl,
    sitemapUrls,
    discoveredFromRobots,
    inputMode,
    testedUrls: [robotsUrl],
    failures,
    compatibility: 'Not run yet.',
    discoveredUrlCount: 0,
    deepCheckedCount: 0,
    rules,
  };
}

function applyRobotsConflicts(pages: Page[], rules: RobotsRules, issues: Issue[]): void {
  if (!rules.hasGroups) return;
  let blocked = 0;
  for (const page of pages) {
    if (isPathAllowed(rules, requestPath(page.url))) continue;
    blocked += 1;
    page.issues.push(
      warning('ROBOTS_DISALLOWED_IN_SITEMAP', 'URL is listed in the sitemap but blocked by robots.txt.', page.path)
    );
  }
  if (blocked > 0) {
    issues.push(
      warning(
        'ROBOTS_SITEMAP_CONFLICTS',
        `${blocked} sitemap URL(s) are advertised in the sitemap but disallowed by robots.txt.`,
        `blocked=${blocked}`
      )
    );
  }
}

async function loadSitemaps(
  site: string,
  startUrls: string[],
  maxUrls = MAX_URLS,
  progress?: (event: ScanProgress) => Promise<void>,
  discoveryDeadline?: number
): Promise<{
  entries: Entry[];
  loaded: string[];
  failed: string[];
  failures: string[];
  inconclusive: boolean;
  budgetExceeded: boolean;
}> {
  type QueueItem = { url: string; kind: 'seed' | 'child' };
  let queue: QueueItem[] = [...new Set(startUrls.filter(isSitemapUrl).map(normalizeUrl))].map((url) => ({
    url,
    kind: 'seed',
  }));
  const seen = new Set<string>();
  const entries = new Map<string, Entry>();
  const loaded: string[] = [];
  const failed: string[] = [];
  const failures: string[] = [];
  let timeoutFailures = 0;
  let blockedResponses = 0;
  let budgetExceeded = false;
  let progressPercent = 16;

  const nextPercent = (value: number): number => {
    progressPercent = Math.max(progressPercent, Math.min(42, value));
    return progressPercent;
  };

  const enqueueChild = (input: string): boolean => {
    const url = normalizeUrl(input);
    if (seen.has(url)) return false;
    const queued = queue.find((item) => item.url === url);
    if (queued) {
      const promoted = queued.kind === 'seed';
      queued.kind = 'child';
      return promoted;
    }
    queue.push({ url, kind: 'child' });
    return true;
  };

  while (queue.length && seen.size < MAX_SITEMAPS && entries.size < maxUrls) {
    const item = queue.shift()!;
    const sitemap = item.url;
    if (seen.has(sitemap)) continue;
    if (discoveryDeadline && Date.now() >= discoveryDeadline) {
      budgetExceeded = true;
      failures.push('Anonymous sitemap discovery reached its 40 second time limit before all candidates were checked.');
      break;
    }

    const completedBefore = loaded.length + failed.length;
    const attemptTotal = Math.max(completedBefore + queue.length + 1, 1);
    await progress?.({
      stage: 'sitemaps',
      label: `Checking sitemap ${completedBefore + 1} of ${attemptTotal}`,
      detail: sitemap,
      percent: nextPercent(16 + Math.round((26 * completedBefore) / attemptTotal)),
      current: entries.size,
      total: maxUrls,
    });

    seen.add(sitemap);
    try {
      const response = await fetchText(sitemap, discoveryDeadline);
      const blocked = looksBlocked(response.status, response.text);
      if (blocked) blockedResponses += 1;
      if (response.status < 200 || response.status >= 300) {
        failed.push(sitemap);
        failures.push(`${sitemap} returned HTTP ${response.status}.`);
        if (blocked) {
          failures.push(`${sitemap} looks blocked or challenged by bot protection.`);
        }
      } else {
        loaded.push(sitemap);
        if (blocked) {
          failures.push(`${sitemap} looks blocked or challenged by bot protection.`);
        }
        let added = 0;
        let queuedChild = false;
        const entriesBefore = entries.size;

        try {
          const xml = parser.parse(response.text) as any;
          for (const child of asArray(xml?.sitemapindex?.sitemap)) {
            const loc = textValue(child?.loc);
            if (loc && isSitemapUrl(loc) && sameHost(loc, site) && enqueueChild(loc)) {
              queuedChild = true;
              added += 1;
            }
          }
          for (const entry of asArray(xml?.urlset?.url)) {
            const loc = textValue(entry?.loc);
            if (loc && sameHost(loc, site)) {
              const before = entries.size;
              addEntry(entries, loc, textValue(entry?.lastmod));
              if (entries.size > before) added += 1;
            }
            if (entries.size >= maxUrls) break;
          }
        } catch (error) {
          failures.push(`${sitemap} XML parser fallback used: ${messageOf(error)}`);
        }

        for (const loc of locTags(response.text)) {
          if (!sameHost(loc, site)) continue;
          if (isSitemapUrl(loc)) {
            if (enqueueChild(loc)) {
              queuedChild = true;
              added += 1;
            }
          } else if (isPageUrl(loc)) {
            const before = entries.size;
            addEntry(entries, loc, lastmodNear(response.text, loc));
            if (entries.size > before) added += 1;
          }
          if (entries.size >= maxUrls) break;
        }

        if (added === 0) {
          failures.push(`${sitemap} loaded but produced 0 same-host sitemap children or URL entries.`);
        }

        // Once a speculative root path proves usable, do not probe the other
        // common root paths. Child sitemap files remain queued and are walked.
        if (item.kind === 'seed' && (queuedChild || entries.size > entriesBefore)) {
          queue = queue.filter((queued) => queued.kind === 'child');
        }
      }
    } catch (error) {
      failed.push(sitemap);
      failures.push(`${sitemap} failed: ${messageOf(error)}`);
      if (error instanceof DiscoveryBudgetError) budgetExceeded = true;
      if (isTimeoutLike(error)) timeoutFailures += 1;
    }

    const remaining = queue.filter((queued) => !seen.has(queued.url)).length;
    const done = loaded.length + failed.length;
    const denom = Math.max(done + remaining, 1);
    const pendingChildren = queue.some((queued) => queued.kind === 'child' && !seen.has(queued.url));
    const pendingSeeds = queue.some((queued) => queued.kind === 'seed' && !seen.has(queued.url));
    await progress?.({
      stage: 'sitemaps',
      label: budgetExceeded
        ? 'Sitemap discovery time limit reached'
        : pendingChildren
          ? 'Walking sitemap index'
          : pendingSeeds
            ? 'Trying another sitemap path'
            : 'Sitemap inventory ready',
      detail: `${loaded.length} file${loaded.length === 1 ? '' : 's'} · ${entries.size.toLocaleString()} URLs`,
      percent: nextPercent(16 + Math.round((26 * done) / denom)),
      current: entries.size,
      total: maxUrls,
    });
    if (budgetExceeded) break;
  }

  const inconclusive = entries.size === 0 && (budgetExceeded || timeoutFailures > 0 || blockedResponses > 0);

  return {
    entries: [...entries.values()].sort((a, b) => a.url.localeCompare(b.url)),
    loaded,
    failed,
    failures,
    inconclusive,
    budgetExceeded,
  };
}

async function inspectPages(
  entries: Entry[],
  progress?: (event: ScanProgress) => Promise<void>
): Promise<Page[]> {
  const pages: Page[] = [];
  const total = entries.length;
  for (let i = 0; i < entries.length; i += FETCH_BATCH) {
    const batch = entries.slice(i, i + FETCH_BATCH);
    pages.push(
      ...(await Promise.all(
        batch.map(async (entry) => {
          try {
            const response = await fetchChain(entry.url);
            return deepPage(entry, response.status, response.finalUrl, response.text, response.contentType, {
              hops: response.hops,
              loop: response.loop,
            });
          } catch (error) {
            const page = deepPage(entry);
            page.issues.push(note('FETCH_DETAIL', messageOf(error), messageOf(error)));
            return page;
          }
        })
      ))
    );
    await progress?.({
      stage: 'pages',
      label: pages.length >= total ? 'Live sample complete' : 'Checking live pages',
      detail: `${pages.length} / ${total} sampled`,
      percent: 44 + Math.round((46 * pages.length) / Math.max(total, 1)),
      current: pages.length,
      total,
    });
  }
  return pages;
}

async function probeCriticalJourneys(
  site: string,
  already: Set<string>,
  declaredEntries: Map<string, Entry>
): Promise<Page[]> {
  const origin = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`).origin;
  const out: Page[] = [];
  for (const href of criticalJourneyHrefs(origin)) {
    const declaredEntry = declaredEntries.get(normalizeUrl(href));
    if (!declaredEntry) continue;
    if (already.has(href) || already.has(href.replace(/\/+$/, '')) || already.has(`${href}/`)) continue;
    try {
      assertPublicHttpUrl(href);
      const response = await fetchChain(href);
      const page = deepPage(declaredEntry, response.status, response.finalUrl, response.text, response.contentType, {
        hops: response.hops,
        loop: response.loop,
      });
      out.push(page);
      already.add(href);
    } catch {
      /* skip missing or blocked journeys */
    }
  }
  return out;
}

function deepPage(
  entry: Entry,
  status?: number,
  finalUrl?: string,
  body?: string,
  contentType?: string,
  redirect?: { hops: number; loop: boolean }
): Page {
  const page = basePage(entry, true);
  const generated = ['archive', 'cluster', 'category_page', 'canvas', 'story', 'generated'].includes(page.type);
  const hops = redirect?.hops ?? 0;
  const loop = redirect?.loop ?? false;
  page.status = status;
  if (hops > 0) page.redirects = hops;
  page.title = body ? clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1]) : undefined;
  page.description = body ? clean(meta(body, 'description')) : undefined;
  page.canonical = body ? clean(canonical(body)) : undefined;
  page.ogTitle = body ? clean(og(body, 'og:title') || twitter(body, 'title')) : undefined;
  page.ogImage = body ? Boolean(og(body, 'og:image') || twitter(body, 'image')) : undefined;
  page.hasSchema = body ? /application\/ld\+json/i.test(body) || /\bitemtype\s*=/i.test(body) : undefined;
  page.hreflangCount = body ? countHreflang(body) : undefined;
  const robots = body ? clean(meta(body, 'robots'))?.toLowerCase() : undefined;

  if (!status) page.issues.push(errorIssue('FETCH_FAILED', 'Page could not be fetched.', entry.url));
  else if (status >= 400) page.issues.push(errorIssue('BAD_STATUS', `Page returned HTTP ${status}.`, `status=${status}`));
  else if (status >= 300 && !loop && hops === 0) {
    page.issues.push(warning('REDIRECT_STATUS', `Page returned HTTP ${status}.`, `status=${status}`));
  }
  if (loop) page.issues.push(errorIssue('REDIRECT_LOOP', 'Sitemap URL enters a redirect loop.', entry.url));
  else if (hops >= 2) {
    page.issues.push(
      warning('REDIRECT_CHAIN', `Sitemap URL passes through ${hops} redirects before resolving.`, `hops=${hops}; final=${finalUrl || ''}`)
    );
  } else if (hops === 1 || (finalUrl && normalizeUrl(finalUrl) !== normalizeUrl(entry.url))) {
    page.issues.push(warning('REDIRECTED_URL', `Sitemap URL resolves to ${finalUrl}.`, finalUrl || ''));
  }
  if (contentType && !/html|xhtml|text\//i.test(contentType)) {
    page.issues.push(note('NON_HTML_RESPONSE', `Response content-type was ${contentType}.`, contentType));
  }
  if (looksBlocked(status || 0, body || '')) {
    page.issues.push(
      warning('BOT_PROTECTION_DETECTED', 'Page response looks like bot protection or an access challenge.', `status=${status}`)
    );
  }
  if (!page.title) {
    page.issues.push({
      severity: generated ? 'notice' : 'warning',
      code: 'MISSING_TITLE',
      message: 'Page is missing a title tag.',
      evidence: 'No <title> match in HTML sample.',
    });
  } else if (page.title.length > 75) {
    page.issues.push({
      severity: generated ? 'notice' : 'warning',
      code: 'LONG_TITLE',
      message: 'Title may be too long.',
      evidence: `len=${page.title.length}`,
    });
  } else if (page.title.length < 15) {
    page.issues.push(note('SHORT_TITLE', 'Title is very short.', `len=${page.title.length}`));
  }
  if (!page.description) {
    page.issues.push({
      severity: generated ? 'notice' : 'warning',
      code: 'MISSING_META_DESCRIPTION',
      message: 'Page is missing a meta description.',
      evidence: 'No meta name=description.',
    });
  } else if (page.description.length > 180) {
    page.issues.push({
      severity: generated ? 'notice' : 'warning',
      code: 'LONG_META_DESCRIPTION',
      message: 'Meta description may be too long.',
      evidence: `len=${page.description.length}`,
    });
  } else if (page.description.length < 50) {
    page.issues.push(note('SHORT_META_DESCRIPTION', 'Meta description is short.', `len=${page.description.length}`));
  }
  if (!page.canonical) {
    page.issues.push(note('MISSING_CANONICAL', 'Page is missing a canonical link.', 'No link rel=canonical.'));
  } else {
    const resolvedCanonical = resolveCanonical(page.canonical, entry.url);
    if (resolvedCanonical) {
      const selfUrls = new Set([safeNorm(entry.url)]);
      if (finalUrl) selfUrls.add(safeNorm(finalUrl));
      if (!sameHost(resolvedCanonical, entry.url)) {
        page.issues.push(
          warning('CANONICAL_CROSS_HOST', `Canonical points to another host: ${resolvedCanonical}.`, resolvedCanonical)
        );
      } else if (!selfUrls.has(safeNorm(resolvedCanonical))) {
        page.issues.push(
          note('CANONICAL_MISMATCH', `Canonical points to a different URL: ${resolvedCanonical}.`, resolvedCanonical)
        );
      }
    }
  }
  if (robots?.includes('noindex')) {
    page.issues.push(errorIssue('NOINDEX_IN_SITEMAP', 'Page appears in sitemap but has noindex.', robots));
  }
  if (!entry.lastmod) {
    page.issues.push({
      severity: generated ? 'notice' : 'warning',
      code: 'MISSING_LASTMOD',
      message: 'Sitemap entry is missing lastmod.',
      evidence: entry.url,
    });
  }
  if (body && page.deepChecked && !page.ogTitle) {
    page.issues.push(note('MISSING_OG_TITLE', 'No og:title or twitter:title found on deep-checked page.', entry.url));
  }
  if (body && page.deepChecked && !page.hasSchema) {
    page.issues.push(note('MISSING_STRUCTURED_DATA', 'No JSON-LD or microdata itemtype detected on deep-checked page.', entry.url));
  }
  return page;
}

function basePage(entry: Entry, deepChecked: boolean): Page {
  const url = new URL(entry.url);
  return {
    ...entry,
    path: url.pathname || '/',
    type: pageType(entry.url),
    section: section(entry.url),
    deepChecked,
    sitemapListed: true,
    issues: [],
  };
}

function inventoryOnlyPage(entry: Entry): Page {
  const page = basePage(entry, false);
  page.issues.push(
    note('INDEX_ONLY_NOT_FETCHED', 'URL was found in the sitemap but not live-checked in this Worker preview.', entry.url)
  );
  return page;
}

function addDuplicateMetadataIssues(pages: Page[]): void {
  for (const group of groupBy(
    pages.filter((page) => page.title),
    (page) => page.title!.toLowerCase()
  ).values()) {
    if (group.length > 1) {
      for (const page of group) {
        page.issues.push(
          warning('DUPLICATE_TITLE', 'Title is duplicated on another live-checked page.', page.title || '')
        );
      }
    }
  }
  for (const group of groupBy(
    pages.filter((page) => page.description),
    (page) => page.description!.toLowerCase()
  ).values()) {
    if (group.length > 1) {
      for (const page of group) {
        page.issues.push(
          note('DUPLICATE_META_DESCRIPTION', 'Meta description is duplicated on another live-checked page.', page.description || '')
        );
      }
    }
  }
}

function summarize(pages: Page[], issues: Issue[]): Result['stats'] {
  return {
    pages: pages.length,
    sections: new Set(pages.map((page) => page.section)).size,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    notices: issues.filter((issue) => issue.severity === 'notice').length,
  };
}

function score(
  deepPages: Page[],
  rootIssues: Issue[],
  allPages: Page[],
  evidenceAvailable = deepPages.length > 0 || allPages.length > 0
): Result['scores'] {
  if (!evidenceAvailable || (deepPages.length === 0 && allPages.length === 0)) {
    return { index: 0, seo: 0, sitemap: 0, available: false };
  }
  const all = [...rootIssues, ...deepPages.flatMap((page) => page.issues)];
  const totalDeep = Math.max(deepPages.length, 1);
  const totalAll = Math.max(allPages.length, 1);
  const shallowPenalty =
    allPages.length === 1 ? 35 : allPages.length > 1 && allPages.length < 5 ? 20 : allPages.length < 10 ? 10 : 0;
  return {
    index: clamp(100 - shallowPenalty - Math.round((deepPages.filter((page) => !page.title).length / totalDeep) * 20)),
    seo: clamp(
      100 -
        all.filter((issue) => issue.severity === 'error').length * 10 -
        all.filter((issue) => issue.severity === 'warning').length * 1.25 -
        all.filter((issue) => issue.severity === 'notice').length * 0.15 -
        Math.round((deepPages.filter((page) => !page.description).length / totalDeep) * 12)
    ),
    sitemap: clamp(100 - shallowPenalty - Math.round((allPages.filter((page) => !page.lastmod).length / totalAll) * 10)),
  };
}

function compatibilityVerdict(entries: number, loaded: number, failed: number, deepErrors: number): string {
  if (entries === 0 && loaded > 0) return 'Sitemap references were found, but no usable URL entries could be extracted.';
  if (entries === 0) return 'Not compatible yet: no accessible XML sitemap URLs were found.';
  if (entries === 1) return 'Single-page sitemap detected: metadata is available, but the sitemap only exposes one URL.';
  if (entries > 1 && entries < 5) return `Thin sitemap detected: only ${entries} sitemap URLs were found.`;
  if (deepErrors > Math.max(10, entries * 0.5)) {
    return 'Partially compatible: sitemap URLs were found, but many sampled pages could not be fetched.';
  }
  if (failed > 0) return 'Mostly compatible: some sitemap files failed, but usable sitemap URL entries were found.';
  return 'Compatible: sitemap URLs were found and sampled page metadata was accessible.';
}

async function fetchText(
  url: string,
  discoveryDeadline?: number
): Promise<{ status: number; url: string; text: string; contentType: string }> {
  const parsed = assertPublicHttpUrl(url);
  let remaining = discoveryDeadline ? discoveryDeadline - Date.now() : undefined;
  if (remaining !== undefined && remaining <= 0) throw new DiscoveryBudgetError();
  try {
    await resolveAndAssertPublic(
      parsed.hostname,
      fetch,
      remaining === undefined ? undefined : Math.max(1, Math.min(1_500, remaining))
    );
  } catch (error) {
    if (error instanceof SsrfError) throw error;
  }

  remaining = discoveryDeadline ? discoveryDeadline - Date.now() : undefined;
  if (remaining !== undefined && remaining <= 0) throw new DiscoveryBudgetError();
  const timeoutMs = remaining === undefined ? TIMEOUT_MS : Math.max(1, Math.min(TIMEOUT_MS, remaining));
  const budgetLimited = remaining !== undefined && remaining <= TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(parsed.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.6',
      },
    });
    if (response.url) assertPublicHttpUrl(response.url);
    return {
      status: response.status,
      url: response.url || url,
      text: await readLimitedBody(response),
      contentType: response.headers.get('content-type') || '',
    };
  } catch (error) {
    if (budgetLimited && isTimeoutLike(error)) throw new DiscoveryBudgetError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchChain(
  url: string
): Promise<{ status: number; finalUrl: string; text: string; contentType: string; hops: number; loop: boolean }> {
  const visited = new Set<string>();
  let current = url;
  let hops = 0;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const step = await fetchManual(current);
    const isRedirect = step.status >= 300 && step.status < 400 && Boolean(step.location);
    if (!isRedirect) {
      return {
        status: step.status,
        finalUrl: step.finalUrl,
        text: step.text,
        contentType: step.contentType,
        hops,
        loop: false,
      };
    }
    let next: string;
    try {
      next = new URL(step.location, current).toString();
    } catch {
      next = step.location;
    }
    hops += 1;
    if (visited.has(next)) {
      return { status: step.status, finalUrl: next, text: '', contentType: '', hops, loop: true };
    }
    visited.add(current);
    current = next;
  }
  return { status: 310, finalUrl: current, text: '', contentType: '', hops, loop: false };
}

async function fetchManual(
  url: string
): Promise<{ status: number; location: string; finalUrl: string; text: string; contentType: string }> {
  const parsed = assertPublicHttpUrl(url);
  try {
    await resolveAndAssertPublic(parsed.hostname);
  } catch (error) {
    if (error instanceof SsrfError) throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(parsed.toString(), {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.6',
      },
    });
    const location = response.headers.get('location') || '';
    if (location) {
      try {
        assertPublicHttpUrl(new URL(location, parsed).toString());
      } catch {
        throw new SsrfError(`Redirect target is not a public HTTP(S) URL: ${location}`);
      }
    }
    const isRedirect = response.status >= 300 && response.status < 400 && Boolean(location);
    const text = isRedirect ? '' : await readLimitedBody(response);
    return {
      status: response.status,
      location,
      finalUrl: response.url || url,
      text,
      contentType: response.headers.get('content-type') || '',
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeInput(input: string): { input: string; site: string; mode: 'site' | 'sitemap' } {
  const raw = input.trim();
  if (!raw) throw new Error('Empty URL.');
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  url.hash = '';
  if (isSitemapUrl(url.toString())) return { input: normalizeUrl(url.toString()), site: url.origin, mode: 'sitemap' };
  url.search = '';
  url.pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  return { input: url.toString().replace(/\/$/, ''), site: url.toString().replace(/\/$/, ''), mode: 'site' };
}

function sitemapsFromRobots(body: string): { urls: string[]; ignored: string[] } {
  const raw = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^sitemap\s*:/i.test(line))
    .map((line) => line.replace(/^sitemap\s*:/i, '').trim())
    .filter(Boolean);
  return { urls: raw.filter(isSitemapUrl), ignored: raw.filter((u) => !isSitemapUrl(u)) };
}

function locTags(xml: string): string[] {
  const out: string[] = [];
  const regex = /<loc[^>]*>\s*([^<\s]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml))) {
    try {
      out.push(normalizeUrl(decodeXml(match[1])));
    } catch {
      /* skip */
    }
  }
  return [...new Set(out)];
}

function lastmodNear(xml: string, loc: string): string | undefined {
  const index = xml.indexOf(loc);
  if (index < 0) return undefined;
  return clean(
    /<lastmod[^>]*>\s*([^<\s]+)\s*<\/lastmod>/i.exec(
      xml.slice(Math.max(0, index - 600), Math.min(xml.length, index + 1200))
    )?.[1]
  );
}

function candidateOrigins(site: string): string[] {
  const url = new URL(site);
  const origins = [url.origin];
  origins.push(
    url.hostname.startsWith('www.')
      ? `${url.protocol}//${url.hostname.replace(/^www\./, '')}`
      : `${url.protocol}//www.${url.hostname}`
  );
  return [...new Set(origins)];
}

function commonSitemaps(origin: string): string[] {
  return [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
    `${origin}/wp-sitemap.xml`,
    `${origin}/sitemap/sitemap.xml`,
  ];
}

function isSitemapUrl(input: string): boolean {
  try {
    const path = new URL(input).pathname.toLowerCase();
    return (
      !path.endsWith('/llms.txt') &&
      !path.endsWith('/robots.txt') &&
      (/sitemap/.test(path) || /\.xml(\.gz)?$/.test(path))
    );
  } catch {
    return false;
  }
}

function isPageUrl(input: string): boolean {
  try {
    const path = new URL(input).pathname.toLowerCase();
    return !path.endsWith('.xml') && !path.endsWith('.xml.gz') && !path.endsWith('/llms.txt') && !path.endsWith('/robots.txt');
  } catch {
    return false;
  }
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}
function resolveCanonical(href: string, base: string): string | undefined {
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}
function safeNorm(url: string): string {
  try {
    return normalizeUrl(url);
  } catch {
    return url;
  }
}
function normalizeUrl(input: string): string {
  const url = new URL(input);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}
function addEntry(entries: Map<string, Entry>, url: string, lastmod?: string): void {
  try {
    const key = normalizeUrl(url);
    if (!isSitemapUrl(key) && !entries.has(key)) entries.set(key, { url: key, lastmod });
  } catch {
    /* skip */
  }
}
function asArray<T>(value: T | T[] | undefined): T[] {
  return value ? (Array.isArray(value) ? value : [value]) : [];
}
function textValue(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : undefined;
}
function meta(src: string, name: string): string | undefined {
  return (
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i').exec(src)?.[1] ||
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["'][^>]*>`, 'i').exec(src)?.[1]
  );
}
function og(src: string, prop: string): string | undefined {
  return (
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i').exec(src)?.[1] ||
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["'][^>]*>`, 'i').exec(src)?.[1]
  );
}
function twitter(src: string, name: string): string | undefined {
  return meta(src, `twitter:${name}`);
}
function canonical(src: string): string | undefined {
  return (
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["'][^>]*>/i.exec(src)?.[1] ||
    /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["'][^>]*>/i.exec(src)?.[1]
  );
}
function countHreflang(src: string): number {
  const re = /<link[^>]+hreflang=["'][^"']+["'][^>]*>/gi;
  let n = 0;
  while (re.exec(src)) n += 1;
  return n;
}
function pageType(input: string): string {
  const parts = new URL(input).pathname.split('/').filter(Boolean);
  if (!parts.length) return 'home';
  if (['archive', 'cluster', 'canvas'].includes(parts[0])) return parts[0];
  if (['source', 'sources'].includes(parts[0])) return 'source';
  if (['story', 'stories'].includes(parts[0])) return 'story';
  if (['c', 'category', 'categories', 'tag', 'tags', 'topic', 'topics'].includes(parts[0])) return 'category';
  return parts.length === 1 ? 'static' : 'generated';
}
function section(input: string): string {
  return new URL(input).pathname.split('/').filter(Boolean)[0] || 'home';
}
function looksBlocked(status: number, text: string): boolean {
  return (
    status === 403 ||
    status === 429 ||
    /cloudflare|access denied|captcha|bot detection|verify you are human|akamai|perimeterx|blocked|forbidden/i.test(
      text.slice(0, 1200)
    )
  );
}
function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(keyFn(item), [...(map.get(keyFn(item)) || []), item]);
  return map;
}
function warning(code: string, message: string, evidence?: string): Issue {
  return { severity: 'warning', code, message, evidence };
}
function errorIssue(code: string, message: string, evidence?: string): Issue {
  return { severity: 'error', code, message, evidence };
}
function note(code: string, message: string, evidence?: string): Issue {
  return { severity: 'notice', code, message, evidence };
}
function clean(value?: string): string | undefined {
  const cleaned = decodeXml(String(value || ''))
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || undefined;
}
function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
function isTimeoutLike(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error instanceof DiscoveryBudgetError ||
    error.name === 'AbortError' ||
    error.name === 'TimeoutError' ||
    /abort|timed?\s*out|time\s*limit|deadline/i.test(error.message)
  );
}
function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
function safeHost(site: string): string {
  try {
    return new URL(site).hostname;
  } catch {
    return site;
  }
}

async function enforceAnonymousRateLimit(request: Request, env: Env): Promise<Response | null> {
  if (!env.SITEMAPPER_RATE) return null;
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  const key = `anon:${ip}:${new Date().toISOString().slice(0, 13)}`;
  const current = Number((await env.SITEMAPPER_RATE.get(key)) || '0');
  if (current >= 30) {
    return json({ error: 'Rate limit exceeded. Try again in an hour, or sign in to monitor the site.' }, 429);
  }
  await env.SITEMAPPER_RATE.put(key, String(current + 1), { expirationTtl: 3600 });
  return null;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    },
  });
}
function html(markup: string, status = 200, cache = 'no-store'): Response {
  return new Response(markup, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cache },
  });
}
function text(body: string, contentType: string, status = 200, cache = 'no-store'): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': contentType, 'cache-control': cache, 'access-control-allow-origin': '*' },
  });
}
async function readStats(env: Env): Promise<{ runs: number; pages: number }> {
  if (!env.SITEMAPPER_STATS) return { runs: 0, pages: 0 };
  const [runs, pages] = await Promise.all([env.SITEMAPPER_STATS.get('runs'), env.SITEMAPPER_STATS.get('pages')]);
  return { runs: Number(runs || 0), pages: Number(pages || 0) };
}
async function incrementStats(env: Env, pages: number): Promise<void> {
  if (!env.SITEMAPPER_STATS) return;
  const current = await readStats(env);
  await env.SITEMAPPER_STATS.put('runs', String(current.runs + 1));
  await env.SITEMAPPER_STATS.put('pages', String(current.pages + pages));
}
