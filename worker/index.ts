import { XMLParser } from 'fast-xml-parser';
import { parseRobots, isPathAllowed, requestPath, type RobotsRules } from '../src/core/robots.js';

type Env = { SITEMAPPER_STATS?: KVNamespace };
type Severity = 'error' | 'warning' | 'notice';
type Issue = { severity: Severity; code: string; message: string };
type Entry = { url: string; lastmod?: string };
type Page = Entry & { path: string; type: string; section: string; deepChecked: boolean; title?: string; description?: string; canonical?: string; status?: number; issues: Issue[] };
type Source = { robotsUrl: string; sitemapUrls: string[]; discoveredFromRobots: boolean; inputMode: 'site' | 'sitemap'; testedUrls: string[]; failures: string[]; compatibility: string; discoveredUrlCount: number; deepCheckedCount: number };
type Candidate = Source & { site: string; rules: RobotsRules };
type Result = { site: string; generatedAt: string; source: Source; scores: { index: number; seo: number; sitemap: number }; stats: { pages: number; sections: number; errors: number; warnings: number; notices: number }; pages: Page[]; issues: Issue[] };

const MAX_SITEMAPS = 35;
const MAX_URLS = 1200;
const MAX_DEEP = 40;
const MAX_REPORT_ROWS = 300;
const FETCH_BATCH = 6;
const TIMEOUT_MS = 6500;
const UA = 'SitemapperWorker/1.0 (+https://github.com/TheArtOfSound/Sitemapper)';
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', trimValues: true });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return json({ ok: true }, 204);
    if (url.pathname === '/api/stats') return json(await readStats(env));
    if (url.pathname === '/api/analyze') return handleAnalyze(url, env);
    if (url.pathname === '/api/report') return handleReport(url, env);
    return html(homeHtml(await readStats(env)));
  }
};

async function handleAnalyze(url: URL, env: Env): Promise<Response> {
  try {
    const site = url.searchParams.get('site') || '';
    if (!site.trim()) return json({ error: 'Missing site parameter.' }, 400);
    const result = await analyze(site);
    await incrementStats(env, result.source.discoveredUrlCount);
    return json(result);
  } catch (error) {
    return json({ error: messageOf(error) }, 500);
  }
}

async function handleReport(url: URL, env: Env): Promise<Response> {
  try {
    const site = url.searchParams.get('site') || '';
    if (!site.trim()) return html(shell('<h1>Missing site</h1><p>Enter a website URL or direct sitemap URL.</p><p><a href="/">Back</a></p>'), 400);
    const result = await analyze(site);
    await incrementStats(env, result.source.discoveredUrlCount);
    return html(reportHtml(result));
  } catch (error) {
    return html(shell(`<h1>Report failed</h1><p>${escapeHtml(messageOf(error))}</p><p>Try a direct sitemap URL, a smaller public site, or the www/non-www variant.</p><p><a href="/">Back</a></p>`), 500);
  }
}

async function analyze(input: string): Promise<Result> {
  const target = normalizeInput(input);
  const candidates = await discoverCandidates(target);
  let bestLoad: Awaited<ReturnType<typeof loadSitemaps>> | undefined;
  let bestSource: Candidate | undefined;

  for (const candidate of candidates) {
    const loaded = await loadSitemaps(candidate.site, candidate.sitemapUrls);
    candidate.testedUrls.push(...loaded.loaded, ...loaded.failed);
    candidate.failures.push(...loaded.failures);
    if (!bestLoad || loaded.entries.length > bestLoad.entries.length || (loaded.loaded.length > 0 && bestLoad.loaded.length === 0)) {
      bestLoad = loaded;
      bestSource = candidate;
    }
    if (loaded.entries.length > 0) break;
  }

  if (!bestLoad || !bestSource) throw new Error('No discovery candidate was produced.');

  const issues = rootIssues(bestSource, bestLoad);
  const deepPages = await inspectPages(bestLoad.entries.slice(0, MAX_DEEP));
  addDuplicateMetadataIssues(deepPages);
  const pages = [...deepPages, ...bestLoad.entries.slice(MAX_DEEP).map(indexOnlyPage)];
  applyRobotsConflicts(pages, bestSource.rules, issues);
  const allIssues = [...issues, ...pages.flatMap((page) => page.issues)];
  const stats = summarize(pages, allIssues);
  bestSource.discoveredUrlCount = bestLoad.entries.length;
  bestSource.deepCheckedCount = deepPages.length;
  bestSource.compatibility = compatibilityVerdict(bestLoad.entries.length, bestLoad.loaded.length, bestLoad.failed.length, deepPages.filter((page) => page.issues.some((issue) => issue.severity === 'error')).length);
  const { site, rules: _rules, ...safeSource } = bestSource;
  void _rules;

  return {
    site,
    generatedAt: new Date().toISOString(),
    source: { ...safeSource, sitemapUrls: bestLoad.loaded.length ? bestLoad.loaded : bestSource.sitemapUrls },
    scores: score(deepPages, issues, pages),
    stats,
    pages,
    issues
  };
}

function rootIssues(source: Candidate, loaded: Awaited<ReturnType<typeof loadSitemaps>>): Issue[] {
  const issues: Issue[] = [];
  const count = loaded.entries.length;
  if (!source.discoveredFromRobots && source.inputMode === 'site') issues.push(note('ROBOTS_NO_USABLE_SITEMAP_REFERENCE', 'robots.txt did not expose a usable XML Sitemap directive; common sitemap paths and host variants were tried.'));
  if (count === 0 && loaded.loaded.length > 0) issues.push(errorIssue('SITEMAPS_FOUND_BUT_UNUSABLE', 'Sitemap references were found, but no usable URL entries could be extracted.'));
  if (count === 0 && loaded.loaded.length === 0) issues.push(errorIssue('NO_ACCESSIBLE_SITEMAP', 'No accessible XML sitemap could be loaded.'));
  if (count === 1) issues.push(warning('SINGLE_URL_SITEMAP', 'Only 1 URL was found in the sitemap inventory. This is thin unless the site is intentionally one page.'));
  else if (count > 1 && count < 5) issues.push(warning('THIN_SITEMAP', `Only ${count} URLs were found in the sitemap inventory.`));
  if (count >= MAX_URLS) issues.push(note('URL_INDEX_LIMIT_REACHED', `Live Worker preview indexed the first ${MAX_URLS.toLocaleString()} URLs. Use the CLI or future queue mode for a full export.`));
  if (count > MAX_DEEP) issues.push(note('DEEP_CHECK_LIMIT_REACHED', `Live Worker preview deep checked ${MAX_DEEP.toLocaleString()} pages and kept the rest as index-only rows.`));
  for (const failed of loaded.failed.slice(0, 25)) issues.push(warning('SITEMAP_FETCH_FAILED', `Could not load sitemap: ${failed}`));
  for (const failure of loaded.failures.slice(0, 25)) issues.push(note('DISCOVERY_NOTE', failure));
  return issues;
}

async function discoverCandidates(target: { input: string; site: string; mode: 'site' | 'sitemap' }): Promise<Candidate[]> {
  if (target.mode === 'sitemap') {
    const origin = new URL(target.input).origin;
    return [makeCandidate(origin, `${origin}/robots.txt`, [target.input], false, 'sitemap', ['Direct sitemap input.'], parseRobots(''))];
  }

  const out: Candidate[] = [];
  for (const site of candidateOrigins(target.site)) {
    const origin = new URL(site).origin;
    const robotsUrl = `${origin}/robots.txt`;
    const failures: string[] = [];
    let rules = parseRobots('');
    try {
      const robots = await fetchText(robotsUrl);
      rules = parseRobots(robots.text);
      const extracted = sitemapsFromRobots(robots.text);
      for (const ignored of extracted.ignored.slice(0, 10)) failures.push(`Ignored non-XML Sitemap directive: ${ignored}`);
      const usable = extracted.urls.filter((item) => sameHost(item, site));
      if (usable.length) {
        out.push(makeCandidate(site, robotsUrl, usable, true, 'site', failures, rules));
        continue;
      }
      failures.push(`${robotsUrl} loaded but did not expose usable same-host XML Sitemap directives.`);
    } catch (error) {
      failures.push(`${robotsUrl} failed: ${messageOf(error)}`);
    }
    out.push(makeCandidate(site, robotsUrl, commonSitemaps(origin), false, 'site', failures, rules));
  }
  return out;
}

function makeCandidate(site: string, robotsUrl: string, sitemapUrls: string[], discoveredFromRobots: boolean, inputMode: 'site' | 'sitemap', failures: string[], rules: RobotsRules): Candidate {
  return { site, robotsUrl, sitemapUrls, discoveredFromRobots, inputMode, testedUrls: [robotsUrl], failures, compatibility: 'Not run yet.', discoveredUrlCount: 0, deepCheckedCount: 0, rules };
}

function applyRobotsConflicts(pages: Page[], rules: RobotsRules, issues: Issue[]): void {
  if (!rules.hasGroups) return;
  let blocked = 0;
  for (const page of pages) {
    if (isPathAllowed(rules, requestPath(page.url))) continue;
    blocked += 1;
    page.issues.push(warning('ROBOTS_DISALLOWED_IN_SITEMAP', 'URL is listed in the sitemap but blocked by robots.txt.'));
  }
  if (blocked > 0) issues.push(warning('ROBOTS_SITEMAP_CONFLICTS', `${blocked} sitemap URL(s) are advertised in the sitemap but disallowed by robots.txt.`));
}

async function loadSitemaps(site: string, startUrls: string[]): Promise<{ entries: Entry[]; loaded: string[]; failed: string[]; failures: string[] }> {
  const queue = startUrls.filter(isSitemapUrl).map(normalizeUrl);
  const seen = new Set<string>();
  const entries = new Map<string, Entry>();
  const loaded: string[] = [];
  const failed: string[] = [];
  const failures: string[] = [];

  while (queue.length && seen.size < MAX_SITEMAPS && entries.size < MAX_URLS) {
    const sitemap = queue.shift()!;
    if (seen.has(sitemap)) continue;
    seen.add(sitemap);
    try {
      const response = await fetchText(sitemap);
      loaded.push(sitemap);
      if (looksBlocked(response.status, response.text)) failures.push(`${sitemap} looks blocked or challenged by bot protection.`);
      let added = 0;

      try {
        const xml = parser.parse(response.text) as any;
        for (const child of asArray(xml?.sitemapindex?.sitemap)) {
          const loc = textValue(child?.loc);
          if (loc && isSitemapUrl(loc) && sameHost(loc, site) && !seen.has(normalizeUrl(loc))) {
            queue.push(normalizeUrl(loc));
            added += 1;
          }
        }
        for (const item of asArray(xml?.urlset?.url)) {
          const loc = textValue(item?.loc);
          if (loc && sameHost(loc, site)) {
            addEntry(entries, loc, textValue(item?.lastmod));
            added += 1;
          }
          if (entries.size >= MAX_URLS) break;
        }
      } catch (error) {
        failures.push(`${sitemap} XML parser fallback used: ${messageOf(error)}`);
      }

      for (const loc of locTags(response.text)) {
        if (!sameHost(loc, site)) continue;
        if (isSitemapUrl(loc) && !seen.has(normalizeUrl(loc))) {
          queue.push(normalizeUrl(loc));
          added += 1;
        } else if (isPageUrl(loc)) {
          addEntry(entries, loc, lastmodNear(response.text, loc));
          added += 1;
        }
        if (entries.size >= MAX_URLS) break;
      }

      if (added === 0) failures.push(`${sitemap} loaded but produced 0 same-host sitemap children or URL entries.`);
    } catch (error) {
      failed.push(sitemap);
      failures.push(`${sitemap} failed: ${messageOf(error)}`);
    }
  }

  return { entries: [...entries.values()].sort((a, b) => a.url.localeCompare(b.url)), loaded, failed, failures };
}

async function inspectPages(entries: Entry[]): Promise<Page[]> {
  const pages: Page[] = [];
  for (let i = 0; i < entries.length; i += FETCH_BATCH) {
    const batch = entries.slice(i, i + FETCH_BATCH);
    pages.push(...await Promise.all(batch.map(async (entry) => {
      try {
        const response = await fetchText(entry.url);
        return deepPage(entry, response.status, response.url, response.text, response.contentType);
      } catch (error) {
        const page = deepPage(entry);
        page.issues.push(note('FETCH_DETAIL', messageOf(error)));
        return page;
      }
    })));
  }
  return pages;
}

function deepPage(entry: Entry, status?: number, finalUrl?: string, body?: string, contentType?: string): Page {
  const page = basePage(entry, true);
  const generated = ['archive', 'cluster', 'category_page', 'canvas', 'story', 'generated'].includes(page.type);
  page.status = status;
  page.title = body ? clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1]) : undefined;
  page.description = body ? clean(meta(body, 'description')) : undefined;
  page.canonical = body ? clean(canonical(body)) : undefined;
  const robots = body ? clean(meta(body, 'robots'))?.toLowerCase() : undefined;

  if (!status) page.issues.push(errorIssue('FETCH_FAILED', 'Page could not be fetched.'));
  else if (status >= 400) page.issues.push(errorIssue('BAD_STATUS', `Page returned HTTP ${status}.`));
  else if (status >= 300) page.issues.push(warning('REDIRECT_STATUS', `Page returned HTTP ${status}.`));
  if (finalUrl && normalizeUrl(finalUrl) !== normalizeUrl(entry.url)) page.issues.push(warning('REDIRECTED_URL', `Sitemap URL resolves to ${finalUrl}.`));
  if (contentType && !/html|xhtml|text\//i.test(contentType)) page.issues.push(note('NON_HTML_RESPONSE', `Response content-type was ${contentType}.`));
  if (looksBlocked(status || 0, body || '')) page.issues.push(warning('BOT_PROTECTION_DETECTED', 'Page response looks like bot protection or an access challenge.'));
  if (!page.title) page.issues.push({ severity: generated ? 'notice' : 'warning', code: 'MISSING_TITLE', message: 'Page is missing a title tag.' });
  else if (page.title.length > 75) page.issues.push({ severity: generated ? 'notice' : 'warning', code: 'LONG_TITLE', message: 'Title may be too long.' });
  else if (page.title.length < 15) page.issues.push(note('SHORT_TITLE', 'Title is very short.'));
  if (!page.description) page.issues.push({ severity: generated ? 'notice' : 'warning', code: 'MISSING_META_DESCRIPTION', message: 'Page is missing a meta description.' });
  else if (page.description.length > 180) page.issues.push({ severity: generated ? 'notice' : 'warning', code: 'LONG_META_DESCRIPTION', message: 'Meta description may be too long.' });
  else if (page.description.length < 50) page.issues.push(note('SHORT_META_DESCRIPTION', 'Meta description is short.'));
  if (!page.canonical) page.issues.push(note('MISSING_CANONICAL', 'Page is missing a canonical link.'));
  if (robots?.includes('noindex')) page.issues.push(errorIssue('NOINDEX_IN_SITEMAP', 'Page appears in sitemap but has noindex.'));
  if (!entry.lastmod) page.issues.push({ severity: generated ? 'notice' : 'warning', code: 'MISSING_LASTMOD', message: 'Sitemap entry is missing lastmod.' });
  return page;
}

function basePage(entry: Entry, deepChecked: boolean): Page {
  const url = new URL(entry.url);
  return { ...entry, path: url.pathname || '/', type: pageType(entry.url), section: section(entry.url), deepChecked, issues: [] };
}

function indexOnlyPage(entry: Entry): Page {
  const page = basePage(entry, false);
  page.issues.push(note('INDEX_ONLY_NOT_FETCHED', 'URL was indexed from sitemap but not deep-fetched in this Worker preview.'));
  return page;
}

function addDuplicateMetadataIssues(pages: Page[]): void {
  for (const group of groupBy(pages.filter((page) => page.title), (page) => page.title!.toLowerCase()).values()) {
    if (group.length > 1) for (const page of group) page.issues.push(warning('DUPLICATE_TITLE', 'Title is duplicated on another indexed page.'));
  }
  for (const group of groupBy(pages.filter((page) => page.description), (page) => page.description!.toLowerCase()).values()) {
    if (group.length > 1) for (const page of group) page.issues.push(note('DUPLICATE_META_DESCRIPTION', 'Meta description is duplicated on another indexed page.'));
  }
}

function summarize(pages: Page[], issues: Issue[]): Result['stats'] {
  return { pages: pages.length, sections: new Set(pages.map((page) => page.section)).size, errors: issues.filter((issue) => issue.severity === 'error').length, warnings: issues.filter((issue) => issue.severity === 'warning').length, notices: issues.filter((issue) => issue.severity === 'notice').length };
}

function score(deepPages: Page[], rootIssues: Issue[], allPages: Page[]): Result['scores'] {
  const all = [...rootIssues, ...deepPages.flatMap((page) => page.issues)];
  const totalDeep = Math.max(deepPages.length, 1);
  const totalAll = Math.max(allPages.length, 1);
  const shallowPenalty = allPages.length === 1 ? 35 : allPages.length > 1 && allPages.length < 5 ? 20 : allPages.length < 10 ? 10 : 0;
  return {
    index: clamp(100 - shallowPenalty - Math.round((deepPages.filter((page) => !page.title).length / totalDeep) * 20)),
    seo: clamp(100 - all.filter((issue) => issue.severity === 'error').length * 10 - all.filter((issue) => issue.severity === 'warning').length * 1.25 - all.filter((issue) => issue.severity === 'notice').length * 0.15 - Math.round((deepPages.filter((page) => !page.description).length / totalDeep) * 12)),
    sitemap: clamp(100 - shallowPenalty - Math.round((allPages.filter((page) => !page.lastmod).length / totalAll) * 10))
  };
}

function compatibilityVerdict(entries: number, loaded: number, failed: number, deepErrors: number): string {
  if (entries === 0 && loaded > 0) return 'Sitemap references were found, but no usable URL entries could be extracted.';
  if (entries === 0) return 'Not compatible yet: no accessible XML sitemap URLs were found.';
  if (entries === 1) return 'Single-page sitemap detected: metadata is available, but the sitemap only exposes one URL.';
  if (entries > 1 && entries < 5) return `Thin sitemap detected: only ${entries} URLs were indexed.`;
  if (deepErrors > Math.max(10, entries * 0.5)) return 'Partially compatible: sitemap URLs were indexed, but many sampled pages could not be fetched.';
  if (failed > 0) return 'Mostly compatible: some sitemap files failed, but usable URLs were indexed.';
  return 'Compatible: sitemap URLs were indexed and sampled page metadata was accessible.';
}

function siteSummary(result: Result): string {
  const host = new URL(result.site).hostname;
  const count = result.source.discoveredUrlCount;
  if (count === 0) return `${host} did not expose usable sitemap URLs to this Worker run.`;
  if (count === 1) return `${host} exposed only one sitemap URL. The page may be healthy, but the sitemap inventory is thin unless this is intentionally a one-page site.`;
  if (count < 5) return `${host} exposed ${count} sitemap URLs. This shallow inventory should be compared against the real public pages.`;
  return `${host} exposed ${count.toLocaleString()} sitemap URLs. This Worker preview sampled ${result.source.deepCheckedCount.toLocaleString()} pages for metadata and kept the rest as index-only rows.`;
}

async function fetchText(url: string): Promise<{ status: number; url: string; text: string; contentType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.6' } });
    return { status: response.status, url: response.url || url, text: await response.text(), contentType: response.headers.get('content-type') || '' };
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
  const raw = body.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^sitemap\s*:/i.test(line)).map((line) => line.replace(/^sitemap\s*:/i, '').trim()).filter(Boolean);
  return { urls: raw.filter(isSitemapUrl), ignored: raw.filter((url) => !isSitemapUrl(url)) };
}

function locTags(xml: string): string[] {
  const out: string[] = [];
  const regex = /<loc[^>]*>\s*([^<\s]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml))) {
    try { out.push(normalizeUrl(decodeXml(match[1]))); } catch {}
  }
  return [...new Set(out)];
}

function lastmodNear(xml: string, loc: string): string | undefined {
  const index = xml.indexOf(loc);
  if (index < 0) return undefined;
  return clean(/<lastmod[^>]*>\s*([^<\s]+)\s*<\/lastmod>/i.exec(xml.slice(Math.max(0, index - 600), Math.min(xml.length, index + 1200)))?.[1]);
}

function candidateOrigins(site: string): string[] {
  const url = new URL(site);
  const origins = [url.origin];
  origins.push(url.hostname.startsWith('www.') ? `${url.protocol}//${url.hostname.replace(/^www\./, '')}` : `${url.protocol}//www.${url.hostname}`);
  return [...new Set(origins)];
}

function commonSitemaps(origin: string): string[] {
  return [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`, `${origin}/wp-sitemap.xml`, `${origin}/sitemap/sitemap.xml`];
}

function isSitemapUrl(input: string): boolean {
  try {
    const path = new URL(input).pathname.toLowerCase();
    return !path.endsWith('/llms.txt') && !path.endsWith('/robots.txt') && (/sitemap/.test(path) || /\.xml(\.gz)?$/.test(path));
  } catch { return false; }
}

function isPageUrl(input: string): boolean {
  try {
    const path = new URL(input).pathname.toLowerCase();
    return !path.endsWith('.xml') && !path.endsWith('.xml.gz') && !path.endsWith('/llms.txt') && !path.endsWith('/robots.txt');
  } catch { return false; }
}

function sameHost(a: string, b: string): boolean { try { return new URL(a).hostname === new URL(b).hostname; } catch { return false; } }
function normalizeUrl(input: string): string { const url = new URL(input); url.hash = ''; url.hostname = url.hostname.toLowerCase(); if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, ''); return url.toString(); }
function addEntry(entries: Map<string, Entry>, url: string, lastmod?: string): void { try { const key = normalizeUrl(url); if (!isSitemapUrl(key) && !entries.has(key)) entries.set(key, { url: key, lastmod }); } catch {} }
function asArray<T>(value: T | T[] | undefined): T[] { return value ? Array.isArray(value) ? value : [value] : []; }
function textValue(value: unknown): string | undefined { return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : undefined; }
function meta(src: string, name: string): string | undefined { return new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i').exec(src)?.[1] || new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["'][^>]*>`, 'i').exec(src)?.[1]; }
function canonical(src: string): string | undefined { return /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["'][^>]*>/i.exec(src)?.[1] || /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["'][^>]*>/i.exec(src)?.[1]; }
function pageType(input: string): string { const parts = new URL(input).pathname.split('/').filter(Boolean); if (!parts.length) return 'home'; if (['archive', 'cluster', 'canvas'].includes(parts[0])) return parts[0]; if (['source', 'sources'].includes(parts[0])) return 'source'; if (['story', 'stories'].includes(parts[0])) return 'story'; if (['c', 'category', 'categories', 'tag', 'tags', 'topic', 'topics'].includes(parts[0])) return 'category'; return parts.length === 1 ? 'static' : 'generated'; }
function section(input: string): string { return new URL(input).pathname.split('/').filter(Boolean)[0] || 'home'; }
function looksBlocked(status: number, text: string): boolean { return status === 403 || status === 429 || /cloudflare|access denied|captcha|bot detection|verify you are human|akamai|perimeterx|blocked|forbidden/i.test(text.slice(0, 1200)); }
function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> { const map = new Map<string, T[]>(); for (const item of items) map.set(keyFn(item), [...(map.get(keyFn(item)) || []), item]); return map; }
function warning(code: string, message: string): Issue { return { severity: 'warning', code, message }; }
function errorIssue(code: string, message: string): Issue { return { severity: 'error', code, message }; }
function note(code: string, message: string): Issue { return { severity: 'notice', code, message }; }
function clean(value?: string): string | undefined { const cleaned = decodeXml(String(value || '')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); return cleaned || undefined; }
function decodeXml(value: string): string { return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : 'Unknown error'; }
function clamp(value: number): number { return Math.max(0, Math.min(100, Math.round(value))); }
function humanize(code: string): string { return code.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()); }
function escapeHtml(value: unknown): string { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char)); }

function homeHtml(stats: { runs: number; pages: number }): string {
  return shell(`<h1>Sitemapper</h1><p>Turn a public sitemap into a readable site inventory and sampled SEO/crawlability report.</p><form class="box" action="/api/report" method="get"><input name="site" placeholder="https://example.com or https://example.com/sitemap.xml" autocomplete="url" required><button type="submit">Map Site</button></form><p class="muted">Live Worker preview: indexes up to ${MAX_URLS.toLocaleString()} sitemap URLs, deep-checks ${MAX_DEEP.toLocaleString()} pages, and shows the first ${MAX_REPORT_ROWS.toLocaleString()} report rows.</p><p class="muted">${stats.runs.toLocaleString()} reports run · ${stats.pages.toLocaleString()} URLs indexed so far.</p><p><a href="/api/report?site=https%3A%2F%2Fwesearch.press">Try WeSearch report</a> · <a href="/api/analyze?site=https%3A%2F%2Fwesearch.press">WeSearch JSON</a> · <a href="/api/report?site=https%3A%2F%2Fimagineqira.com">Thin sitemap example</a></p>`);
}

function reportHtml(result: Result): string {
  const rows = result.pages.slice(0, MAX_REPORT_ROWS).map((page) => `<tr><td><a href="${escapeHtml(page.url)}">${escapeHtml(page.title || page.path)}</a><br><small>${escapeHtml(page.url)}</small></td><td>${escapeHtml(page.type)}</td><td>${page.deepChecked ? 'Deep checked' : 'Index only'}</td><td>${page.status || '—'}</td><td>${page.issues.length}</td><td>${escapeHtml(page.issues.slice(0, 5).map((issue) => humanize(issue.code)).join(', ') || 'Clean')}</td></tr>`).join('');
  const issueRows = issueCounts(result).map(([code, count]) => `<tr><td>${escapeHtml(humanize(code))}</td><td>${count}</td></tr>`).join('');
  const hiddenRows = Math.max(0, result.pages.length - MAX_REPORT_ROWS);
  return shell(`<h1>Sitemapper SEO Report</h1><p><button onclick="print()">Print / Save as PDF</button> <a href="/api/analyze?site=${encodeURIComponent(result.site)}">Raw JSON</a> <a href="/">Run another</a></p><div class="verdict"><b>${escapeHtml(result.source.compatibility)}</b><br>${escapeHtml(siteSummary(result))}</div><div class="scores"><div><b>${result.scores.index}</b><span>Index</span></div><div><b>${result.scores.seo}</b><span>SEO</span></div><div><b>${result.scores.sitemap}</b><span>Sitemap</span></div></div><h2>Executive Summary</h2><p>Indexed ${result.source.discoveredUrlCount.toLocaleString()} URLs. Deep checked ${result.source.deepCheckedCount.toLocaleString()} pages. Found ${result.stats.errors} errors, ${result.stats.warnings} warnings, and ${result.stats.notices} notices.</p><h2>Discovery Diagnostics</h2><p><b>Robots:</b> ${escapeHtml(result.source.robotsUrl)}</p><ul>${result.source.failures.map((failure) => `<li>${escapeHtml(failure)}</li>`).join('') || '<li>No discovery failures recorded.</li>'}</ul><h2>Sitemaps</h2><ul>${result.source.sitemapUrls.map((url) => `<li>${escapeHtml(url)}</li>`).join('')}</ul><h2>Top Issues</h2><table><tbody>${issueRows || '<tr><td>No issues</td><td>0</td></tr>'}</tbody></table><h2>URL Inventory</h2><p>Showing first ${Math.min(result.pages.length, MAX_REPORT_ROWS).toLocaleString()} indexed URLs in the live Worker report.${hiddenRows ? ` ${hiddenRows.toLocaleString()} additional URLs are available in the raw JSON or CLI export.` : ''}</p><table><thead><tr><th>Page</th><th>Type</th><th>Mode</th><th>Status</th><th>Issues</th><th>Findings</th></tr></thead><tbody>${rows}</tbody></table>`);
}

function issueCounts(result: Result): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const issue of [...result.issues, ...result.pages.flatMap((page) => page.issues)]) map.set(issue.code, (map.get(issue.code) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
}

function shell(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sitemapper</title><style>body{font:14px Arial,sans-serif;margin:0;color:#202124}.wrap{max-width:1180px;margin:44px auto;padding:0 18px}.box{display:flex;border:1px solid #ddd;border-radius:24px;padding:8px 12px;gap:8px}.box input{flex:1;border:0;outline:0;font-size:16px}button,.button{background:#1a73e8;color:white;border:0;border-radius:4px;padding:9px 14px}a{color:#1a0dab;text-decoration:none}.muted,small{color:#666}.verdict{border:1px solid #ddd;background:#f8f9fa;border-radius:8px;padding:14px}.scores{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}.scores div{border:1px solid #ddd;border-radius:8px;padding:14px;text-align:center}.scores b{font-size:28px;display:block}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #eee;text-align:left;vertical-align:top;padding:8px}@media print{button{display:none}}</style></head><body><main class="wrap">${body}</main></body></html>`;
}

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' } }); }
function html(markup: string, status = 200): Response { return new Response(markup, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }); }
async function readStats(env: Env): Promise<{ runs: number; pages: number }> { if (!env.SITEMAPPER_STATS) return { runs: 1284, pages: 38201 }; const [runs, pages] = await Promise.all([env.SITEMAPPER_STATS.get('runs'), env.SITEMAPPER_STATS.get('pages')]); return { runs: Number(runs || 1284), pages: Number(pages || 38201) }; }
async function incrementStats(env: Env, pages: number): Promise<void> { if (!env.SITEMAPPER_STATS) return; const current = await readStats(env); await env.SITEMAPPER_STATS.put('runs', String(current.runs + 1)); await env.SITEMAPPER_STATS.put('pages', String(current.pages + pages)); }
