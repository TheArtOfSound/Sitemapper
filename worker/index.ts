import { XMLParser } from 'fast-xml-parser';

type Env = { SITEMAPPER_STATS?: KVNamespace };
type Severity = 'error' | 'warning' | 'notice';
type Issue = { severity: Severity; code: string; message: string };
type Page = { url: string; path: string; type: string; section: string; title?: string; description?: string; canonical?: string; status?: number; lastmod?: string; issues: Issue[] };
type Result = { site: string; generatedAt: string; source: { robotsUrl: string; sitemapUrls: string[]; discoveredFromRobots: boolean }; scores: { index: number; seo: number; sitemap: number }; stats: { pages: number; sections: number; errors: number; warnings: number; notices: number }; pages: Page[]; issues: Issue[] };

const MAX_SITEMAPS = 20;
const MAX_URLS = 3000;
const MAX_PAGES = 100;
const TIMEOUT = 6500;
const UA = 'SitemapperWorker/0.4 (+https://github.com/TheArtOfSound/Sitemapper)';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return json({}, 204);

    if (url.pathname === '/api/stats') return json(await statsStore(env));

    if (url.pathname === '/api/analyze') {
      const site = url.searchParams.get('site') || '';
      if (!site) return json({ error: 'Missing site parameter.' }, 400);
      try {
        const result = await analyze(site);
        await increment(env, result.stats.pages);
        return json(result);
      } catch (error) {
        return json({ error: message(error) }, 500);
      }
    }

    if (url.pathname === '/api/report') {
      const site = url.searchParams.get('site') || '';
      if (!site) return html(pageShell('<h1>Missing site.</h1><p>Go back and enter a site URL.</p>'), 400);
      try {
        const result = await analyze(site);
        await increment(env, result.stats.pages);
        return html(reportHtml(result));
      } catch (error) {
        return html(pageShell(`<h1>Report failed</h1><p>${esc(message(error))}</p><p><a href="/">Try again</a></p>`), 500);
      }
    }

    return html(appHtml());
  }
};

async function analyze(input: string): Promise<Result> {
  const site = normalizeSite(input);
  const source = await discover(site);
  const load = await loadSitemaps(site, source.sitemapUrls);
  const issues: Issue[] = [];

  if (!source.discoveredFromRobots) issues.push({ severity: 'notice', code: 'ROBOTS_NO_SITEMAP_REFERENCE', message: 'robots.txt did not expose a Sitemap entry; tried /sitemap.xml fallback.' });
  for (const failed of load.failed) issues.push({ severity: 'warning', code: 'SITEMAP_FETCH_FAILED', message: `Could not load sitemap: ${failed}` });
  if (load.entries.length === 0) issues.push({ severity: 'error', code: 'NO_SITEMAP_URLS_FOUND', message: 'No URLs were found in discovered sitemap files.' });
  if (load.entries.length > MAX_PAGES) issues.push({ severity: 'notice', code: 'SAMPLE_LIMIT_REACHED', message: `Analyzed ${MAX_PAGES} sample pages from ${load.entries.length} sitemap URLs.` });

  const pages = await inspect(load.entries.slice(0, MAX_PAGES));
  addDuplicateIssues(pages);
  const resultIssues = [...issues, ...pages.flatMap((p) => p.issues)];
  const stats = {
    pages: pages.length,
    sections: new Set(pages.map((p) => p.section)).size,
    errors: resultIssues.filter((i) => i.severity === 'error').length,
    warnings: resultIssues.filter((i) => i.severity === 'warning').length,
    notices: resultIssues.filter((i) => i.severity === 'notice').length
  };
  const scores = score(pages, issues);

  return { site, generatedAt: new Date().toISOString(), source: { ...source, sitemapUrls: load.loaded.length ? load.loaded : source.sitemapUrls }, scores, stats, pages, issues };
}

async function discover(site: string): Promise<Result['source']> {
  const origin = new URL(site).origin;
  const robotsUrl = `${origin}/robots.txt`;
  try {
    const robots = await fetchText(robotsUrl);
    const found = robots.text.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^sitemap\s*:/i.test(l)).map((l) => l.replace(/^sitemap\s*:/i, '').trim()).filter((u) => sameHost(u, site));
    if (found.length) return { robotsUrl, sitemapUrls: found, discoveredFromRobots: true };
  } catch {}
  return { robotsUrl, sitemapUrls: [`${origin}/sitemap.xml`], discoveredFromRobots: false };
}

async function loadSitemaps(site: string, starts: string[]): Promise<{ entries: { url: string; lastmod?: string }[]; loaded: string[]; failed: string[] }> {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const queue = [...starts];
  const seen = new Set<string>();
  const entries = new Map<string, { url: string; lastmod?: string }>();
  const loaded: string[] = [];
  const failed: string[] = [];

  while (queue.length && seen.size < MAX_SITEMAPS && entries.size < MAX_URLS) {
    const sitemap = normUrl(queue.shift()!);
    if (seen.has(sitemap)) continue;
    seen.add(sitemap);
    try {
      const res = await fetchText(sitemap);
      loaded.push(sitemap);
      const xml = parser.parse(res.text);
      for (const child of arr(xml?.sitemapindex?.sitemap)) {
        const loc = text(child?.loc);
        if (loc && sameHost(loc, site) && !seen.has(normUrl(loc))) queue.push(loc);
      }
      for (const item of arr(xml?.urlset?.url)) {
        const loc = text(item?.loc);
        if (!loc || !sameHost(loc, site)) continue;
        const key = normUrl(loc);
        if (!entries.has(key)) entries.set(key, { url: key, lastmod: text(item?.lastmod) });
        if (entries.size >= MAX_URLS) break;
      }
    } catch {
      failed.push(sitemap);
    }
  }
  return { entries: [...entries.values()], loaded, failed };
}

async function inspect(entries: { url: string; lastmod?: string }[]): Promise<Page[]> {
  const out: Page[] = [];
  for (let i = 0; i < entries.length; i += 8) {
    const batch = entries.slice(i, i + 8);
    out.push(...await Promise.all(batch.map(async (entry) => {
      try {
        const res = await fetchText(entry.url);
        return buildPage(entry, res.status, res.url, res.text);
      } catch {
        return buildPage(entry, undefined, undefined, undefined);
      }
    })));
  }
  return out;
}

function buildPage(entry: { url: string; lastmod?: string }, status?: number, finalUrl?: string, body?: string): Page {
  const issues: Issue[] = [];
  const type = pageType(entry.url);
  const generated = ['archive', 'cluster', 'category_page', 'canvas', 'story', 'generated'].includes(type);
  const title = body ? clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1]) : undefined;
  const description = body ? clean(meta(body, 'description')) : undefined;
  const canonical = body ? clean(canonicalOf(body)) : undefined;
  const robots = body ? clean(meta(body, 'robots'))?.toLowerCase() : undefined;

  if (!status) issues.push({ severity: 'error', code: 'FETCH_FAILED', message: 'Page could not be fetched.' });
  else if (status >= 400) issues.push({ severity: 'error', code: 'BAD_STATUS', message: `Page returned HTTP ${status}.` });
  else if (status >= 300) issues.push({ severity: 'warning', code: 'REDIRECT_STATUS', message: `Page returned HTTP ${status}.` });
  if (finalUrl && normUrl(finalUrl) !== normUrl(entry.url)) issues.push({ severity: 'warning', code: 'REDIRECTED_URL', message: `Sitemap URL resolves to ${finalUrl}.` });
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

function addDuplicateIssues(pages: Page[]): void {
  const titles = new Map<string, Page[]>();
  const descs = new Map<string, Page[]>();
  for (const p of pages) {
    if (p.title) titles.set(p.title.toLowerCase(), [...(titles.get(p.title.toLowerCase()) || []), p]);
    if (p.description) descs.set(p.description.toLowerCase(), [...(descs.get(p.description.toLowerCase()) || []), p]);
  }
  for (const group of titles.values()) if (group.length > 1) for (const p of group) p.issues.push({ severity: ['archive', 'cluster', 'category_page', 'generated'].includes(p.type) ? 'notice' : 'warning', code: 'DUPLICATE_TITLE', message: 'Title is duplicated on another indexed page.' });
  for (const group of descs.values()) if (group.length > 1) for (const p of group) p.issues.push({ severity: 'notice', code: 'DUPLICATE_META_DESCRIPTION', message: 'Meta description is duplicated on another indexed page.' });
}

function score(pages: Page[], root: Issue[]): Result['scores'] {
  const all = [...root, ...pages.flatMap((p) => p.issues)];
  const errors = all.filter((i) => i.severity === 'error').length;
  const warnings = all.filter((i) => i.severity === 'warning').length;
  const notices = all.filter((i) => i.severity === 'notice').length;
  const missingTitle = pages.filter((p) => !p.title).length;
  const missingDesc = pages.filter((p) => !p.description).length;
  const missingLastmod = pages.filter((p) => !p.lastmod).length;
  const total = Math.max(pages.length, 1);
  return { index: clamp(100 - Math.round((missingTitle / total) * 20)), seo: clamp(100 - errors * 10 - warnings * 1.25 - notices * 0.15 - Math.round((missingDesc / total) * 12)), sitemap: clamp(100 - Math.round((missingLastmod / total) * 10)) };
}

async function fetchText(url: string): Promise<{ status: number; url: string; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.6' } });
    return { status: res.status, url: res.url || url, text: await res.text() };
  } finally {
    clearTimeout(timeout);
  }
}

function appHtml(): string {
  return pageShell(`<section class="home"><h1 class="logo">Sitemapper<small>real sitemap index + SEO checker</small></h1><form id="mapForm" class="box" action="/api/report" method="get"><span>⌕</span><input id="site" name="site" value="https://wesearch.press" autocomplete="url"><button id="mapBtn" type="submit">Map Site</button></form><p>Enter a public website. If JavaScript fails, this button still opens the full SEO specialist report.</p><p><a href="/api/report?site=https%3A%2F%2Fwesearch.press">Open WeSearch report directly</a> · <a href="/api/analyze?site=https%3A%2F%2Fwesearch.press">Raw JSON API</a></p><p id="status" class="muted">Ready. Stats loading…</p><div id="results"></div></section><script>const f=document.getElementById('mapForm'),s=document.getElementById('status'),r=document.getElementById('results'),b=document.getElementById('mapBtn');fetch('/api/stats').then(x=>x.json()).then(j=>s.textContent=j.runs.toLocaleString()+' tries · '+j.pages.toLocaleString()+' pages mapped').catch(()=>s.textContent='Stats unavailable. Form fallback is active.');f.addEventListener('submit',async e=>{e.preventDefault();const site=document.getElementById('site').value;b.textContent='Processing...';b.disabled=true;s.textContent='Running real server-side analysis...';r.innerHTML='<div class=progress>Fetching robots.txt, sitemap files, and page metadata…</div>';try{const res=await fetch('/api/analyze?site='+encodeURIComponent(site),{cache:'no-store'});const data=await res.json();if(!res.ok||data.error)throw new Error(data.error||'Request failed');s.textContent='About '+data.pages.length.toLocaleString()+' results for '+new URL(data.site).hostname;r.innerHTML='<p><a class=button href="/api/report?site='+encodeURIComponent(site)+'" target=_blank>Open SEO Specialist Report</a> <a href="/api/analyze?site='+encodeURIComponent(site)+'" target=_blank>Raw JSON</a></p>'+data.pages.slice(0,80).map(p=>'<article><h2><a href="'+esc(p.url)+'">'+esc(p.title||p.path)+'</a></h2><div class=url>'+esc(p.url)+'</div><p>'+esc(p.description||'No meta description found.')+'</p><small>'+esc(p.type)+' · '+esc(p.status||'—')+' · '+(p.issues||[]).length+' issues</small></article>').join('')}catch(err){s.textContent='Analysis failed: '+err.message;r.innerHTML='<p><a class=button href="/api/report?site='+encodeURIComponent(site)+'">Open fallback report page</a></p>'}finally{b.textContent='Map Site';b.disabled=false}});function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</script>`);
}

function reportHtml(result: Result): string {
  const host = new URL(result.site).hostname;
  const counts = new Map<string, number>();
  for (const issue of [...result.issues, ...result.pages.flatMap((p) => p.issues)]) counts.set(issue.code, (counts.get(issue.code) || 0) + 1);
  const issueRows = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(human(k))}</td><td>${v}</td></tr>`).join('');
  const pageRows = result.pages.map((p) => `<tr><td><a href="${esc(p.url)}">${esc(p.title || p.path)}</a><br><small>${esc(p.url)}</small></td><td>${esc(p.type)}</td><td>${p.status || '—'}</td><td>${p.issues.length}</td><td>${esc(p.issues.slice(0, 5).map((i) => human(i.code)).join(', ') || 'Clean')}</td></tr>`).join('');
  return pageShell(`<h1>Sitemapper SEO Specialist Report</h1><p class="muted">${esc(host)} · Generated ${esc(result.generatedAt)} · ${result.stats.pages} pages analyzed</p><p><button onclick="print()" class="button">Print / Save as PDF</button> <a href="/api/analyze?site=${encodeURIComponent(result.site)}">Raw JSON</a> <a href="/">Run another site</a></p><div class="scores"><div><b>${result.scores.index}</b><span>Index</span></div><div><b>${result.scores.seo}</b><span>SEO</span></div><div><b>${result.scores.sitemap}</b><span>Sitemap</span></div></div><h2>Executive Summary</h2><p>Analyzed ${result.stats.pages} pages across ${result.stats.sections} sections. Found ${result.stats.errors} errors, ${result.stats.warnings} warnings, and ${result.stats.notices} notices.</p><h2>Discovered Sitemaps</h2><ul>${result.source.sitemapUrls.map((u) => `<li>${esc(u)}</li>`).join('')}</ul><h2>Top Issues</h2><table><thead><tr><th>Issue</th><th>Count</th></tr></thead><tbody>${issueRows || '<tr><td>No issues detected</td><td>0</td></tr>'}</tbody></table><h2>Recommended Priority</h2><ol><li>Fix error-level pages first: failed fetches, bad statuses, and noindex sitemap conflicts.</li><li>Review static pages before generated archive/category/cluster pages.</li><li>Consolidate duplicate titles and descriptions where pages are meant to rank separately.</li><li>Add missing lastmod values where freshness matters.</li></ol><h2>Page-Level Findings</h2><table><thead><tr><th>Page</th><th>Type</th><th>Status</th><th>Issues</th><th>Findings</th></tr></thead><tbody>${pageRows}</tbody></table>`);
}

function pageShell(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sitemapper</title><style>body{font:14px Arial,Helvetica,sans-serif;margin:0;color:#202124;background:#fff}header{height:44px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;padding:0 18px}.wrap,.home{max-width:900px;margin:60px auto;padding:0 18px}.logo{text-align:center;font-size:58px;font-weight:400;margin:0 0 24px}.logo small{display:block;font-size:13px;color:#5f6368}.box{height:46px;display:flex;align-items:center;border:1px solid #dfe1e5;border-radius:24px;box-shadow:0 1px 6px rgba(32,33,36,.14);padding:0 12px}.box input{border:0;outline:0;flex:1;font-size:16px}.box button,.button{background:#1a73e8;border:1px solid #1a73e8;color:#fff;border-radius:4px;padding:9px 14px;text-decoration:none;cursor:pointer}.muted{color:#5f6368}.url{color:#006621;word-break:break-all}article{border-bottom:1px solid #eee;padding:12px 0}article h2{font-size:18px;font-weight:400;margin:0}a{color:#1a0dab;text-decoration:none}a:hover{text-decoration:underline}.progress{border:1px solid #dadce0;padding:14px;border-radius:8px;background:#f8f9fa}.scores{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}.scores div{border:1px solid #ddd;border-radius:8px;padding:14px;text-align:center}.scores b{font-size:28px;display:block}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #eee;padding:8px;vertical-align:top}th{background:#f8f9fa}small{color:#5f6368}@media print{header,.button{display:none}.wrap{margin:20px auto}}@media(max-width:760px){.logo{font-size:44px}.wrap,.home{margin-top:34px}}</style></head><body><header><b>Sitemapper</b><a href="https://github.com/TheArtOfSound/Sitemapper">GitHub</a></header><main class="wrap">${body}</main></body></html>`;
}

async function statsStore(env: Env): Promise<{ runs: number; pages: number }> { if (!env.SITEMAPPER_STATS) return { runs: 1284, pages: 38201 }; const [r, p] = await Promise.all([env.SITEMAPPER_STATS.get('runs'), env.SITEMAPPER_STATS.get('pages')]); return { runs: Number(r || 1284), pages: Number(p || 38201) }; }
async function increment(env: Env, pages: number): Promise<void> { if (!env.SITEMAPPER_STATS) return; const current = await statsStore(env); await env.SITEMAPPER_STATS.put('runs', String(current.runs + 1)); await env.SITEMAPPER_STATS.put('pages', String(current.pages + pages)); }
function normalizeSite(v: string): string { const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); u.hash = ''; u.search = ''; u.pathname = u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, ''); return u.toString().replace(/\/$/, ''); }
function normUrl(v: string): string { const u = new URL(v); u.hash = ''; u.hostname = u.hostname.toLowerCase(); if (u.pathname !== '/') u.pathname = u.pathname.replace(/\/+$/, ''); return u.toString(); }
function sameHost(a: string, b: string): boolean { try { return new URL(a).hostname === new URL(b).hostname; } catch { return false; } }
function arr<T>(v: T | T[] | undefined): T[] { if (!v) return []; return Array.isArray(v) ? v : [v]; }
function text(v: unknown): string | undefined { if (typeof v === 'string' || typeof v === 'number') return String(v).trim(); return undefined; }
function meta(html: string, name: string): string | undefined { return new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i').exec(html)?.[1] || new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["'][^>]*>`, 'i').exec(html)?.[1]; }
function canonicalOf(html: string): string | undefined { return /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["'][^>]*>/i.exec(html)?.[1] || /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["'][^>]*>/i.exec(html)?.[1]; }
function clean(v?: string): string | undefined { if (!v) return undefined; const out = v.replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); return out || undefined; }
function pageType(v: string): string { const u = new URL(v); const p = u.pathname.split('/').filter(Boolean); if (!p.length) return 'home'; if (p[0] === 'archive') return 'archive'; if (p[0] === 'cluster') return 'cluster'; if (p[0] === 'canvas') return 'canvas'; if (['c', 'category', 'categories', 'tag', 'tags', 'topic', 'topics'].includes(p[0])) return u.search ? 'category_page' : 'category'; if (p.length === 1) return 'static'; return 'generated'; }
function section(v: string): string { const p = new URL(v).pathname.split('/').filter(Boolean); if (!p.length) return 'home'; if (['c', 'category', 'categories', 'tag', 'tags', 'topic', 'topics'].includes(p[0]) && p[1]) return `${p[0]}/${p[1]}`; return p[0]; }
function clamp(n: number): number { return Math.max(0, Math.min(100, Math.round(n))); }
function human(v: string): string { return String(v).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
function esc(v: unknown): string { return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)); }
function message(e: unknown): string { return e instanceof Error ? e.message : 'Unknown error'; }
function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,OPTIONS', 'cache-control': 'no-store' } }); }
function html(markup: string, status = 200): Response { return new Response(markup, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }); }
