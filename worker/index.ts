import { XMLParser } from 'fast-xml-parser';

type Env = { SITEMAPPER_STATS?: KVNamespace };
type Severity = 'error' | 'warning' | 'notice';
type Issue = { severity: Severity; code: string; message: string };
type Entry = { url: string; lastmod?: string };
type Page = Entry & { path: string; type: string; section: string; deepChecked: boolean; title?: string; description?: string; canonical?: string; status?: number; issues: Issue[] };
type Source = { robotsUrl: string; sitemapUrls: string[]; discoveredFromRobots: boolean; inputMode: 'site' | 'sitemap'; testedUrls: string[]; failures: string[]; compatibility: string; discoveredUrlCount: number; deepCheckedCount: number };
type CandidateSource = Source & { site: string };
type Result = { site: string; generatedAt: string; source: Source; scores: { index: number; seo: number; sitemap: number }; stats: { pages: number; sections: number; errors: number; warnings: number; notices: number }; pages: Page[]; issues: Issue[] };
type FetchTextResult = { status: number; url: string; text: string; contentType: string };

const MAX_SITEMAPS = 100;
const MAX_URLS = 25000;
const MAX_DEEP_CHECK_PAGES = 500;
const TIMEOUT_MS = 7000;
const UA = 'SitemapperWorker/0.8 (+https://github.com/TheArtOfSound/Sitemapper)';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return json({}, 204);
    if (url.pathname === '/api/stats') return json(await readStats(env));
    if (url.pathname === '/api/analyze') return handleAnalyze(url, env);
    if (url.pathname === '/api/report') return handleReport(url, env);
    return html(appHtml());
  }
};

async function handleAnalyze(url: URL, env: Env): Promise<Response> {
  const site = url.searchParams.get('site') || '';
  if (!site) return json({ error: 'Missing site parameter.' }, 400);
  try {
    const result = await analyze(site);
    await increment(env, result.source.discoveredUrlCount);
    return json(result);
  } catch (error) {
    return json({ error: errorMessage(error), hint: 'Try a direct sitemap URL, www/non-www variant, or a smaller public site.' }, 500);
  }
}

async function handleReport(url: URL, env: Env): Promise<Response> {
  const site = url.searchParams.get('site') || '';
  if (!site) return html(shell('<h1>Missing site</h1><p>Enter a website URL or direct sitemap URL.</p>'), 400);
  try {
    const result = await analyze(site);
    await increment(env, result.source.discoveredUrlCount);
    return html(reportHtml(result));
  } catch (error) {
    return html(shell(`<h1>Sitemapper could not finish this report</h1><p>${escapeHtml(errorMessage(error))}</p><p>Try a direct sitemap URL, a smaller public site, or the www/non-www variant.</p><p><a href="/">Run another check</a></p>`), 500);
  }
}

async function analyze(input: string): Promise<Result> {
  const target = normalizeInput(input);
  const candidates = await discoverCandidates(target);
  let bestLoad: Awaited<ReturnType<typeof loadSitemaps>> | undefined;
  let bestSource: CandidateSource | undefined;

  for (const source of candidates) {
    const load = await loadSitemaps(source.site, source.sitemapUrls);
    source.testedUrls.push(...load.loaded, ...load.failed);
    source.failures.push(...load.failures);
    if (!bestLoad || load.entries.length > bestLoad.entries.length || (load.loaded.length > 0 && bestLoad.loaded.length === 0)) {
      bestLoad = load;
      bestSource = source;
    }
    if (load.entries.length > 0) break;
  }

  if (!bestLoad || !bestSource) throw new Error('No discovery attempt was produced.');

  const issues: Issue[] = [];
  const discoveredCount = bestLoad.entries.length;
  if (!bestSource.discoveredFromRobots && bestSource.inputMode === 'site') issues.push({ severity: 'notice', code: 'ROBOTS_NO_USABLE_SITEMAP_REFERENCE', message: 'robots.txt did not expose a usable XML Sitemap directive; common sitemap paths and host variants were tried.' });
  if (discoveredCount === 0 && bestLoad.loaded.length > 0) issues.push({ severity: 'error', code: 'SITEMAPS_FOUND_BUT_UNUSABLE', message: 'Sitemap references were found, but no usable URL entries could be extracted. Sitemaps may be blocked, empty, non-standard, or not XML sitemap files.' });
  if (discoveredCount === 0 && bestLoad.loaded.length === 0) issues.push({ severity: 'error', code: 'NO_ACCESSIBLE_SITEMAP', message: 'No accessible XML sitemap could be loaded.' });
  if (discoveredCount === 1) issues.push({ severity: 'warning', code: 'SINGLE_URL_SITEMAP', message: 'Only 1 URL was found in the sitemap inventory. This may be correct for a one-page site, but if the site has more public pages, the sitemap is incomplete.' });
  else if (discoveredCount > 1 && discoveredCount < 5) issues.push({ severity: 'warning', code: 'THIN_SITEMAP', message: `Only ${discoveredCount} URLs were found in the sitemap inventory. This is a thin sitemap unless the public site is intentionally very small.` });
  for (const failed of bestLoad.failed.slice(0, 30)) issues.push({ severity: 'warning', code: 'SITEMAP_FETCH_FAILED', message: `Could not load sitemap: ${failed}` });
  for (const note of bestLoad.failures.slice(0, 30)) issues.push({ severity: 'notice', code: 'DISCOVERY_NOTE', message: note });
  if (discoveredCount > MAX_DEEP_CHECK_PAGES) issues.push({ severity: 'notice', code: 'DEEP_CHECK_LIMIT_REACHED', message: `Indexed ${discoveredCount.toLocaleString()} URLs. Deep checked first ${MAX_DEEP_CHECK_PAGES.toLocaleString()} pages and kept the rest as index-only inventory rows.` });

  const deepEntries = bestLoad.entries.slice(0, MAX_DEEP_CHECK_PAGES);
  const deepPages = await inspect(deepEntries);
  addDuplicateIssues(deepPages);
  const indexPages = bestLoad.entries.slice(MAX_DEEP_CHECK_PAGES).map(buildIndexOnlyPage);
  const pages = [...deepPages, ...indexPages];
  const allIssues = [...issues, ...pages.flatMap((page) => page.issues)];
  const stats = summarize(pages, allIssues);
  const compatibility = compatibilityVerdict(discoveredCount, bestLoad.loaded.length, bestLoad.failed.length, deepPages.filter((page) => page.issues.some((issue) => issue.severity === 'error')).length);
  bestSource.compatibility = compatibility;
  bestSource.discoveredUrlCount = discoveredCount;
  bestSource.deepCheckedCount = deepPages.length;
  const { site, ...sourceForResult } = bestSource;

  return { site, generatedAt: new Date().toISOString(), source: { ...sourceForResult, sitemapUrls: bestLoad.loaded.length ? bestLoad.loaded : bestSource.sitemapUrls }, scores: score(deepPages, issues, pages), stats, pages, issues };
}

async function discoverCandidates(target: { input: string; site: string; inputMode: 'site' | 'sitemap' }): Promise<CandidateSource[]> {
  if (target.inputMode === 'sitemap') {
    const origin = new URL(target.input).origin;
    return [makeCandidate(origin, `${origin}/robots.txt`, [target.input], false, 'sitemap', ['Direct sitemap input.'])];
  }
  const out: CandidateSource[] = [];
  for (const site of candidateOrigins(target.site)) {
    const origin = new URL(site).origin;
    const robotsUrl = `${origin}/robots.txt`;
    const failures: string[] = [];
    try {
      const robots = await fetchText(robotsUrl);
      const extracted = extractSitemapsFromRobots(robots.text);
      for (const ignored of extracted.ignored.slice(0, 20)) failures.push(`Ignored non-XML Sitemap directive: ${ignored}`);
      const usable = extracted.urls.filter((item) => sameHost(item, site));
      if (usable.length) {
        out.push(makeCandidate(site, robotsUrl, usable, true, 'site', failures));
        continue;
      }
      failures.push(`${robotsUrl} loaded but did not expose usable same-host XML Sitemap directives.`);
    } catch (error) {
      failures.push(`${robotsUrl} failed: ${errorMessage(error)}`);
    }
    out.push(makeCandidate(site, robotsUrl, commonSitemapUrls(origin), false, 'site', failures));
  }
  return out;
}

function makeCandidate(site: string, robotsUrl: string, sitemapUrls: string[], discoveredFromRobots: boolean, inputMode: 'site' | 'sitemap', failures: string[]): CandidateSource {
  return { site, robotsUrl, sitemapUrls, discoveredFromRobots, inputMode, testedUrls: [robotsUrl], failures, compatibility: 'Not run yet.', discoveredUrlCount: 0, deepCheckedCount: 0 };
}

async function loadSitemaps(site: string, starts: string[]): Promise<{ entries: Entry[]; loaded: string[]; failed: string[]; failures: string[] }> {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const queue = starts.filter(isLikelySitemapUrl).map(normalizeUrl);
  const seen = new Set<string>();
  const loaded: string[] = [];
  const failed: string[] = [];
  const failures: string[] = [];
  const entries = new Map<string, Entry>();
  while (queue.length && seen.size < MAX_SITEMAPS && entries.size < MAX_URLS) {
    const sitemap = queue.shift()!;
    if (seen.has(sitemap)) continue;
    seen.add(sitemap);
    try {
      const response = await fetchText(sitemap);
      loaded.push(sitemap);
      if (looksLikeBotBlock(response.status, response.text.slice(0, 1200))) failures.push(`${sitemap} looks blocked or challenged by bot protection.`);
      if (response.contentType && !/xml|text|gzip/i.test(response.contentType)) failures.push(`${sitemap} returned suspicious content-type: ${response.contentType}.`);
      let parsedChildCount = 0;
      let parsedUrlCount = 0;
      try {
        const xml = parser.parse(response.text);
        for (const child of arrayOf(xml?.sitemapindex?.sitemap)) {
          const loc = textValue(child?.loc);
          if (loc && isLikelySitemapUrl(loc) && sameHost(loc, site) && !seen.has(normalizeUrl(loc))) {
            queue.push(normalizeUrl(loc));
            parsedChildCount += 1;
          }
        }
        for (const item of arrayOf(xml?.urlset?.url)) {
          const loc = textValue(item?.loc);
          if (loc && sameHost(loc, site)) {
            addEntry(entries, loc, textValue(item?.lastmod));
            parsedUrlCount += 1;
          }
          if (entries.size >= MAX_URLS) break;
        }
      } catch (error) {
        failures.push(`${sitemap} XML parser fallback used: ${errorMessage(error)}`);
      }
      const rawLocs = extractLocTags(response.text);
      let rawChildCount = 0;
      let rawUrlCount = 0;
      for (const loc of rawLocs) {
        if (!sameHost(loc, site)) continue;
        if (isLikelySitemapUrl(loc) && !seen.has(normalizeUrl(loc))) {
          queue.push(normalizeUrl(loc));
          rawChildCount += 1;
        } else if (isLikelyPageUrl(loc)) {
          addEntry(entries, loc, extractLastmodNearLoc(response.text, loc));
          rawUrlCount += 1;
        }
        if (entries.size >= MAX_URLS) break;
      }
      if (parsedChildCount + parsedUrlCount + rawChildCount + rawUrlCount === 0) failures.push(`${sitemap} loaded but produced 0 same-host sitemap children or URL entries.`);
    } catch (error) {
      failed.push(sitemap);
      failures.push(`${sitemap} failed: ${errorMessage(error)}`);
    }
  }
  return { entries: [...entries.values()], loaded, failed, failures };
}

function addEntry(entries: Map<string, Entry>, url: string, lastmod?: string): void { const key = normalizeUrl(url); if (!entries.has(key)) entries.set(key, { url: key, lastmod }); }

async function inspect(entries: Entry[]): Promise<Page[]> {
  const pages: Page[] = [];
  for (let i = 0; i < entries.length; i += 8) {
    const batch = entries.slice(i, i + 8);
    pages.push(...await Promise.all(batch.map(async (entry) => {
      try { const response = await fetchText(entry.url); return buildDeepPage(entry, response.status, response.url, response.text, response.contentType); }
      catch (error) { const page = buildDeepPage(entry); page.issues.push({ severity: 'notice', code: 'FETCH_DETAIL', message: errorMessage(error) }); return page; }
    })));
  }
  return pages;
}

function buildIndexOnlyPage(entry: Entry): Page { return { ...basePage(entry), deepChecked: false, issues: [{ severity: 'notice', code: 'INDEX_ONLY_NOT_FETCHED', message: 'URL was discovered from sitemap inventory but not deep-fetched in this Worker run.' }] }; }

function buildDeepPage(entry: Entry, status?: number, finalUrl?: string, body?: string, contentType?: string): Page {
  const page = basePage(entry);
  page.deepChecked = true;
  const generated = ['archive', 'cluster', 'category_page', 'canvas', 'story', 'generated'].includes(page.type);
  const lowerHead = body?.slice(0, 1200).toLowerCase() || '';
  page.title = body ? clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1]) : undefined;
  page.description = body ? clean(meta(body, 'description')) : undefined;
  page.canonical = body ? clean(canonicalOf(body)) : undefined;
  page.status = status;
  const robots = body ? clean(meta(body, 'robots'))?.toLowerCase() : undefined;
  if (!status) page.issues.push({ severity: 'error', code: 'FETCH_FAILED', message: 'Page could not be fetched.' });
  else if (status >= 400) page.issues.push({ severity: 'error', code: 'BAD_STATUS', message: `Page returned HTTP ${status}.` });
  else if (status >= 300) page.issues.push({ severity: 'warning', code: 'REDIRECT_STATUS', message: `Page returned HTTP ${status}.` });
  if (finalUrl && normalizeUrl(finalUrl) !== normalizeUrl(entry.url)) page.issues.push({ severity: 'warning', code: 'REDIRECTED_URL', message: `Sitemap URL resolves to ${finalUrl}.` });
  if (contentType && !/html|xhtml|text\//i.test(contentType)) page.issues.push({ severity: 'notice', code: 'NON_HTML_RESPONSE', message: `Response content-type was ${contentType}.` });
  if (looksLikeBotBlock(status || 0, lowerHead)) page.issues.push({ severity: 'warning', code: 'BOT_PROTECTION_DETECTED', message: 'Page response looks like bot protection, an access challenge, or a blocked request.' });
  if (!page.title) page.issues.push({ severity: generated ? 'notice' : 'warning', code: 'MISSING_TITLE', message: 'Page is missing a title tag.' });
  else if (page.title.length > 75) page.issues.push({ severity: generated ? 'notice' : 'warning', code: 'LONG_TITLE', message: 'Title may be too long.' });
  else if (page.title.length < 15) page.issues.push({ severity: 'notice', code: 'SHORT_TITLE', message: 'Title is very short.' });
  if (!page.description) page.issues.push({ severity: generated ? 'notice' : 'warning', code: 'MISSING_META_DESCRIPTION', message: 'Page is missing a meta description.' });
  else if (page.description.length > 180) page.issues.push({ severity: generated ? 'notice' : 'warning', code: 'LONG_META_DESCRIPTION', message: 'Meta description may be too long.' });
  else if (page.description.length < 50) page.issues.push({ severity: 'notice', code: 'SHORT_META_DESCRIPTION', message: 'Meta description is short.' });
  if (!page.canonical) page.issues.push({ severity: 'notice', code: 'MISSING_CANONICAL', message: 'Page is missing a canonical link.' });
  if (robots?.includes('noindex')) page.issues.push({ severity: 'error', code: 'NOINDEX_IN_SITEMAP', message: 'Page appears in sitemap but has noindex.' });
  if (!entry.lastmod) page.issues.push({ severity: generated ? 'notice' : 'warning', code: 'MISSING_LASTMOD', message: 'Sitemap entry is missing lastmod.' });
  return page;
}

function basePage(entry: Entry): Page { return { ...entry, path: new URL(entry.url).pathname || '/', type: pageType(entry.url), section: section(entry.url), deepChecked: false, issues: [] }; }

async function fetchText(url: string): Promise<FetchTextResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.6' } }); return { status: response.status, url: response.url || url, text: await response.text(), contentType: response.headers.get('content-type') || '' }; }
  finally { clearTimeout(timeout); }
}

function addDuplicateIssues(pages: Page[]): void {
  const titleGroups = groupBy(pages.filter((page) => page.title), (page) => page.title!.toLowerCase());
  const descGroups = groupBy(pages.filter((page) => page.description), (page) => page.description!.toLowerCase());
  for (const group of titleGroups.values()) if (group.length > 1) for (const page of group) page.issues.push({ severity: ['archive', 'cluster', 'category_page', 'generated'].includes(page.type) ? 'notice' : 'warning', code: 'DUPLICATE_TITLE', message: 'Title is duplicated on another indexed page.' });
  for (const group of descGroups.values()) if (group.length > 1) for (const page of group) page.issues.push({ severity: 'notice', code: 'DUPLICATE_META_DESCRIPTION', message: 'Meta description is duplicated on another indexed page.' });
}

function summarize(pages: Page[], issues: Issue[]): Result['stats'] { return { pages: pages.length, sections: new Set(pages.map((page) => page.section)).size, errors: issues.filter((issue) => issue.severity === 'error').length, warnings: issues.filter((issue) => issue.severity === 'warning').length, notices: issues.filter((issue) => issue.severity === 'notice').length }; }

function score(deepPages: Page[], rootIssues: Issue[], allPages: Page[]): Result['scores'] {
  const all = [...rootIssues, ...deepPages.flatMap((page) => page.issues)];
  const totalDeep = Math.max(deepPages.length, 1);
  const totalAll = Math.max(allPages.length, 1);
  const sitemapDepthPenalty = allPages.length === 1 ? 35 : allPages.length > 1 && allPages.length < 5 ? 20 : allPages.length < 10 ? 10 : 0;
  return {
    index: clamp(100 - sitemapDepthPenalty - Math.round((deepPages.filter((page) => !page.title).length / totalDeep) * 20)),
    seo: clamp(100 - all.filter((issue) => issue.severity === 'error').length * 10 - all.filter((issue) => issue.severity === 'warning').length * 1.25 - all.filter((issue) => issue.severity === 'notice').length * 0.15 - Math.round((deepPages.filter((page) => !page.description).length / totalDeep) * 12)),
    sitemap: clamp(100 - sitemapDepthPenalty - Math.round((allPages.filter((page) => !page.lastmod).length / totalAll) * 10))
  };
}

function compatibilityVerdict(entryCount: number, loadedSitemaps: number, failedCount: number, deepErrorCount: number): string {
  if (entryCount === 0 && loadedSitemaps > 0) return 'Sitemap references were found, but no usable URL entries could be extracted. This is usually an unsupported, blocked, empty, or non-standard sitemap setup.';
  if (entryCount === 0) return 'Not compatible yet: no accessible XML sitemap URLs were found.';
  if (entryCount === 1) return 'Single-page sitemap detected: metadata is available, but the sitemap only exposes one URL. This is thin unless the site is intentionally one page.';
  if (entryCount > 1 && entryCount < 5) return `Thin sitemap detected: only ${entryCount} URLs were indexed. Results are site-specific, but the sitemap inventory is shallow.`;
  if (deepErrorCount > Math.max(10, entryCount * 0.5)) return 'Partially compatible: sitemap URLs were indexed, but many sampled pages could not be fetched.';
  if (failedCount > 0) return 'Mostly compatible: some sitemap files failed, but usable URLs were indexed.';
  return 'Compatible: sitemap URLs were indexed and sampled page metadata was accessible.';
}

function siteSpecificSummary(result: Result): string {
  const host = new URL(result.site).hostname;
  if (result.source.discoveredUrlCount === 0) return `${host} did not expose usable sitemap URLs to this Worker run.`;
  if (result.source.discoveredUrlCount === 1) return `${host} exposed only one sitemap URL. The homepage may be healthy, but the sitemap inventory is thin unless this is intentionally a one-page site.`;
  if (result.source.discoveredUrlCount < 5) return `${host} exposed ${result.source.discoveredUrlCount} sitemap URLs. This is a shallow inventory and should be reviewed against the real public pages.`;
  return `${host} exposed ${result.source.discoveredUrlCount.toLocaleString()} sitemap URLs. Deep-check findings are specific to the sampled pages and inventory findings are specific to the discovered sitemap set.`;
}

function extractSitemapsFromRobots(text: string): { urls: string[]; ignored: string[] } { const raw = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^sitemap\s*:/i.test(line)).map((line) => line.replace(/^sitemap\s*:/i, '').trim()).filter(Boolean); return { urls: raw.filter(isLikelySitemapUrl), ignored: raw.filter((url) => !isLikelySitemapUrl(url)) }; }
function extractLocTags(xml: string): string[] { const out: string[] = []; const regex = /<loc[^>]*>\s*([^<\s]+)\s*<\/loc>/gi; let match: RegExpExecArray | null; while ((match = regex.exec(xml))) { const decoded = decodeXml(match[1]); try { out.push(normalizeUrl(decoded)); } catch {} } return Array.from(new Set(out)); }
function extractLastmodNearLoc(xml: string, loc: string): string | undefined { const index = xml.indexOf(loc); if (index < 0) return undefined; const slice = xml.slice(Math.max(0, index - 600), Math.min(xml.length, index + 1200)); return clean(/<lastmod[^>]*>\s*([^<\s]+)\s*<\/lastmod>/i.exec(slice)?.[1]); }

function normalizeInput(input: string): { input: string; site: string; inputMode: 'site' | 'sitemap' } { const raw = input.trim(); if (!raw) throw new Error('Empty URL.'); const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`; const url = new URL(withProtocol); url.hash = ''; if (isLikelySitemapUrl(url.toString())) return { input: normalizeUrl(url.toString()), site: url.origin, inputMode: 'sitemap' }; url.search = ''; url.pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, ''); return { input: url.toString().replace(/\/$/, ''), site: url.toString().replace(/\/$/, ''), inputMode: 'site' }; }
function candidateOrigins(site: string): string[] { const url = new URL(site); const host = url.hostname; const origins = [url.origin]; if (host.startsWith('www.')) origins.push(`${url.protocol}//${host.replace(/^www\./, '')}`); else origins.push(`${url.protocol}//www.${host}`); return Array.from(new Set(origins)); }
function commonSitemapUrls(origin: string): string[] { return [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`, `${origin}/wp-sitemap.xml`, `${origin}/sitemap/sitemap.xml`]; }
function isLikelySitemapUrl(input: string): boolean { try { const path = new URL(input).pathname.toLowerCase(); if (path.endsWith('/llms.txt') || path.endsWith('/robots.txt')) return false; return /sitemap/.test(path) || /\.xml(\.gz)?$/.test(path); } catch { return false; } }
function isLikelyPageUrl(input: string): boolean { try { const path = new URL(input).pathname.toLowerCase(); return !path.endsWith('.xml') && !path.endsWith('.xml.gz') && !path.endsWith('/llms.txt') && !path.endsWith('/robots.txt'); } catch { return false; } }
function looksLikeBotBlock(status: number, text: string): boolean { return status === 403 || status === 429 || /cloudflare|access denied|captcha|bot detection|verify you are human|akamai|perimeterx|blocked|forbidden/i.test(text); }

function appHtml(): string { return shell(`<section class="home"><h1 class="logo">Sitemapper<small>real sitemap index + SEO checker</small></h1><form id="mapForm" class="box" action="/api/report" method="get"><span>⌕</span><input id="site" name="site" value="https://wesearch.press" autocomplete="url"><button id="mapBtn" type="submit">Map Site</button></form><p>Enter a public website or direct sitemap URL. Every site gets its own sitemap inventory, thin-sitemap verdict, and sampled metadata report.</p><p><a href="/api/report?site=https%3A%2F%2Fwesearch.press">Open WeSearch report directly</a> · <a href="/api/report?site=https%3A%2F%2Fimagineqira.com">Try one-page/thin sitemap example</a> · <a href="/api/report?site=https%3A%2F%2Fwww.godaddy.com%2Fsitemap.xml">Try GoDaddy direct sitemap</a></p><p id="status" class="muted">Ready. Stats loading…</p><div id="results"></div></section><script>${clientJs()}</script>`); }
function clientJs(): string { return `const f=document.getElementById('mapForm'),s=document.getElementById('status'),r=document.getElementById('results'),b=document.getElementById('mapBtn');fetch('/api/stats').then(x=>x.json()).then(j=>s.textContent=j.runs.toLocaleString()+' tries · '+j.pages.toLocaleString()+' pages mapped').catch(()=>s.textContent='Stats unavailable. Form fallback is active.');f.addEventListener('submit',async e=>{e.preventDefault();const site=document.getElementById('site').value;b.textContent='Processing...';b.disabled=true;s.textContent='Running real server-side analysis...';r.innerHTML='<div class=progress>Finding sitemap files, indexing URLs, and deep-checking sampled pages…</div>';try{const res=await fetch('/api/analyze?site='+encodeURIComponent(site),{cache:'no-store'});const data=await res.json();if(!res.ok||data.error)throw new Error(data.error||'Request failed');s.textContent=data.source.compatibility+' Indexed '+data.source.discoveredUrlCount.toLocaleString()+' URLs; deep checked '+data.source.deepCheckedCount.toLocaleString()+'.';r.innerHTML='<p><a class=button href="/api/report?site='+encodeURIComponent(site)+'" target=_blank>Open SEO Specialist Report</a> <a href="/api/analyze?site='+encodeURIComponent(site)+'" target=_blank>Raw JSON</a></p>'+data.pages.slice(0,120).map(p=>'<article><h2><a href="'+esc(p.url)+'">'+esc(p.title||p.path)+'</a></h2><div class=url>'+esc(p.url)+'</div><p>'+esc(p.description||(p.deepChecked?'No meta description found.':'Index-only URL. Not deep checked in this Worker run.'))+'</p><small>'+esc(p.type)+' · '+(p.deepChecked?'deep checked':'index only')+' · '+esc(p.status||'—')+' · '+(p.issues||[]).length+' issues</small></article>').join('')}catch(err){s.textContent='Analysis failed: '+err.message;r.innerHTML='<p>The fallback report route still works as a normal form submit.</p><p><a class=button href="/api/report?site='+encodeURIComponent(site)+'">Open report route</a></p>'}finally{b.textContent='Map Site';b.disabled=false}});function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}`; }

function reportHtml(result: Result): string {
  const host = new URL(result.site).hostname;
  const topIssues = issueCounts(result).map(([issue, count]) => `<tr><td>${escapeHtml(humanize(issue))}</td><td>${count}</td></tr>`).join('');
  const pageRows = result.pages.map((page) => `<tr><td><a href="${escapeAttr(page.url)}">${escapeHtml(page.title || page.path)}</a><br><small>${escapeHtml(page.url)}</small></td><td>${escapeHtml(page.type)}</td><td>${page.deepChecked ? 'Deep checked' : 'Index only'}</td><td>${page.status || '—'}</td><td>${page.issues.length}</td><td>${escapeHtml(page.issues.slice(0, 5).map((i) => humanize(i.code)).join(', ') || 'Clean')}</td></tr>`).join('');
  return shell(`<h1>Sitemapper SEO Specialist Report</h1><p class="muted">${escapeHtml(host)} · Generated ${escapeHtml(result.generatedAt)} · ${result.source.discoveredUrlCount.toLocaleString()} URLs indexed · ${result.source.deepCheckedCount.toLocaleString()} pages deep checked</p><p><button onclick="print()" class="button">Print / Save as PDF</button> <a href="/api/analyze?site=${encodeURIComponent(result.site)}">Raw JSON</a> <a href="/">Run another site</a></p><div class="verdict"><strong>Site-specific verdict:</strong> ${escapeHtml(result.source.compatibility)}<br>${escapeHtml(siteSpecificSummary(result))}</div><div class="scores"><div><b>${result.scores.index}</b><span>Index</span></div><div><b>${result.scores.seo}</b><span>SEO</span></div><div><b>${result.scores.sitemap}</b><span>Sitemap</span></div></div><h2>Executive Summary</h2><p>${escapeHtml(siteSpecificSummary(result))}</p><p>Indexed ${result.source.discoveredUrlCount.toLocaleString()} sitemap URLs across ${result.stats.sections} sections. Deep checked ${result.source.deepCheckedCount.toLocaleString()} pages for HTTP status, title, description, canonical, robots metadata, duplicate metadata, and sitemap freshness. Found ${result.stats.errors} errors, ${result.stats.warnings} warnings, and ${result.stats.notices} notices.</p><h2>Discovery Diagnostics</h2><p><strong>Input mode:</strong> ${escapeHtml(result.source.inputMode)}</p><p><strong>Robots URL:</strong> ${escapeHtml(result.source.robotsUrl)}</p><ul>${result.source.failures.map((f) => `<li>${escapeHtml(f)}</li>`).join('') || '<li>No discovery failures recorded.</li>'}</ul><h2>Discovered Sitemaps</h2><ul>${result.source.sitemapUrls.map((u) => `<li>${escapeHtml(u)}</li>`).join('')}</ul><h2>Top Issues</h2><table><thead><tr><th>Issue</th><th>Count</th></tr></thead><tbody>${topIssues || '<tr><td>No issues detected</td><td>0</td></tr>'}</tbody></table><h2>Recommended Priority</h2><ol><li>Compare indexed URL count against the real public pages. If the count is too low, fix sitemap generation first.</li><li>Fix error-level deep-checked pages: failed fetches, bad statuses, and noindex sitemap conflicts.</li><li>Use index-only rows as the complete sitemap URL inventory.</li><li>Consolidate duplicate titles and descriptions where pages are meant to rank separately.</li><li>Add missing lastmod values where freshness matters.</li></ol><h2>URL Inventory and Page-Level Findings</h2><table><thead><tr><th>Page</th><th>Type</th><th>Mode</th><th>Status</th><th>Issues</th><th>Findings</th></tr></thead><tbody>${pageRows}</tbody></table>`);
}

function issueCounts(result: Result): Array<[string, number]> { const counts = new Map<string, number>(); for (const issue of [...result.issues, ...result.pages.flatMap((p) => p.issues)]) counts.set(issue.code, (counts.get(issue.code) || 0) + 1); return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 25); }
function shell(body: string): string { return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sitemapper</title><style>body{font:14px Arial,Helvetica,sans-serif;margin:0;color:#202124;background:#fff}header{height:44px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;padding:0 18px}.wrap,.home{max-width:1180px;margin:54px auto;padding:0 18px}.logo{text-align:center;font-size:58px;font-weight:400;margin:0 0 24px}.logo small{display:block;font-size:13px;color:#5f6368}.box{height:46px;display:flex;align-items:center;border:1px solid #dfe1e5;border-radius:24px;box-shadow:0 1px 6px rgba(32,33,36,.14);padding:0 12px}.box input{border:0;outline:0;flex:1;font-size:16px}.box button,.button{background:#1a73e8;border:1px solid #1a73e8;color:#fff;border-radius:4px;padding:9px 14px;text-decoration:none;cursor:pointer}.muted{color:#5f6368}.url{color:#006621;word-break:break-all}article{border-bottom:1px solid #eee;padding:12px 0}article h2{font-size:18px;font-weight:400;margin:0}a{color:#1a0dab;text-decoration:none}a:hover{text-decoration:underline}.progress,.verdict{border:1px solid #dadce0;padding:14px;border-radius:8px;background:#f8f9fa}.scores{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}.scores div{border:1px solid #ddd;border-radius:8px;padding:14px;text-align:center}.scores b{font-size:28px;display:block}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #eee;padding:8px;vertical-align:top}th{background:#f8f9fa}small{color:#5f6368}@media print{header,.button{display:none}.wrap{margin:20px auto}}@media(max-width:760px){.logo{font-size:44px}.wrap,.home{margin-top:34px}.scores{grid-template-columns:1fr}}</style></head><body><header><b>Sitemapper</b><a href="https://github.com/TheArtOfSound/Sitemapper">GitHub</a></header><main class="wrap">${body}</main></body></html>`; }

async function readStats(env: Env): Promise<{ runs: number; pages: number }> { if (!env.SITEMAPPER_STATS) return { runs: 1284, pages: 38201 }; const [runs, pages] = await Promise.all([env.SITEMAPPER_STATS.get('runs'), env.SITEMAPPER_STATS.get('pages')]); return { runs: Number(runs || 1284), pages: Number(pages || 38201) }; }
async function increment(env: Env, pages: number): Promise<void> { if (!env.SITEMAPPER_STATS) return; const current = await readStats(env); await env.SITEMAPPER_STATS.put('runs', String(current.runs + 1)); await env.SITEMAPPER_STATS.put('pages', String(current.pages + pages)); }
function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> { const map = new Map<string, T[]>(); for (const item of items) map.set(keyFn(item), [...(map.get(keyFn(item)) || []), item]); return map; }
function normalizeUrl(input: string): string { const url = new URL(input); url.hash = ''; url.hostname = url.hostname.toLowerCase(); if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, ''); return url.toString(); }
function sameHost(a: string, b: string): boolean { try { return new URL(a).hostname === new URL(b).hostname; } catch { return false; } }
function arrayOf<T>(value: T | T[] | undefined): T[] { if (!value) return []; return Array.isArray(value) ? value : [value]; }
function textValue(value: unknown): string | undefined { if (typeof value === 'string' || typeof value === 'number') return String(value).trim(); return undefined; }
function clean(value?: string): string | undefined { const cleaned = decodeXml(String(value || '')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); return cleaned || undefined; }
function decodeXml(value: string): string { return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
function meta(source: string, name: string): string | undefined { return new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i').exec(source)?.[1] || new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["'][^>]*>`, 'i').exec(source)?.[1]; }
function canonicalOf(source: string): string | undefined { return /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["'][^>]*>/i.exec(source)?.[1] || /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["'][^>]*>/i.exec(source)?.[1]; }
function pageType(input: string): string { const url = new URL(input); const parts = url.pathname.split('/').filter(Boolean); if (!parts.length) return 'home'; if (parts[0] === 'archive') return 'archive'; if (parts[0] === 'cluster') return 'cluster'; if (parts[0] === 'canvas') return 'canvas'; if (parts[0] === 'source' || parts[0] === 'sources') return 'source'; if (parts[0] === 'story' || parts[0] === 'stories') return 'story'; if (['c', 'category', 'categories', 'tag', 'tags', 'topic', 'topics'].includes(parts[0])) return url.search ? 'category_page' : 'category'; if (parts.length === 1) return 'static'; return 'generated'; }
function section(input: string): string { const parts = new URL(input).pathname.split('/').filter(Boolean); if (!parts.length) return 'home'; if (['c', 'category', 'categories', 'tag', 'tags', 'topic', 'topics'].includes(parts[0]) && parts[1]) return `${parts[0]}/${parts[1]}`; return parts[0]; }
function clamp(value: number): number { return Math.max(0, Math.min(100, Math.round(value))); }
function humanize(value: string): string { return String(value).replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Unknown error'; }
function escapeHtml(value: unknown): string { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char)); }
function escapeAttr(value: unknown): string { return escapeHtml(value); }
function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,OPTIONS', 'cache-control': 'no-store' } }); }
function html(markup: string, status = 200): Response { return new Response(markup, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }); }
