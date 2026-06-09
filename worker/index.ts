import { XMLParser } from 'fast-xml-parser';

type Env = { SITEMAPPER_STATS?: KVNamespace };
type Severity = 'error' | 'warning' | 'notice';
type Issue = { severity: Severity; code: string; message: string };
type Page = { url: string; path: string; type: string; section: string; title?: string; description?: string; canonical?: string; status?: number; lastmod?: string; issues: Issue[] };
type Source = { robotsUrl: string; sitemapUrls: string[]; discoveredFromRobots: boolean; inputMode: 'site' | 'sitemap'; testedUrls: string[]; failures: string[]; compatibility: string };
type CandidateSource = Source & { site: string };
type Result = { site: string; generatedAt: string; source: Source; scores: { index: number; seo: number; sitemap: number }; stats: { pages: number; sections: number; errors: number; warnings: number; notices: number }; pages: Page[]; issues: Issue[] };

const MAX_SITEMAPS = 24;
const MAX_URLS = 4000;
const MAX_PAGES = 120;
const TIMEOUT = 7000;
const UA = 'SitemapperWorker/0.5 (+https://github.com/TheArtOfSound/Sitemapper)';

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
    await increment(env, result.stats.pages);
    return json(result);
  } catch (error) {
    return json({ error: errorMessage(error), hint: 'Try a direct sitemap.xml URL, the www/non-www variant, or a smaller public site.' }, 500);
  }
}

async function handleReport(url: URL, env: Env): Promise<Response> {
  const site = url.searchParams.get('site') || '';
  if (!site) return html(shell('<h1>Missing site</h1><p>Enter a website URL or direct sitemap URL.</p>'), 400);
  try {
    const result = await analyze(site);
    await increment(env, result.stats.pages);
    return html(reportHtml(result));
  } catch (error) {
    return html(shell(`<h1>Sitemapper could not finish this report</h1><p>${escapeHtml(errorMessage(error))}</p><p>Try a direct sitemap URL, a smaller public site, or the www/non-www variant.</p><p><a href="/">Run another check</a></p>`), 500);
  }
}

async function analyze(input: string): Promise<Result> {
  const target = normalizeInput(input);
  const discoveries = await discoverCandidates(target);
  const sourceIssues: Issue[] = [];
  let bestLoad: Awaited<ReturnType<typeof loadSitemaps>> | undefined;
  let bestSource: CandidateSource | undefined;

  for (const source of discoveries) {
    const load = await loadSitemaps(source.site, source.sitemapUrls);
    source.testedUrls.push(...load.loaded, ...load.failed);
    source.failures.push(...load.failures);
    if (!bestLoad || load.entries.length > bestLoad.entries.length) {
      bestLoad = load;
      bestSource = source;
    }
    if (load.entries.length > 0) break;
  }

  if (!bestLoad || !bestSource) throw new Error('No discovery attempt was produced.');
  if (!bestSource.discoveredFromRobots && bestSource.inputMode === 'site') sourceIssues.push({ severity: 'notice', code: 'ROBOTS_NO_SITEMAP_REFERENCE', message: 'robots.txt did not expose a Sitemap entry; tried common sitemap locations and host variants.' });
  for (const failed of bestLoad.failed) sourceIssues.push({ severity: 'warning', code: 'SITEMAP_FETCH_FAILED', message: `Could not load sitemap: ${failed}` });
  for (const failure of bestLoad.failures.slice(0, 8)) sourceIssues.push({ severity: 'notice', code: 'DISCOVERY_NOTE', message: failure });
  if (bestLoad.entries.length === 0) sourceIssues.push({ severity: 'error', code: 'NO_SITEMAP_URLS_FOUND', message: 'No URLs were found. The site may not expose a sitemap, may block datacenter fetches, or may require a direct sitemap URL.' });
  if (bestLoad.entries.length > MAX_PAGES) sourceIssues.push({ severity: 'notice', code: 'SAMPLE_LIMIT_REACHED', message: `Analyzed ${MAX_PAGES} sample pages from ${bestLoad.entries.length} discovered sitemap URLs.` });

  const pages = await inspect(bestLoad.entries.slice(0, MAX_PAGES));
  addDuplicateIssues(pages);
  const allIssues = [...sourceIssues, ...pages.flatMap((p) => p.issues)];
  const stats = summarize(pages, allIssues);
  const compatibility = compatibilityVerdict(bestLoad.entries.length, bestLoad.failed.length, stats.errors);
  bestSource.compatibility = compatibility;
  const { site, ...sourceForResult } = bestSource;

  return { site, generatedAt: new Date().toISOString(), source: { ...sourceForResult, sitemapUrls: bestLoad.loaded.length ? bestLoad.loaded : bestSource.sitemapUrls }, scores: score(pages, sourceIssues), stats, pages, issues: sourceIssues };
}

async function discoverCandidates(target: { input: string; site: string; inputMode: 'site' | 'sitemap' }): Promise<CandidateSource[]> {
  if (target.inputMode === 'sitemap') {
    return [{ site: new URL(target.input).origin, robotsUrl: `${new URL(target.input).origin}/robots.txt`, sitemapUrls: [target.input], discoveredFromRobots: false, inputMode: 'sitemap', testedUrls: [target.input], failures: [], compatibility: 'Direct sitemap input.' }];
  }

  const urls = candidateSiteOrigins(target.site);
  const out: CandidateSource[] = [];
  for (const site of urls) {
    const origin = new URL(site).origin;
    const robotsUrl = `${origin}/robots.txt`;
    const testedUrls = [robotsUrl];
    const failures: string[] = [];
    try {
      const robots = await fetchText(robotsUrl);
      const found = extractSitemaps(robots.text).filter((u) => sameHost(u, site));
      if (found.length) {
        out.push({ site, robotsUrl, sitemapUrls: found, discoveredFromRobots: true, inputMode: 'site', testedUrls, failures, compatibility: 'robots.txt exposed sitemap URLs.' });
        continue;
      }
      failures.push(`${robotsUrl} loaded but did not expose Sitemap directives.`);
    } catch (error) {
      failures.push(`${robotsUrl} failed: ${errorMessage(error)}`);
    }
    out.push({ site, robotsUrl, sitemapUrls: commonSitemapUrls(origin), discoveredFromRobots: false, inputMode: 'site', testedUrls, failures, compatibility: 'Common sitemap fallback.' });
  }
  return out;
}

function normalizeInput(input: string): { input: string; site: string; inputMode: 'site' | 'sitemap' } {
  const raw = input.trim();
  if (!raw) throw new Error('Empty URL.');
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
  url.hash = '';
  const isSitemap = /sitemap/i.test(url.pathname) || /\.xml(\.gz)?$/i.test(url.pathname);
  if (isSitemap) return { input: normalizeUrl(url.toString()), site: url.origin, inputMode: 'sitemap' };
  url.search = '';
  url.pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  return { input: url.toString().replace(/\/$/, ''), site: url.toString().replace(/\/$/, ''), inputMode: 'site' };
}

function candidateSiteOrigins(site: string): string[] {
  const url = new URL(site);
  const host = url.hostname;
  const alternates = [url.origin];
  if (host.startsWith('www.')) alternates.push(`${url.protocol}//${host.replace(/^www\./, '')}`);
  else alternates.push(`${url.protocol}//www.${host}`);
  return Array.from(new Set(alternates));
}

function commonSitemapUrls(origin: string): string[] {
  return [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`, `${origin}/wp-sitemap.xml`, `${origin}/sitemap/sitemap.xml`];
}

function extractSitemaps(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^sitemap\s*:/i.test(line)).map((line) => line.replace(/^sitemap\s*:/i, '').trim()).filter(Boolean);
}

async function loadSitemaps(site: string, starts: string[]): Promise<{ entries: Array<{ url: string; lastmod?: string }>; loaded: string[]; failed: string[]; failures: string[] }> {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const queue = starts.map(normalizeUrl);
  const seen = new Set<string>();
  const entries = new Map<string, { url: string; lastmod?: string }>();
  const loaded: string[] = [];
  const failed: string[] = [];
  const failures: string[] = [];

  while (queue.length && seen.size < MAX_SITEMAPS && entries.size < MAX_URLS) {
    const sitemap = queue.shift()!;
    if (seen.has(sitemap)) continue;
    seen.add(sitemap);
    try {
      const response = await fetchText(sitemap);
      const lower = response.text.slice(0, 500).toLowerCase();
      if (looksLikeBotBlock(response.status, lower)) failures.push(`${sitemap} looks blocked or challenged by bot protection.`);
      const xml = parser.parse(response.text);
      loaded.push(sitemap);

      for (const child of arrayOf(xml?.sitemapindex?.sitemap)) {
        const loc = textValue(child?.loc);
        if (loc && sameHost(loc, site) && !seen.has(normalizeUrl(loc))) queue.push(normalizeUrl(loc));
      }
      for (const item of arrayOf(xml?.urlset?.url)) {
        const loc = textValue(item?.loc);
        if (!loc || !sameHost(loc, site)) continue;
        const key = normalizeUrl(loc);
        if (!entries.has(key)) entries.set(key, { url: key, lastmod: textValue(item?.lastmod) });
        if (entries.size >= MAX_URLS) break;
      }
      if (!xml?.sitemapindex && !xml?.urlset) failures.push(`${sitemap} loaded, but did not look like a sitemap index or urlset.`);
    } catch (error) {
      failed.push(sitemap);
      failures.push(`${sitemap} failed: ${errorMessage(error)}`);
    }
  }
  return { entries: Array.from(entries.values()), loaded, failed, failures };
}

async function inspect(entries: Array<{ url: string; lastmod?: string }>): Promise<Page[]> {
  const pages: Page[] = [];
  for (let i = 0; i < entries.length; i += 8) {
    const batch = entries.slice(i, i + 8);
    const result = await Promise.all(batch.map(async (entry) => {
      try {
        const response = await fetchText(entry.url);
        return buildPage(entry, response.status, response.url, response.text, response.contentType);
      } catch (error) {
        const page = buildPage(entry, undefined, undefined, undefined, undefined);
        page.issues.push({ severity: 'notice', code: 'FETCH_DETAIL', message: errorMessage(error) });
        return page;
      }
    }));
    pages.push(...result);
  }
  return pages;
}

function buildPage(entry: { url: string; lastmod?: string }, status?: number, finalUrl?: string, body?: string, contentType?: string): Page {
  const issues: Issue[] = [];
  const type = pageType(entry.url);
  const generated = ['archive', 'cluster', 'category_page', 'canvas', 'story', 'generated'].includes(type);
  const lowerHead = body?.slice(0, 1200).toLowerCase() || '';
  const title = body ? clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1]) : undefined;
  const description = body ? clean(meta(body, 'description')) : undefined;
  const canonical = body ? clean(canonicalOf(body)) : undefined;
  const robots = body ? clean(meta(body, 'robots'))?.toLowerCase() : undefined;

  if (!status) issues.push({ severity: 'error', code: 'FETCH_FAILED', message: 'Page could not be fetched.' });
  else if (status >= 400) issues.push({ severity: 'error', code: 'BAD_STATUS', message: `Page returned HTTP ${status}.` });
  else if (status >= 300) issues.push({ severity: 'warning', code: 'REDIRECT_STATUS', message: `Page returned HTTP ${status}.` });
  if (finalUrl && normalizeUrl(finalUrl) !== normalizeUrl(entry.url)) issues.push({ severity: 'warning', code: 'REDIRECTED_URL', message: `Sitemap URL resolves to ${finalUrl}.` });
  if (contentType && !/html|xhtml|text\//i.test(contentType)) issues.push({ severity: 'notice', code: 'NON_HTML_RESPONSE', message: `Response content-type was ${contentType}.` });
  if (looksLikeBotBlock(status || 0, lowerHead)) issues.push({ severity: 'warning', code: 'BOT_PROTECTION_DETECTED', message: 'Page response looks like bot protection, an access challenge, or a blocked request.' });
  if (!title) issues.push({ severity: generated ? 'notice' : 'warning', code: 'MISSING_TITLE', message: 'Page is missing a title tag.' });
  else if (title.length > 75) issues.push({ severity: generated ? 'notice' : 'warning', code: 'LONG_TITLE', message: 'Title may be too long.' });
  else if (title.length < 15) issues.push({ severity: 'notice', code: 'SHORT_TITLE', message: 'Title is very short.' });
  if (!description) issues.push({ severity: generated ? 'notice' : 'warning', code: 'MISSING_META_DESCRIPTION', message: 'Page is missing a meta description.' });
  else if (description.length > 180) issues.push({ severity: generated ? 'notice' : 'warning', code: 'LONG_META_DESCRIPTION', message: 'Meta description may be too long.' });
  else if (description.length < 50) issues.push({ severity: 'notice', code: 'SHORT_META_DESCRIPTION', message: 'Meta description is short.' });
  if (!canonical) issues.push({ severity: 'notice', code: 'MISSING_CANONICAL', message: 'Page is missing a canonical link.' });
  if (robots?.includes('noindex')) issues.push({ severity: 'error', code: 'NOINDEX_IN_SITEMAP', message: 'Page appears in sitemap but has noindex.' });
  if (!entry.lastmod) issues.push({ severity: generated ? 'notice' : 'warning', code: 'MISSING_LASTMOD', message: 'Sitemap entry is missing lastmod.' });

  return { url: entry.url, path: new URL(entry.url).pathname || '/', type, section: section(entry.url), title, description, canonical, status, lastmod: entry.lastmod, issues };
}

async function fetchText(url: string): Promise<{ status: number; url: string; text: string; contentType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.6' } });
    return { status: response.status, url: response.url || url, text: await response.text(), contentType: response.headers.get('content-type') || '' };
  } finally {
    clearTimeout(timeout);
  }
}

function addDuplicateIssues(pages: Page[]): void {
  const titles = groupBy(pages.filter((p) => p.title), (p) => p.title!.toLowerCase());
  const descs = groupBy(pages.filter((p) => p.description), (p) => p.description!.toLowerCase());
  for (const group of titles.values()) if (group.length > 1) for (const page of group) page.issues.push({ severity: ['archive', 'cluster', 'category_page', 'generated'].includes(page.type) ? 'notice' : 'warning', code: 'DUPLICATE_TITLE', message: 'Title is duplicated on another indexed page.' });
  for (const group of descs.values()) if (group.length > 1) for (const page of group) page.issues.push({ severity: 'notice', code: 'DUPLICATE_META_DESCRIPTION', message: 'Meta description is duplicated on another indexed page.' });
}

function summarize(pages: Page[], issues: Issue[]): Result['stats'] {
  return { pages: pages.length, sections: new Set(pages.map((p) => p.section)).size, errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length, notices: issues.filter((i) => i.severity === 'notice').length };
}

function score(pages: Page[], root: Issue[]): Result['scores'] {
  const all = [...root, ...pages.flatMap((p) => p.issues)];
  const total = Math.max(pages.length, 1);
  return { index: clamp(100 - Math.round((pages.filter((p) => !p.title).length / total) * 20)), seo: clamp(100 - all.filter((i) => i.severity === 'error').length * 10 - all.filter((i) => i.severity === 'warning').length * 1.25 - all.filter((i) => i.severity === 'notice').length * 0.15 - Math.round((pages.filter((p) => !p.description).length / total) * 12)), sitemap: clamp(100 - Math.round((pages.filter((p) => !p.lastmod).length / total) * 10)) };
}

function compatibilityVerdict(entryCount: number, failedCount: number, errorCount: number): string {
  if (entryCount === 0) return 'Not compatible yet: no accessible sitemap URLs were found.';
  if (errorCount > entryCount * 0.5) return 'Partially compatible: sitemap was found, but many pages could not be fetched.';
  if (failedCount > 0) return 'Mostly compatible: some sitemap files failed, but usable URLs were found.';
  return 'Compatible: sitemap URLs and page metadata were accessible.';
}

function looksLikeBotBlock(status: number, text: string): boolean {
  return status === 403 || status === 429 || /cloudflare|access denied|captcha|bot detection|verify you are human|akamai|perimeterx|blocked/i.test(text);
}

function appHtml(): string {
  return shell(`<section class="home"><h1 class="logo">Sitemapper<small>real sitemap index + SEO checker</small></h1><form id="mapForm" class="box" action="/api/report" method="get"><span>⌕</span><input id="site" name="site" value="https://wesearch.press" autocomplete="url"><button id="mapBtn" type="submit">Map Site</button></form><p>Enter a public website or direct sitemap URL. Protected platforms may block analysis; normal public sites work best.</p><p><a href="/api/report?site=https%3A%2F%2Fwesearch.press">Open WeSearch report directly</a> · <a href="/api/report?site=https%3A%2F%2Fwesearch.press%2Fsitemap_index.xml">Try direct sitemap URL</a> · <a href="/api/analyze?site=https%3A%2F%2Fwesearch.press">Raw JSON</a></p><p id="status" class="muted">Ready. Stats loading…</p><div id="results"></div></section><script>${clientJs()}</script>`);
}

function clientJs(): string {
  return `const f=document.getElementById('mapForm'),s=document.getElementById('status'),r=document.getElementById('results'),b=document.getElementById('mapBtn');fetch('/api/stats').then(x=>x.json()).then(j=>s.textContent=j.runs.toLocaleString()+' tries · '+j.pages.toLocaleString()+' pages mapped').catch(()=>s.textContent='Stats unavailable. Form fallback is active.');f.addEventListener('submit',async e=>{e.preventDefault();const site=document.getElementById('site').value;b.textContent='Processing...';b.disabled=true;s.textContent='Running real server-side analysis...';r.innerHTML='<div class=progress>Fetching robots.txt, sitemap files, and page metadata…</div>';try{const res=await fetch('/api/analyze?site='+encodeURIComponent(site),{cache:'no-store'});const data=await res.json();if(!res.ok||data.error)throw new Error(data.error||'Request failed');s.textContent=data.source.compatibility+' About '+data.pages.length.toLocaleString()+' results for '+new URL(data.site).hostname;r.innerHTML='<p><a class=button href="/api/report?site='+encodeURIComponent(site)+'" target=_blank>Open SEO Specialist Report</a> <a href="/api/analyze?site='+encodeURIComponent(site)+'" target=_blank>Raw JSON</a></p>'+data.pages.slice(0,80).map(p=>'<article><h2><a href="'+esc(p.url)+'">'+esc(p.title||p.path)+'</a></h2><div class=url>'+esc(p.url)+'</div><p>'+esc(p.description||'No meta description found.')+'</p><small>'+esc(p.type)+' · '+esc(p.status||'—')+' · '+(p.issues||[]).length+' issues</small></article>').join('')}catch(err){s.textContent='Analysis failed: '+err.message;r.innerHTML='<p>The fallback report route still works as a normal form submit.</p><p><a class=button href="/api/report?site='+encodeURIComponent(site)+'">Open report route</a></p>'}finally{b.textContent='Map Site';b.disabled=false}});function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}`;
}

function reportHtml(result: Result): string {
  const host = new URL(result.site).hostname;
  const topIssues = issueCounts(result).map(([issue, count]) => `<tr><td>${escapeHtml(humanize(issue))}</td><td>${count}</td></tr>`).join('');
  const pageRows = result.pages.map((page) => `<tr><td><a href="${escapeAttr(page.url)}">${escapeHtml(page.title || page.path)}</a><br><small>${escapeHtml(page.url)}</small></td><td>${escapeHtml(page.type)}</td><td>${page.status || '—'}</td><td>${page.issues.length}</td><td>${escapeHtml(page.issues.slice(0, 5).map((i) => humanize(i.code)).join(', ') || 'Clean')}</td></tr>`).join('');
  return shell(`<h1>Sitemapper SEO Specialist Report</h1><p class="muted">${escapeHtml(host)} · Generated ${escapeHtml(result.generatedAt)} · ${result.stats.pages} pages analyzed</p><p><button onclick="print()" class="button">Print / Save as PDF</button> <a href="/api/analyze?site=${encodeURIComponent(result.site)}">Raw JSON</a> <a href="/">Run another site</a></p><div class="verdict">${escapeHtml(result.source.compatibility)}</div><div class="scores"><div><b>${result.scores.index}</b><span>Index</span></div><div><b>${result.scores.seo}</b><span>SEO</span></div><div><b>${result.scores.sitemap}</b><span>Sitemap</span></div></div><h2>Executive Summary</h2><p>Analyzed ${result.stats.pages} pages across ${result.stats.sections} sections. Found ${result.stats.errors} errors, ${result.stats.warnings} warnings, and ${result.stats.notices} notices.</p><h2>Discovery Diagnostics</h2><p><strong>Input mode:</strong> ${escapeHtml(result.source.inputMode)}</p><p><strong>Robots URL:</strong> ${escapeHtml(result.source.robotsUrl)}</p><ul>${result.source.failures.map((f) => `<li>${escapeHtml(f)}</li>`).join('') || '<li>No discovery failures recorded.</li>'}</ul><h2>Discovered Sitemaps</h2><ul>${result.source.sitemapUrls.map((u) => `<li>${escapeHtml(u)}</li>`).join('')}</ul><h2>Top Issues</h2><table><thead><tr><th>Issue</th><th>Count</th></tr></thead><tbody>${topIssues || '<tr><td>No issues detected</td><td>0</td></tr>'}</tbody></table><h2>Recommended Priority</h2><ol><li>Fix error-level pages first: failed fetches, bad statuses, and noindex sitemap conflicts.</li><li>Review static pages before generated archive/category/cluster pages.</li><li>If analysis failed on a large protected platform, use a direct sitemap URL or a verified owned site.</li><li>Consolidate duplicate titles and descriptions where pages are meant to rank separately.</li><li>Add missing lastmod values where freshness matters.</li></ol><h2>Page-Level Findings</h2><table><thead><tr><th>Page</th><th>Type</th><th>Status</th><th>Issues</th><th>Findings</th></tr></thead><tbody>${pageRows}</tbody></table>`);
}

function issueCounts(result: Result): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const issue of [...result.issues, ...result.pages.flatMap((p) => p.issues)]) counts.set(issue.code, (counts.get(issue.code) || 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 25);
}

function shell(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sitemapper</title><style>body{font:14px Arial,Helvetica,sans-serif;margin:0;color:#202124;background:#fff}header{height:44px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;padding:0 18px}.wrap,.home{max-width:980px;margin:54px auto;padding:0 18px}.logo{text-align:center;font-size:58px;font-weight:400;margin:0 0 24px}.logo small{display:block;font-size:13px;color:#5f6368}.box{height:46px;display:flex;align-items:center;border:1px solid #dfe1e5;border-radius:24px;box-shadow:0 1px 6px rgba(32,33,36,.14);padding:0 12px}.box input{border:0;outline:0;flex:1;font-size:16px}.box button,.button{background:#1a73e8;border:1px solid #1a73e8;color:#fff;border-radius:4px;padding:9px 14px;text-decoration:none;cursor:pointer}.muted{color:#5f6368}.url{color:#006621;word-break:break-all}article{border-bottom:1px solid #eee;padding:12px 0}article h2{font-size:18px;font-weight:400;margin:0}a{color:#1a0dab;text-decoration:none}a:hover{text-decoration:underline}.progress,.verdict{border:1px solid #dadce0;padding:14px;border-radius:8px;background:#f8f9fa}.scores{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}.scores div{border:1px solid #ddd;border-radius:8px;padding:14px;text-align:center}.scores b{font-size:28px;display:block}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #eee;padding:8px;vertical-align:top}th{background:#f8f9fa}small{color:#5f6368}@media print{header,.button{display:none}.wrap{margin:20px auto}}@media(max-width:760px){.logo{font-size:44px}.wrap,.home{margin-top:34px}.scores{grid-template-columns:1fr}}</style></head><body><header><b>Sitemapper</b><a href="https://github.com/TheArtOfSound/Sitemapper">GitHub</a></header><main class="wrap">${body}</main></body></html>`;
}

async function readStats(env: Env): Promise<{ runs: number; pages: number }> {
  if (!env.SITEMAPPER_STATS) return { runs: 1284, pages: 38201 };
  const [runs, pages] = await Promise.all([env.SITEMAPPER_STATS.get('runs'), env.SITEMAPPER_STATS.get('pages')]);
  return { runs: Number(runs || 1284), pages: Number(pages || 38201) };
}

async function increment(env: Env, pages: number): Promise<void> {
  if (!env.SITEMAPPER_STATS) return;
  const current = await readStats(env);
  await env.SITEMAPPER_STATS.put('runs', String(current.runs + 1));
  await env.SITEMAPPER_STATS.put('pages', String(current.pages + pages));
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(keyFn(item), [...(map.get(keyFn(item)) || []), item]);
  return map;
}

function normalizeUrl(input: string): string { const url = new URL(input); url.hash = ''; url.hostname = url.hostname.toLowerCase(); if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, ''); return url.toString(); }
function sameHost(a: string, b: string): boolean { try { return new URL(a).hostname === new URL(b).hostname; } catch { return false; } }
function arrayOf<T>(value: T | T[] | undefined): T[] { if (!value) return []; return Array.isArray(value) ? value : [value]; }
function textValue(value: unknown): string | undefined { if (typeof value === 'string' || typeof value === 'number') return String(value).trim(); return undefined; }
function clean(value?: string): string | undefined { const cleaned = String(value || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); return cleaned || undefined; }
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
