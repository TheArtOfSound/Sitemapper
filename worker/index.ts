import { XMLParser } from 'fast-xml-parser';
import type { PageIssue, PageRecord, PageType, RawSitemapEntry, SitemapperResult, SitemapperScores, SitemapperStats } from '../src/types.js';

type Env = {
  SITEMAPPER_STATS?: KVNamespace;
};

const MAX_SITEMAPS = 24;
const MAX_URLS = 5000;
const MAX_PAGES = 120;
const FETCH_TIMEOUT_MS = 6500;
const USER_AGENT = 'SitemapperWorker/0.2 (+https://github.com/TheArtOfSound/Sitemapper)';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));

    if (url.pathname === '/api/analyze') {
      const site = url.searchParams.get('site') || '';
      if (!site) return json({ error: 'Missing site parameter.' }, 400);
      try {
        const result = await analyzeSite(site);
        await incrementStats(env, result.stats.pages);
        return json(result);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Analysis failed.' }, 500);
      }
    }

    if (url.pathname === '/api/stats') {
      return json(await readStats(env));
    }

    if (url.pathname === '/api/export') {
      const site = url.searchParams.get('site') || '';
      if (!site) return json({ error: 'Missing site parameter.' }, 400);
      const result = await analyzeSite(site);
      return json(result);
    }

    return new Response(appHtml(), {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=60'
      }
    });
  }
};

async function analyzeSite(input: string): Promise<SitemapperResult> {
  const site = normalizeSite(input);
  const source = await discoverSitemaps(site);
  const sitemapLoad = await loadSitemapEntries(site, source.sitemapUrls);
  const rootIssues: PageIssue[] = [];

  if (!source.discoveredFromRobots) {
    rootIssues.push({ severity: 'notice', code: 'ROBOTS_NO_SITEMAP_REFERENCE', message: 'robots.txt did not expose a Sitemap: entry; tried /sitemap.xml fallback.' });
  }

  for (const failed of sitemapLoad.failedSitemaps) {
    rootIssues.push({ severity: 'warning', code: 'SITEMAP_FETCH_FAILED', message: `Could not load sitemap: ${failed}` });
  }

  if (sitemapLoad.entries.length > MAX_PAGES) {
    rootIssues.push({ severity: 'notice', code: 'SAMPLE_LIMIT_REACHED', message: `Analyzed ${MAX_PAGES} sample pages from ${sitemapLoad.entries.length} sitemap URLs.` });
  }

  const entries = sitemapLoad.entries.slice(0, MAX_PAGES);
  const inspected = await inspectPages(entries);
  const pages = dedupePages(inspected, rootIssues);
  const duplicates = findDuplicateMetadataIssues(pages);
  const pagesWithDuplicates = pages.map((page) => ({ ...page, issues: [...page.issues, ...(duplicates.get(page.url) ?? [])] }));

  return {
    site,
    generatedAt: new Date().toISOString(),
    source: {
      ...source,
      sitemapUrls: sitemapLoad.loadedSitemaps.length ? sitemapLoad.loadedSitemaps : source.sitemapUrls
    },
    scores: score(pagesWithDuplicates, rootIssues),
    stats: stats(pagesWithDuplicates, rootIssues),
    pages: pagesWithDuplicates,
    issues: rootIssues
  };
}

async function discoverSitemaps(site: string): Promise<{ robotsUrl: string; sitemapUrls: string[]; discoveredFromRobots: boolean }> {
  const origin = new URL(site).origin;
  const robotsUrl = `${origin}/robots.txt`;
  const robots = await fetchText(robotsUrl).catch(() => undefined);
  const sitemapUrls = robots ? extractSitemapUrls(robots.text) : [];

  if (sitemapUrls.length > 0) {
    return { robotsUrl, sitemapUrls: sameHostOnly(sitemapUrls, site), discoveredFromRobots: true };
  }

  return { robotsUrl, sitemapUrls: [`${origin}/sitemap.xml`], discoveredFromRobots: false };
}

function extractSitemapUrls(robotsText: string): string[] {
  return robotsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^sitemap\s*:/i.test(line))
    .map((line) => line.replace(/^sitemap\s*:/i, '').trim())
    .filter(Boolean);
}

async function loadSitemapEntries(site: string, initialUrls: string[]): Promise<{ entries: RawSitemapEntry[]; loadedSitemaps: string[]; failedSitemaps: string[] }> {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const queue = [...sameHostOnly(initialUrls, site)];
  const seenSitemaps = new Set<string>();
  const entries = new Map<string, RawSitemapEntry>();
  const loadedSitemaps: string[] = [];
  const failedSitemaps: string[] = [];

  while (queue.length && seenSitemaps.size < MAX_SITEMAPS && entries.size < MAX_URLS) {
    const sitemapUrl = normalizePageUrl(queue.shift()!);
    if (seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);

    try {
      const response = await fetchText(sitemapUrl);
      loadedSitemaps.push(sitemapUrl);
      const xml = parser.parse(response.text);

      const sitemapItems = asArray(xml?.sitemapindex?.sitemap);
      for (const item of sitemapItems) {
        const loc = textValue(item?.loc);
        if (loc && sameHost(loc, site) && !seenSitemaps.has(normalizePageUrl(loc))) queue.push(loc);
      }

      const urlItems = asArray(xml?.urlset?.url);
      for (const item of urlItems) {
        const loc = textValue(item?.loc);
        if (!loc || !sameHost(loc, site)) continue;
        const key = normalizePageUrl(loc);
        if (!entries.has(key)) {
          entries.set(key, {
            url: key,
            lastmod: textValue(item?.lastmod),
            changefreq: textValue(item?.changefreq),
            priority: textValue(item?.priority)
          });
        }
        if (entries.size >= MAX_URLS) break;
      }
    } catch {
      failedSitemaps.push(sitemapUrl);
    }
  }

  return { entries: Array.from(entries.values()), loadedSitemaps, failedSitemaps };
}

async function inspectPages(entries: RawSitemapEntry[]): Promise<PageRecord[]> {
  const pages: PageRecord[] = [];
  const batches = chunk(entries, 8);
  for (const batch of batches) {
    const batchPages = await Promise.all(batch.map(async (entry) => {
      try {
        const response = await fetchText(entry.url);
        return buildPage(entry, response.status, response.finalUrl, response.text);
      } catch {
        return buildPage(entry, undefined, undefined, undefined);
      }
    }));
    pages.push(...batchPages);
  }
  return pages;
}

function buildPage(entry: RawSitemapEntry, status: number | undefined, finalUrl: string | undefined, html: string | undefined): PageRecord {
  const issues: PageIssue[] = [];
  const path = pathFromUrl(entry.url);
  const displayPath = displayPathFromUrl(entry.url);
  const section = sectionFromUrl(entry.url);
  const pageType = pageTypeFromUrl(entry.url);
  const generated = ['archive', 'cluster', 'category_page', 'canvas', 'story', 'generated'].includes(pageType);

  const title = html ? cleanText(matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i)) : undefined;
  const description = html ? cleanText(matchMeta(html, 'description')) : undefined;
  const canonical = html ? cleanText(matchCanonical(html)) : undefined;
  const robots = html ? cleanText(matchMeta(html, 'robots'))?.toLowerCase() : undefined;

  if (!status) issues.push({ severity: 'error', code: 'FETCH_FAILED', message: 'Page could not be fetched.' });
  else if (status >= 400) issues.push({ severity: 'error', code: 'BAD_STATUS', message: `Page returned HTTP ${status}.` });
  else if (status >= 300) issues.push({ severity: 'warning', code: 'REDIRECT_STATUS', message: `Page returned redirect status ${status}.` });

  if (finalUrl && normalizePageUrl(finalUrl) !== normalizePageUrl(entry.url)) {
    issues.push({ severity: 'warning', code: 'REDIRECTED_URL', message: `Sitemap URL resolves to ${finalUrl}.` });
  }

  if (!title) issues.push({ severity: generated ? 'notice' : 'warning', code: 'MISSING_TITLE', message: 'Page is missing a title tag.' });
  else if (title.length > 75) issues.push({ severity: generated ? 'notice' : 'warning', code: 'LONG_TITLE', message: 'Title may be too long for search results.' });
  else if (title.length < 15) issues.push({ severity: 'notice', code: 'SHORT_TITLE', message: 'Title is very short.' });

  if (!description) issues.push({ severity: generated ? 'notice' : 'warning', code: 'MISSING_META_DESCRIPTION', message: 'Page is missing a meta description.' });
  else if (description.length > 180) issues.push({ severity: generated ? 'notice' : 'warning', code: 'LONG_META_DESCRIPTION', message: 'Meta description may be too long.' });
  else if (description.length < 50) issues.push({ severity: 'notice', code: 'SHORT_META_DESCRIPTION', message: 'Meta description is short.' });

  if (!canonical) issues.push({ severity: 'notice', code: 'MISSING_CANONICAL', message: 'Page is missing a canonical link.' });
  if (robots?.includes('noindex')) issues.push({ severity: 'error', code: 'NOINDEX_IN_SITEMAP', message: 'Page appears in sitemap but has a noindex directive.' });
  if (!entry.lastmod) issues.push({ severity: generated ? 'notice' : 'warning', code: 'MISSING_LASTMOD', message: 'Sitemap entry is missing lastmod.' });

  return {
    url: entry.url,
    path,
    displayPath,
    section,
    pageType,
    title,
    description,
    canonical,
    finalUrl,
    lastmod: entry.lastmod,
    changefreq: entry.changefreq,
    priority: entry.priority,
    status,
    ok: issues.every((issue) => issue.severity !== 'error'),
    issues
  };
}

async function fetchText(url: string): Promise<{ status: number; finalUrl: string; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.6' }
    });
    const text = await response.text();
    return { status: response.status, finalUrl: response.url || url, text };
  } finally {
    clearTimeout(timeout);
  }
}

function dedupePages(pages: PageRecord[], rootIssues: PageIssue[]): PageRecord[] {
  const byKey = new Map<string, PageRecord>();
  let duplicates = 0;
  for (const page of pages) {
    const key = canonicalDedupeKey(page.canonical || page.finalUrl || page.url);
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, page);
    else {
      duplicates += 1;
      byKey.set(key, completeness(page) > completeness(existing) ? page : existing);
    }
  }
  if (duplicates > 0) rootIssues.push({ severity: 'notice', code: 'DUPLICATE_URLS_DEDUPED', message: `${duplicates} duplicate-ish sitemap URLs were collapsed.` });
  return Array.from(byKey.values()).sort((a, b) => a.url.localeCompare(b.url));
}

function completeness(page: PageRecord): number {
  return Number(Boolean(page.title)) * 3 + Number(Boolean(page.description)) * 2 + Number(Boolean(page.lastmod)) + Number(page.status === 200) * 2;
}

function findDuplicateMetadataIssues(pages: PageRecord[]): Map<string, PageIssue[]> {
  const byTitle = new Map<string, PageRecord[]>();
  const byDesc = new Map<string, PageRecord[]>();
  for (const page of pages) {
    if (page.title) addToMap(byTitle, page.title.toLowerCase(), page);
    if (page.description) addToMap(byDesc, page.description.toLowerCase(), page);
  }
  const out = new Map<string, PageIssue[]>();
  for (const group of byTitle.values()) if (group.length > 1) for (const page of group) addIssue(out, page.url, { severity: duplicateSeverity(page), code: 'DUPLICATE_TITLE', message: 'Title is duplicated on another indexed page.' });
  for (const group of byDesc.values()) if (group.length > 1) for (const page of group) addIssue(out, page.url, { severity: 'notice', code: 'DUPLICATE_META_DESCRIPTION', message: 'Meta description is duplicated on another indexed page.' });
  return out;
}

function duplicateSeverity(page: PageRecord): 'warning' | 'notice' {
  return ['cluster', 'archive', 'category_page', 'canvas', 'generated'].includes(page.pageType) ? 'notice' : 'warning';
}

function addToMap(map: Map<string, PageRecord[]>, key: string, value: PageRecord): void { map.set(key, [...(map.get(key) ?? []), value]); }
function addIssue(map: Map<string, PageIssue[]>, key: string, issue: PageIssue): void { map.set(key, [...(map.get(key) ?? []), issue]); }

function stats(pages: PageRecord[], rootIssues: PageIssue[]): SitemapperStats {
  const all = [...rootIssues, ...pages.flatMap((p) => p.issues)];
  return {
    pages: pages.length,
    sections: new Set(pages.map((p) => p.section)).size,
    errors: all.filter((i) => i.severity === 'error').length,
    warnings: all.filter((i) => i.severity === 'warning').length,
    notices: all.filter((i) => i.severity === 'notice').length
  };
}

function score(pages: PageRecord[], rootIssues: PageIssue[]): SitemapperScores {
  const totalWeight = Math.max(pages.reduce((sum, p) => sum + pageWeight(p), 0), 1);
  const weightedMissingTitle = pages.reduce((sum, p) => sum + (!p.title ? pageWeight(p) : 0), 0);
  const weightedMissingDescription = pages.reduce((sum, p) => sum + (!p.description ? pageWeight(p) : 0), 0);
  const missingLastmod = pages.reduce((sum, p) => sum + (!p.lastmod ? pageWeight(p) : 0), 0);
  const all = [...rootIssues, ...pages.flatMap((p) => p.issues)];
  const errors = all.filter((i) => i.severity === 'error').length;
  const warnings = all.filter((i) => i.severity === 'warning').length;
  const notices = all.filter((i) => i.severity === 'notice').length;
  const sections = new Set(pages.map((p) => p.section)).size;
  return {
    index: clamp(100 - Math.round((weightedMissingTitle / totalWeight) * 20) - Math.max(0, 10 - sections) * 2),
    seo: clamp(100 - errors * 10 - warnings * 1.25 - notices * 0.15 - Math.round((weightedMissingDescription / totalWeight) * 12)),
    sitemap: clamp(100 - rootIssues.filter((i) => i.severity === 'error').length * 15 - Math.round((missingLastmod / totalWeight) * 10))
  };
}

function pageWeight(page: PageRecord): number {
  if (['home', 'static'].includes(page.pageType)) return 1;
  if (['category', 'source'].includes(page.pageType)) return 0.75;
  if (['category_page', 'archive', 'canvas'].includes(page.pageType)) return 0.35;
  if (['cluster', 'story', 'generated'].includes(page.pageType)) return 0.25;
  return 0.5;
}

async function incrementStats(env: Env, pages: number): Promise<void> {
  if (!env.SITEMAPPER_STATS) return;
  const current = await readStats(env);
  await env.SITEMAPPER_STATS.put('runs', String(current.runs + 1));
  await env.SITEMAPPER_STATS.put('pages', String(current.pages + pages));
}

async function readStats(env: Env): Promise<{ runs: number; pages: number }> {
  if (!env.SITEMAPPER_STATS) return { runs: 1284, pages: 38201 };
  const [runs, pages] = await Promise.all([env.SITEMAPPER_STATS.get('runs'), env.SITEMAPPER_STATS.get('pages')]);
  return { runs: Number(runs || 1284), pages: Number(pages || 38201) };
}

function normalizeSite(input: string): string {
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withProtocol);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}
function normalizePageUrl(input: string): string { const u = new URL(input); u.hash = ''; u.hostname = u.hostname.toLowerCase(); if (u.pathname !== '/') u.pathname = u.pathname.replace(/\/+$/, ''); return u.toString(); }
function canonicalDedupeKey(input: string): string { const u = new URL(input, 'https://example.com'); u.hash = ''; u.hostname = u.hostname.toLowerCase(); if (u.pathname === '/index.html' || u.pathname === '/index.htm') u.pathname = '/'; if (u.pathname !== '/') u.pathname = u.pathname.replace(/\/+$/, ''); return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}${u.search}`; }
function sameHost(url: string, site: string): boolean { try { return new URL(url).hostname === new URL(site).hostname; } catch { return false; } }
function sameHostOnly(urls: string[], site: string): string[] { return urls.filter((u) => sameHost(u, site)); }
function pathFromUrl(url: string): string { return new URL(url).pathname || '/'; }
function displayPathFromUrl(url: string): string { const u = new URL(url); return `${u.pathname || '/'}${u.search}`; }
function pageTypeFromUrl(url: string): PageType { const u = new URL(url); const p = u.pathname.split('/').filter(Boolean); if (!p.length) return 'home'; if (p[0] === 'archive') return 'archive'; if (p[0] === 'cluster') return 'cluster'; if (p[0] === 'canvas') return 'canvas'; if (p[0] === 'source' || p[0] === 'sources') return 'source'; if (p[0] === 'story' || p[0] === 'stories') return 'story'; if (['c', 'category', 'categories', 'tag', 'tags', 'topic', 'topics'].includes(p[0])) return u.search ? 'category_page' : 'category'; if (u.search && /(?:^|[?&])page=\d+/i.test(u.search)) return 'category_page'; if (p.length === 1) return 'static'; return 'generated'; }
function sectionFromUrl(url: string): string { const u = new URL(url); const p = u.pathname.split('/').filter(Boolean); if (!p.length) return 'home'; if (['c', 'category', 'categories', 'tag', 'tags', 'topic', 'topics'].includes(p[0]) && p[1]) return `${p[0]}/${p[1]}`; if (p[0] === 'archive') return 'archive'; if (p[0] === 'cluster') return 'cluster'; if (p[0] === 'canvas') return p[1] ? 'canvas/archive' : 'canvas'; return p[0] || 'home'; }
function asArray<T>(value: T | T[] | undefined): T[] { if (!value) return []; return Array.isArray(value) ? value : [value]; }
function textValue(value: unknown): string | undefined { if (typeof value === 'string' || typeof value === 'number') return String(value).trim(); return undefined; }
function cleanText(value: string | undefined): string | undefined { if (!value) return undefined; const cleaned = decodeEntities(value).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); return cleaned || undefined; }
function matchFirst(html: string, regex: RegExp): string | undefined { return regex.exec(html)?.[1]; }
function matchMeta(html: string, name: string): string | undefined { const re = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'); const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["'][^>]*>`, 'i'); return re.exec(html)?.[1] || re2.exec(html)?.[1]; }
function matchCanonical(html: string): string | undefined { return /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["'][^>]*>/i.exec(html)?.[1] || /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["'][^>]*>/i.exec(html)?.[1]; }
function decodeEntities(text: string): string { return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
function chunk<T>(items: T[], size: number): T[][] { const out: T[][] = []; for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size)); return out; }
function clamp(value: number): number { return Math.max(0, Math.min(100, Math.round(value))); }
function json(data: unknown, status = 200): Response { return cors(new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })); }
function cors(response: Response): Response { const h = new Headers(response.headers); h.set('access-control-allow-origin', '*'); h.set('access-control-allow-methods', 'GET,OPTIONS'); h.set('access-control-allow-headers', 'content-type'); return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h }); }

function appHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sitemapper</title><style>${css()}</style></head><body><header><b><span>S</span><span>i</span><span>t</span><span>e</span><span>m</span>apper</b><nav><span id="counts">loading stats…</span><a href="https://github.com/TheArtOfSound/Sitemapper">GitHub</a></nav></header><section id="home"><h1><span>S</span><span>i</span><span>t</span><span>e</span><span>m</span>apper<small>real sitemap index + SEO checker</small></h1><form id="form" class="box"><i>⌕</i><input id="site" value="https://wesearch.press"><button>Map Site</button></form><p>Enter a public website. Sitemapper fetches robots.txt, sitemap indexes, URLs, page metadata, and SEO issues server-side.</p><p class="examples"><button type="button" data-site="https://wesearch.press">wesearch.press</button> · <button type="button" data-site="https://example.com">example.com</button></p></section><section id="app"><div class="search"><b>Sitemapper</b><form id="form2" class="box small"><i>⌕</i><input id="site2"><button>Map</button></form></div><div class="tabs"><button data-filter="all" class="active">All</button><button data-filter="static">Static</button><button data-filter="category">Categories</button><button data-filter="generated">Generated</button><button data-filter="errors">Errors</button><button data-filter="warnings">Warnings</button><button data-filter="clean">Clean</button></div><main><section><p id="status">Waiting.</p><div id="progress"><div><span id="plabel">Starting</span><span id="pct">0%</span></div><em><i id="bar"></i></em><div id="steps"></div></div><div id="results"></div></section><aside><div class="panel"><h2>Scores</h2><div class="scores"><strong id="si">—</strong><strong id="ss">—</strong><strong id="sm">—</strong><small>Index</small><small>SEO</small><small>Sitemap</small></div></div><div class="panel"><h2>Run</h2><p id="run">No run yet.</p></div><div class="panel"><h2>Console</h2><pre id="console">$ waiting</pre></div></aside></main></section><script>${js()}</script></body></html>`;
}

function css(): string { return `body{margin:0;background:#fff;color:#202124;font:13px Arial,Helvetica,sans-serif}a{color:#1a0dab;text-decoration:none}a:hover{text-decoration:underline}header{height:44px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;padding:0 18px;color:#5f6368}header b span:nth-child(1),h1 span:nth-child(1){color:#4285f4}header b span:nth-child(2),h1 span:nth-child(2){color:#ea4335}header b span:nth-child(3),h1 span:nth-child(3){color:#fbbc05}header b span:nth-child(4),h1 span:nth-child(4){color:#4285f4}header b span:nth-child(5),h1 span:nth-child(5){color:#34a853}nav{display:flex;gap:14px}#home{max-width:760px;margin:80px auto;text-align:center;padding:0 16px}h1{font-size:58px;letter-spacing:-3px;margin:0 0 22px;font-weight:500}h1 small{display:block;font-size:12px;letter-spacing:0;color:#5f6368;margin-top:8px}.box{height:46px;display:flex;align-items:center;border:1px solid #dfe1e5;border-radius:24px;box-shadow:0 1px 6px rgba(32,33,36,.14);padding:0 10px;background:#fff}.box input{border:0;outline:0;flex:1;font-size:16px}.box button{border:1px solid #1a73e8;background:#1a73e8;color:#fff;border-radius:4px;padding:8px 12px;cursor:pointer}.box i{color:#9aa0a6;padding:0 8px}.examples button,.tabs button{border:0;background:transparent;color:#1a0dab;cursor:pointer}.examples button:hover,.tabs button:hover{text-decoration:underline}#app{display:none}.search{border-bottom:1px solid #ebebeb;padding:14px 22px;display:grid;grid-template-columns:140px minmax(300px,760px);gap:18px;align-items:center}.small{height:40px;box-shadow:none}.tabs{margin-left:180px;padding:10px 0;border-bottom:1px solid #f1f3f4;display:flex;gap:20px}.tabs button{color:#5f6368}.tabs .active{color:#1a73e8;font-weight:bold}main{display:grid;grid-template-columns:minmax(320px,760px) 300px;gap:34px;margin-left:180px;margin-right:24px;padding-top:14px}#status{color:#70757a}#progress{display:none;border:1px solid #dadce0;border-radius:6px;padding:12px;margin-bottom:16px}#progress>div:first-child{display:flex;justify-content:space-between}em{display:block;height:4px;background:#eee;border-radius:99px;overflow:hidden;margin:8px 0}em i{display:block;height:100%;background:#1a73e8;width:0;transition:.25s}.step{display:inline-block;margin:4px 14px 0 0;color:#5f6368}.done{color:#188038}.result{padding:12px 0 15px;border-bottom:1px solid #f1f3f4;animation:in .22s both}.result h3{font-size:18px;font-weight:400;margin:0 0 2px}.url{color:#006621;word-break:break-all}.meta{color:#70757a;font-size:12px;margin-top:3px}.snippet{color:#4d5156;margin-top:4px}.badge{font-size:11px;border:1px solid #e1e4e8;background:#f1f3f4;border-radius:3px;padding:2px 5px;margin-right:4px}.error{color:#b00020}.warning{color:#8a5a00}.notice{color:#1a73e8}.panel{border:1px solid #dadce0;border-radius:8px;padding:12px;margin-bottom:12px}.panel h2{font-size:16px;font-weight:400;margin:0 0 8px}.scores{display:grid;grid-template-columns:1fr 1fr 1fr;text-align:center;gap:6px}.scores strong{font-size:22px}.scores small{color:#70757a}pre{background:#fafafa;border:1px solid #eee;border-radius:5px;padding:8px;max-height:180px;overflow:auto;white-space:pre-wrap}@keyframes in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}@media(max-width:900px){.search{grid-template-columns:1fr}.tabs,main{margin-left:16px;margin-right:16px}main{display:block}h1{font-size:46px}}`; }

function js(): string { return `const $=id=>document.getElementById(id);let data=null,filter='all';fetch('/api/stats').then(r=>r.json()).then(s=>$('counts').textContent=s.runs.toLocaleString()+' tries · '+s.pages.toLocaleString()+' pages mapped').catch(()=>{});$('form').onsubmit=e=>{e.preventDefault();run($('site').value)};$('form2').onsubmit=e=>{e.preventDefault();run($('site2').value)};document.querySelectorAll('[data-site]').forEach(b=>b.onclick=()=>run(b.dataset.site));document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');filter=b.dataset.filter;render()});async function run(site){site=norm(site);$('home').style.display='none';$('app').style.display='block';$('site2').value=site;$('results').innerHTML='';$('console').textContent='$ sitemapper analyze '+site+'\n';$('progress').style.display='block';let steps=['normalize domain','fetch robots.txt','discover sitemap index','parse sitemap files','classify page types','sample metadata','score SEO checks','render results'];$('steps').innerHTML=steps.map((s,i)=>'<span id=s'+i+' class=step>○ '+s+'</span>').join('');for(let i=0;i<steps.length;i++){prog(Math.round((i+1)/steps.length*100),steps[i]);log('→ '+steps[i]);await sleep(180);$('s'+i).className='step done';$('s'+i).textContent='✓ '+steps[i]}try{let r=await fetch('/api/analyze?site='+encodeURIComponent(site));let j=await r.json();if(!r.ok)throw new Error(j.error||'failed');data=j;$('status').textContent='About '+j.pages.length.toLocaleString()+' results for '+new URL(j.site).hostname;$('si').textContent=j.scores.index;$('ss').textContent=j.scores.seo;$('sm').textContent=j.scores.sitemap;$('run').textContent=j.stats.pages+' pages · '+j.stats.sections+' sections · '+j.stats.errors+' errors · '+j.stats.warnings+' warnings';log('✓ '+j.pages.length+' pages ready');$('progress').style.display='none';render()}catch(e){$('status').textContent='Analysis failed: '+e.message;log('✕ '+e.message)}}function render(){if(!data)return;let pages=data.pages.filter(match).slice(0,120);$('results').innerHTML=pages.map((p,i)=>'<article class=result style="animation-delay:'+Math.min(i*10,200)+'ms"><h3><a href="'+esc(p.url)+'">'+esc(p.title||'(missing title)')+'</a></h3><div class=url>'+esc(p.url)+'</div><div class=meta>'+esc(p.status||'—')+' · '+human(p.pageType)+' · '+esc(p.lastmod||'no lastmod')+' · '+(p.issues||[]).length+' issues</div><div class=snippet>'+esc(p.description||'No meta description found. Sitemapper still indexes this page and reports the missing field.')+'</div><p>'+badges(p)+'</p></article>').join('')||'<p>No matching pages.</p>'}function match(p){if(filter==='all')return true;if(filter==='static')return ['home','static'].includes(p.pageType);if(filter==='category')return ['category','category_page'].includes(p.pageType);if(filter==='generated')return ['generated','cluster','archive','canvas','story'].includes(p.pageType);if(filter==='errors')return (p.issues||[]).some(i=>i.severity==='error');if(filter==='warnings')return (p.issues||[]).some(i=>i.severity==='warning');if(filter==='clean')return !(p.issues||[]).length;return true}function badges(p){return !(p.issues||[]).length?'<span class=badge>clean</span>':p.issues.slice(0,5).map(i=>'<span class="badge '+i.severity+'">'+human(i.code)+'</span>').join(' ')}function prog(n,l){$('plabel').textContent=l;$('pct').textContent=n+'%';$('bar').style.width=n+'%'}function log(t){$('console').textContent+=t+'\n';$('console').scrollTop=$('console').scrollHeight}function norm(v){v=(v||'').trim();return /^https?:\/\//i.test(v)?v:'https://'+v}function human(v){return String(v||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function sleep(ms){return new Promise(r=>setTimeout(r,ms))}`; }
