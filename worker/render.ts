/**
 * Step-by-step survey UI — simple flow, blueprint ink, no SaaS card spam.
 */

import { ISSUE_CATALOG, issuePath } from '../src/issues/catalog.js';
import type { FreshnessBucket, Insights, SectionStat } from './insights.js';
import { flattenLattice, recommendations } from './insights.js';
import { buildAgentPack, type AgentPack } from './agent-pack.js';

const ISSUE_PATHS = ISSUE_CATALOG.map((row) => issuePath(row.code));

export type Severity = 'error' | 'warning' | 'notice';
export type Issue = { severity: Severity; code: string; message: string; evidence?: string };
export type Page = {
  url: string;
  path: string;
  type: string;
  section: string;
  deepChecked: boolean;
  title?: string;
  description?: string;
  canonical?: string;
  status?: number;
  redirects?: number;
  lastmod?: string;
  ogTitle?: string;
  ogImage?: boolean;
  hasSchema?: boolean;
  hreflangCount?: number;
  issues: Issue[];
};
export type Source = {
  robotsUrl: string;
  sitemapUrls: string[];
  discoveredFromRobots: boolean;
  inputMode: 'site' | 'sitemap';
  testedUrls: string[];
  failures: string[];
  compatibility: string;
  discoveredUrlCount: number;
  deepCheckedCount: number;
};
export type Result = {
  site: string;
  generatedAt: string;
  source: Source;
  scores: { index: number; seo: number; sitemap: number };
  stats: { pages: number; sections: number; errors: number; warnings: number; notices: number };
  pages: Page[];
  issues: Issue[];
  insights: Insights;
};

const MAX_REPORT_ROWS = 300;
const ORIGIN = 'https://sitemapper.oortstack.com';

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char)
  );
}

export function humanize(code: string): string {
  return code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function css(): string {
  return `
:root{
  --bg:#0b1220;
  --panel:#111b2e;
  --line:#2a3f5c;
  --text:#e8eef6;
  --mute:#8aa0b8;
  --accent:#5ec8ff;
  --ok:#3dcaa0;
  --warn:#f0b429;
  --bad:#ff6b5a;
  --mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;
  --sans:"IBM Plex Sans","Segoe UI",system-ui,sans-serif;
  --serif:"Source Serif 4",Georgia,serif;
}
*{box-sizing:border-box}
body{
  margin:0;min-height:100vh;color:var(--text);
  font:16px/1.5 var(--sans);background:var(--bg);
}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:3px}
.wrap{max-width:720px;margin:0 auto;padding:28px 18px 72px}
.top{
  display:flex;align-items:center;justify-content:space-between;gap:12px;
  margin-bottom:28px;padding-bottom:14px;border-bottom:1px solid var(--line);
}
.brand{display:flex;align-items:center;gap:10px;color:inherit;text-decoration:none;font-weight:600}
.brand:hover{text-decoration:none}
.mark{
  width:32px;height:32px;border:1px solid var(--accent);display:grid;place-items:center;
  font:700 11px/1 var(--mono);color:var(--accent);
}
.nav{display:flex;gap:14px;flex-wrap:wrap;font:12px/1 var(--mono);text-transform:uppercase;letter-spacing:.06em}
.nav a{color:var(--mute)}
.nav a:hover{color:var(--accent)}

/* Step rail */
.steps{
  display:flex;gap:0;margin:0 0 28px;padding:0;list-style:none;
  border:1px solid var(--line);background:var(--panel);overflow:hidden;
}
.steps li{
  flex:1;padding:12px 10px;text-align:center;font:11px/1.25 var(--mono);
  letter-spacing:.06em;text-transform:uppercase;color:var(--mute);
  border-right:1px solid var(--line);position:relative;
}
.steps li:last-child{border-right:0}
.steps li b{display:block;font-size:13px;color:var(--text);margin-bottom:4px;letter-spacing:0;text-transform:none;font-family:var(--sans)}
.steps li.on{background:rgba(94,200,255,.08);color:var(--accent)}
.steps li.on b{color:var(--accent)}
.steps li.done{color:var(--ok)}
.steps li.done b{color:var(--ok)}

h1{font:600 clamp(1.6rem,4vw,2.1rem)/1.2 var(--serif);margin:0 0 10px;letter-spacing:-.02em}
.lede{color:var(--mute);margin:0 0 22px;font-size:1.02rem}
.kicker{font:12px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ok);margin:0 0 10px}

.card{
  border:1px solid var(--line);background:var(--panel);padding:22px 20px;margin-bottom:18px;
}
.card h2{
  margin:0 0 12px;font:600 1.05rem/1.3 var(--sans);
}
.card h2 .n{
  display:inline-flex;align-items:center;justify-content:center;
  width:1.5rem;height:1.5rem;margin-right:8px;
  border:1px solid var(--accent);color:var(--accent);
  font:600 12px/1 var(--mono);vertical-align:middle;
}
.card p{margin:0 0 12px;color:var(--mute)}
.card p:last-child{margin-bottom:0}

.form-row{display:grid;grid-template-columns:1fr auto;gap:0;border:1px solid var(--line)}
.form-row input{
  border:0;background:var(--bg);color:var(--text);padding:14px 14px;
  font:15px/1.3 var(--mono);outline:none;min-width:0;
}
.form-row input::placeholder{color:#5a7088}
.form-row button{
  border:0;border-left:1px solid var(--line);background:var(--accent);color:#041018;
  font:700 12px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;
  padding:0 18px;cursor:pointer;
}
.form-row button:hover{filter:brightness(1.06)}
.form-row button:disabled{opacity:.6;cursor:wait}
.hint{margin-top:10px;font:12px/1.4 var(--mono);color:var(--mute)}

.demos{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.chip{
  display:inline-block;border:1px solid var(--line);padding:8px 10px;
  font:11px/1 var(--mono);color:var(--mute);text-decoration:none;
  background:var(--bg);
}
.chip:hover{border-color:var(--accent);color:var(--accent);text-decoration:none}

.scores{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}
.score{
  border:1px solid var(--line);background:var(--bg);padding:14px;text-align:center;
}
.score b{display:block;font:700 1.8rem/1 var(--mono);color:var(--accent)}
.score span{display:block;margin-top:6px;font:10px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--mute)}

.verdict{border-left:3px solid var(--accent);padding:4px 0 4px 14px;margin:8px 0 0}
.verdict strong{display:block;color:var(--text);font-size:1.05rem;margin-bottom:6px}
.fp{
  display:inline-block;margin-top:12px;font:12px/1.4 var(--mono);color:var(--ok);
  border:1px dashed rgba(61,202,160,.4);padding:6px 10px;
}

.list{list-style:none;margin:0;padding:0}
.list li{
  padding:12px 0;border-bottom:1px solid var(--line);color:var(--mute);
}
.list li:last-child{border-bottom:0}
.list li strong{display:block;color:var(--text);margin-bottom:4px}
.list .proof{font:12px/1.4 var(--mono);color:#6d849c;margin-top:6px}
.prio{font:10px/1 var(--mono);letter-spacing:.08em;color:var(--warn);margin-right:6px}
.prio.p1{color:var(--bad)}
.prio.p3{color:var(--ok)}

.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.btn{
  display:inline-flex;align-items:center;gap:6px;
  border:1px solid var(--line);background:var(--bg);color:var(--text);
  font:11px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;
  padding:11px 13px;cursor:pointer;text-decoration:none;
}
.btn:hover{border-color:var(--accent);color:var(--accent);text-decoration:none}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#041018;font-weight:700}
.btn.primary:hover{filter:brightness(1.05);color:#041018}

details.block{
  border:1px solid var(--line);background:var(--panel);margin-bottom:12px;
}
details.block > summary{
  cursor:pointer;padding:14px 16px;font:600 14px/1.3 var(--sans);list-style:none;
  display:flex;justify-content:space-between;align-items:center;gap:10px;
}
details.block > summary::-webkit-details-marker{display:none}
details.block > summary::after{content:"+";font:600 16px/1 var(--mono);color:var(--mute)}
details.block[open] > summary::after{content:"–"}
details.block .inner{padding:0 16px 16px;border-top:1px solid var(--line)}
details.block .inner > :first-child{margin-top:14px}

table.data{width:100%;border-collapse:collapse;font-size:13px}
table.data th,table.data td{
  text-align:left;padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top;
}
table.data th{font:11px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
table.data small{color:var(--mute);font:11px/1.35 var(--mono);word-break:break-all}
.badge{
  display:inline-block;font:10px/1 var(--mono);padding:3px 6px;border:1px solid var(--line);color:var(--mute);
}
.badge.deep{color:var(--ok);border-color:rgba(61,202,160,.45)}

.bar-row{display:grid;grid-template-columns:1fr 48px;gap:8px;align-items:center;margin:6px 0;font:12px/1.3 var(--mono)}
.bar{height:6px;background:#1a283c;overflow:hidden}
.bar > i{display:block;height:100%;background:var(--accent)}

.fresh{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.fresh div{border:1px solid var(--line);background:var(--bg);padding:10px;text-align:center}
.fresh b{display:block;font:700 1.15rem/1 var(--mono)}
.fresh span{display:block;margin-top:4px;font:10px/1.2 var(--mono);color:var(--mute);text-transform:uppercase}

.pack-grid{display:grid;gap:8px}
.pack-file{
  display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;
  border:1px solid var(--line);background:var(--bg);padding:10px 12px;
}
.pack-file code{font:12px/1.3 var(--mono);color:var(--accent)}
.pack-file small{display:block;color:var(--mute);font-size:12px;margin-top:3px}
.copy-ok{color:var(--ok)!important}

.loading{
  display:none;position:fixed;inset:0;background:rgba(7,12,20,.88);z-index:40;
  place-items:center;padding:20px;
}
.loading.on{display:grid}
.loading .box{
  max-width:360px;width:100%;border:1px solid var(--line);background:var(--panel);padding:24px;text-align:center;
}
.loading .pulse{
  width:48px;height:48px;margin:0 auto 14px;border:2px solid var(--line);
  border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;
}
@keyframes spin{to{transform:rotate(360deg)}}
.loading strong{display:block;margin-bottom:6px;font:600 1.05rem/1.3 var(--serif)}
.loading p{margin:0;font:12px/1.4 var(--mono);color:var(--mute);text-transform:uppercase;letter-spacing:.06em}

.flow-note{
  font:12px/1.45 var(--mono);color:var(--mute);margin:0 0 18px;padding:10px 12px;
  border:1px solid var(--line);background:rgba(94,200,255,.04);
}

.footer{
  margin-top:40px;padding-top:16px;border-top:1px solid var(--line);
  font:12px/1.5 var(--mono);color:var(--mute);
  display:flex;flex-wrap:wrap;gap:10px 18px;justify-content:space-between;
}
.footer a{color:var(--mute)}
.footer a:hover{color:var(--accent)}

.prose h1{margin-top:0}
.prose h2{font:600 1.1rem/1.3 var(--sans);margin:1.6em 0 .5em}
.prose p,.prose li{color:var(--mute)}
.prose code{font-family:var(--mono);font-size:.9em;color:var(--accent)}

.filter{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.filter input,.filter select{
  background:var(--bg);border:1px solid var(--line);color:var(--text);
  font:12px/1 var(--mono);padding:9px 10px;outline:none;
}
.table-wrap{overflow:auto;max-height:420px;border:1px solid var(--line)}

@media(max-width:560px){
  .steps li{font-size:10px;padding:10px 6px}
  .scores{grid-template-columns:1fr}
  .form-row{grid-template-columns:1fr}
  .form-row button{border-left:0;border-top:1px solid var(--line);padding:14px}
}
@media print{
  .top .nav,.actions,.loading,.filter,details.block:not([open]){display:none!important}
  body{background:#fff;color:#111}
  .card,details.block,.score,.pack-file{background:#fff;border-color:#ccc}
  a{color:#06c}
}
`;
}

function fonts(): string {
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@400;600&family=Source+Serif+4:opsz,wght@8..60,600&display=swap" rel="stylesheet">`;
}

export function shell(opts: {
  title: string;
  description: string;
  body: string;
  path?: string;
  jsonLd?: unknown[];
  noindex?: boolean;
  activeStep?: number;
}): string {
  const path = opts.path || '/';
  const canonical = `${ORIGIN}${path === '/' ? '' : path}`;
  const jsonLd = (opts.jsonLd || [])
    .map((block) => `<script type="application/ld+json">${JSON.stringify(block).replace(/</g, '\\u003c')}</script>`)
    .join('');
  const robots = opts.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeHtml(opts.description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Sitemapper">
<meta property="og:title" content="${escapeHtml(opts.title)}">
<meta property="og:description" content="${escapeHtml(opts.description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(opts.title)}">
<meta name="twitter:description" content="${escapeHtml(opts.description)}">
<meta name="theme-color" content="#0b1220">
${fonts()}
<style>${css()}</style>
${jsonLd}
</head>
<body>
<div class="loading" id="loading" aria-live="polite">
  <div class="box">
    <div class="pulse" aria-hidden="true"></div>
    <strong>Step 2 — Surveying</strong>
    <p>robots · sitemaps · sample pages</p>
  </div>
</div>
<div class="wrap">
  <header class="top">
    <a class="brand" href="/"><span class="mark">SP</span> Sitemapper</a>
    <nav class="nav" aria-label="Primary">
      <a href="/">Map</a>
      <a href="/about">About</a>
      <a href="/compare">Compare</a>
      <a href="/guides/xml-sitemap-checker">Guides</a>
      <a href="/tools/sitemap-checker">Tools</a>
      <a href="/pricing">Pricing</a>
      <a href="/login">Sign in</a>
    </nav>
  </header>
  ${opts.body}
  <footer class="footer">
    <span>Free public survey · <a href="https://oortstack.com">Oortstack</a></span>
    <span>
      <a href="/robots.txt">robots</a> ·
      <a href="/sitemap.xml">sitemap</a> ·
      <a href="/llms.txt">llms.txt</a> ·
      <a href="/api/stats">stats</a>
    </span>
  </footer>
</div>
<script>
(function(){
  var form=document.getElementById('map-form');
  var loading=document.getElementById('loading');
  if(form&&loading){
    form.addEventListener('submit',function(){
      var btn=form.querySelector('button');
      if(btn){btn.disabled=true;btn.textContent='Working…';}
      loading.classList.add('on');
    });
  }
  document.querySelectorAll('[data-copy]').forEach(function(btn){
    btn.addEventListener('click',function(){
      var id=btn.getAttribute('data-copy');
      var el=document.getElementById(id);
      if(!el) return;
      var text=el.textContent||'';
      navigator.clipboard.writeText(text).then(function(){
        var old=btn.textContent;
        btn.textContent='Copied';
        btn.classList.add('copy-ok');
        setTimeout(function(){btn.textContent=old;btn.classList.remove('copy-ok');},1400);
      });
    });
  });
  var q=document.getElementById('inv-q');
  var mode=document.getElementById('inv-mode');
  var rows=document.querySelectorAll('[data-inv-row]');
  function filter(){
    var term=(q&&q.value||'').toLowerCase();
    var m=mode&&mode.value||'all';
    rows.forEach(function(row){
      var hay=row.getAttribute('data-hay')||'';
      var deep=row.getAttribute('data-deep')==='1';
      var ok=(!term||hay.indexOf(term)!==-1)&&(m==='all'||(m==='deep'&&deep)||(m==='index'&&!deep));
      row.style.display=ok?'':'none';
    });
  }
  if(q) q.addEventListener('input',filter);
  if(mode) mode.addEventListener('change',filter);
})();
</script>
</body>
</html>`;
}

function stepRail(active: 1 | 2 | 3): string {
  const cls = (n: number) => (n < active ? 'done' : n === active ? 'on' : '');
  return `<ol class="steps" aria-label="Survey steps">
    <li class="${cls(1)}"><b>1 · Enter URL</b>Site or sitemap</li>
    <li class="${cls(2)}"><b>2 · Survey</b>Discover + sample</li>
    <li class="${cls(3)}"><b>3 · Results</b>Fix + export</li>
  </ol>`;
}

export function homeHtml(stats: { runs: number; pages: number }): string {
  const body = `
${stepRail(1)}
<p class="kicker">Three steps · no account</p>
<h1>Map a public sitemap.</h1>
<p class="lede">Enter a site. We read robots.txt and XML sitemaps, sample pages, then hand you fixes — and a pack your coding agent can open.</p>

<div class="card" id="map">
  <h2><span class="n">1</span>Paste a URL</h2>
  <p>Homepage or a direct <code style="font-family:var(--mono);color:var(--accent)">sitemap.xml</code> link.</p>
  <form class="form-row" id="map-form" action="/api/report" method="get" role="search">
    <label class="visually-hidden" for="site" style="position:absolute;clip:rect(0,0,0,0);width:1px;height:1px;overflow:hidden">Site URL</label>
    <input id="site" name="site" type="url" inputmode="url" autocomplete="url" required
      placeholder="https://example.com">
    <button type="submit">Start survey</button>
  </form>
  <p class="hint">Caps: 1,200 URLs · 40 deep checks · saved share link lasts 30 days · ${stats.runs.toLocaleString()} surveys · ${stats.pages.toLocaleString()} URLs indexed</p>
  <div class="demos">
    <a class="chip" href="/api/report?site=https%3A%2F%2Fwesearch.press">Demo: WeSearch</a>
    <a class="chip" href="/api/report?site=https%3A%2F%2Fimagineqira.com">Demo: thin sitemap</a>
    <a class="chip" href="/compare">Why different</a>
  </div>
</div>

<div class="card">
  <h2><span class="n">2</span>What happens next</h2>
  <ol class="list" style="list-style:decimal;padding-left:1.2em">
    <li style="border:0;padding:6px 0"><strong style="display:inline">Discover</strong> — robots + sitemap indexes</li>
    <li style="border:0;padding:6px 0"><strong style="display:inline">Sample</strong> — titles, meta, canonicals, robots conflicts</li>
    <li style="border:0;padding:6px 0"><strong style="display:inline">Export</strong> — agent pack (AGENTS.md, tasks, inventory)</li>
  </ol>
</div>
`;

  return shell({
    title: 'Sitemapper — Map a sitemap in 3 steps',
    description:
      'Free step-by-step XML sitemap survey: discover URLs, get fix list, export an AI coding agent pack. No account.',
    body,
    path: '/',
    activeStep: 1,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Sitemapper',
        url: ORIGIN,
        applicationCategory: 'BrowserApplication',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        description: 'Step-by-step public sitemap survey with AI agent export packs.',
      },
    ],
  });
}

export function reportHtml(
  result: Result,
  opts?: { shareId?: string; expiresAt?: string; createdAt?: string }
): string {
  const host = safeHost(result.site);
  const shareId = opts?.shareId;
  const base = shareId ? `/r/${shareId}` : null;
  const packHref = base ? `${base}/pack` : `/api/agent-pack?site=${encodeURIComponent(result.site)}`;
  const packMdHref = base ? `${base}/pack?format=md` : `/api/agent-pack?site=${encodeURIComponent(result.site)}&format=md`;
  const packFlatHref = base
    ? `${base}/pack?format=flat`
    : `/api/agent-pack?site=${encodeURIComponent(result.site)}&format=flat`;
  const csvHref = base ? `${base}/csv` : `/api/csv?site=${encodeURIComponent(result.site)}`;
  const jsonHref = base ? `${base}/json` : `/api/analyze?site=${encodeURIComponent(result.site)}`;
  const shareUrl = shareId ? `${ORIGIN}/r/${shareId}` : '';

  const pack = buildAgentPack(result);
  const recs = recommendations(result);
  const flat = flattenLattice(result.insights.lattice, 24);
  const maxL = Math.max(...flat.map((r) => r.count), 1);
  const topIssues = issueRows(result);

  const recList = recs
    .map(
      (r) => `<li>
      <strong><span class="prio p${r.priority}">P${r.priority}</span>${escapeHtml(r.title)}</strong>
      ${escapeHtml(r.why)}
      <div class="proof">Proof: ${escapeHtml(r.proof)}</div>
    </li>`
    )
    .join('');

  const lattice = flat
    .map((row) => {
      const pct = Math.round((row.count / maxL) * 100);
      return `<div class="bar-row"><span>${escapeHtml(row.path)} <span style="color:var(--mute)">×${row.count}</span></span><div class="bar"><i style="width:${pct}%"></i></div></div>`;
    })
    .join('');

  const fresh = result.insights.freshness
    .map((b: FreshnessBucket) => `<div><b>${b.count}</b><span>${escapeHtml(b.label)}</span></div>`)
    .join('');

  const sections = result.insights.sections
    .slice(0, 12)
    .map(
      (s: SectionStat) =>
        `<tr><td>${escapeHtml(s.section)}</td><td>${s.count}</td><td>${Math.round(s.share * 100)}%</td></tr>`
    )
    .join('');

  const inv = result.pages
    .slice(0, MAX_REPORT_ROWS)
    .map((page) => {
      const findings = page.issues
        .filter((i) => i.code !== 'INDEX_ONLY_NOT_FETCHED')
        .slice(0, 4)
        .map((i) => humanize(i.code))
        .join(', ');
      const hay = `${page.title || ''} ${page.url} ${findings}`.toLowerCase();
      return `<tr data-inv-row data-deep="${page.deepChecked ? '1' : '0'}" data-hay="${escapeHtml(hay)}">
        <td><a href="${escapeHtml(page.url)}">${escapeHtml(page.title || page.path)}</a><br><small>${escapeHtml(page.url)}</small></td>
        <td><span class="badge ${page.deepChecked ? 'deep' : ''}">${page.deepChecked ? 'Deep' : 'Index'}</span></td>
        <td>${page.status ?? '—'}</td>
        <td><small>${escapeHtml(findings || 'Clean')}</small></td>
      </tr>`;
    })
    .join('');

  const packFiles = pack.files
    .map((f, i) => {
      const id = `pack-file-${i}`;
      return `<div class="pack-file">
        <div>
          <code>${escapeHtml(f.path)}</code>
          <small>${escapeHtml(f.description)}</small>
          <pre id="${id}" style="position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden">${escapeHtml(f.content)}</pre>
        </div>
        <button type="button" class="btn" data-copy="${id}">Copy</button>
      </div>`;
    })
    .join('');

  // hidden full pack JSON for one-click copy
  const packJsonId = 'pack-json-full';
  const packJson = escapeHtml(JSON.stringify(pack, null, 2));

  const shareCard = shareId
    ? `<div class="card">
  <h2><span class="n">★</span>Share this survey</h2>
  <p>Saved snapshot — opening this link or downloading packs does <strong style="color:var(--text)">not</strong> re-crawl the site.</p>
  <div class="form-row" style="margin-top:10px">
    <input id="share-url" type="text" readonly value="${escapeHtml(shareUrl)}" aria-label="Share URL">
    <button type="button" data-copy="share-url-text">Copy link</button>
  </div>
  <pre id="share-url-text" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">${escapeHtml(shareUrl)}</pre>
  <p class="hint">ID <code style="color:var(--accent)">${escapeHtml(shareId)}</code>${
        opts?.expiresAt ? ` · expires ${escapeHtml(opts.expiresAt.slice(0, 10))}` : ' · kept 30 days'
      } · pack/json/csv all use this snapshot</p>
</div>`
    : `<div class="card">
  <h2><span class="n">★</span>Share link unavailable</h2>
  <p>This run was not saved to storage (KV missing). Exports below re-run a live survey.</p>
</div>`;

  const body = `
${stepRail(3)}
<p class="kicker">Step 3 · Results for ${escapeHtml(host)}${shareId ? ` · /r/${escapeHtml(shareId)}` : ''}</p>
<h1>Survey complete</h1>
<p class="lede">${escapeHtml(result.source.discoveredUrlCount.toLocaleString())} URLs indexed · ${result.source.deepCheckedCount} deep-checked · ${escapeHtml(result.generatedAt)}</p>

${shareCard}

<div class="card">
  <h2><span class="n">⏱</span>Monitor this site</h2>
  <p>The free survey is a snapshot. Monitoring diffs DECLARED sitemap URLs against LIVE fetch state after deploys — removed URLs, new noindex, canonical changes, 404s — and keeps the evidence.</p>
  <form method="get" action="/app/sites/new" class="form-row" style="margin-top:10px">
    <input type="hidden" name="site" value="${escapeHtml(result.site)}">
    ${shareId ? `<input type="hidden" name="share" value="${escapeHtml(shareId)}">` : ''}
    <input type="text" value="${escapeHtml(host)}" readonly aria-label="Host">
    <button type="submit">Monitor this site</button>
  </form>
  <p class="hint">Creates an account if you do not have one. Google index state stays <strong style="color:var(--text)">unknown</strong> until Search Console is connected. HTTP 200 is not indexing.</p>
</div>

<div class="card">
  <h2><span class="n">1</span>Verdict</h2>
  <div class="verdict">
    <strong>${escapeHtml(result.source.compatibility)}</strong>
    <span style="color:var(--mute)">${escapeHtml(siteSummary(result))}</span>
  </div>
  <div class="scores">
    <div class="score"><b>${result.scores.index}</b><span>Index</span></div>
    <div class="score"><b>${result.scores.seo}</b><span>SEO</span></div>
    <div class="score"><b>${result.scores.sitemap}</b><span>Sitemap</span></div>
  </div>
  <div class="fp">Fingerprint ${escapeHtml(result.insights.fingerprint)} · ${escapeHtml(result.insights.structuralSignature)}</div>
</div>

<div class="card">
  <h2><span class="n">2</span>What to fix first</h2>
  <p>Ordered by priority. Each line includes proof from this run.</p>
  <ul class="list">${recList || '<li>No critical recommendations — keep monitoring.</li>'}</ul>
</div>

<div class="card">
  <h2><span class="n">3</span>Export for AI coding agents</h2>
  <p>Drop these files into a repo (Cursor, Claude Code, Codex, Grok, …).${
    shareId
      ? ' Downloads use the <strong style="color:var(--text)">saved snapshot</strong> — no re-crawl.'
      : ' The agent gets tasks, inventory, and a fix prompt.'
  }</p>
  <div class="actions">
    <a class="btn primary" href="${packHref}">Download pack JSON</a>
    <a class="btn" href="${packMdHref}">Download as Markdown</a>
    <a class="btn" href="${packFlatHref}">All files flat text</a>
    <button type="button" class="btn" data-copy="${packJsonId}">Copy full pack</button>
    <a class="btn" href="${csvHref}">CSV</a>
    <a class="btn" href="${jsonHref}">Raw JSON</a>
  </div>
  <pre id="${packJsonId}" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">${packJson}</pre>
  <p class="hint" style="margin-top:14px">How to use: merge <code style="color:var(--accent)">AGENTS.md</code> into the project · add the Cursor rule · paste <code style="color:var(--accent)">FIX_PROMPT.md</code> into your agent.</p>
  <div class="pack-grid" style="margin-top:14px">${packFiles}</div>
</div>

<details class="block">
  <summary>Step 4 · Structure <span style="color:var(--mute);font-weight:400">lattice · freshness · sections</span></summary>
  <div class="inner">
    <p style="color:var(--mute);margin:0 0 10px">Path lattice (depth ${result.insights.latticeDepth}, breadth ${result.insights.latticeBreadth})</p>
    ${lattice || '<p style="color:var(--mute)">No paths</p>'}
    <p style="color:var(--mute);margin:18px 0 10px">Freshness decay · coverage ${result.insights.freshnessCoverage}%</p>
    <div class="fresh">${fresh}</div>
    <p style="color:var(--mute);margin:18px 0 10px">Top sections</p>
    <div class="table-wrap" style="max-height:240px">
      <table class="data"><thead><tr><th>Section</th><th>URLs</th><th>Share</th></tr></thead><tbody>${sections}</tbody></table>
    </div>
    <p style="color:var(--mute);margin:18px 0 8px">Proof ledger</p>
    <ol style="color:var(--mute);padding-left:1.2em">${result.insights.proof.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ol>
  </div>
</details>

<details class="block">
  <summary>Step 5 · Issue codes <span style="color:var(--mute);font-weight:400">${result.stats.errors}E / ${result.stats.warnings}W / ${result.stats.notices}N</span></summary>
  <div class="inner">
    <div class="table-wrap" style="max-height:280px">
      <table class="data"><thead><tr><th>Code</th><th>Count</th></tr></thead>
      <tbody>${topIssues || '<tr><td>None</td><td>0</td></tr>'}</tbody></table>
    </div>
    <p style="color:var(--mute);margin:12px 0 0;font:12px/1.4 var(--mono)">Robots: ${escapeHtml(result.source.robotsUrl)} · From robots: ${result.source.discoveredFromRobots ? 'yes' : 'no'}</p>
  </div>
</details>

<details class="block">
  <summary>Step 6 · URL inventory <span style="color:var(--mute);font-weight:400">${Math.min(result.pages.length, MAX_REPORT_ROWS)} shown</span></summary>
  <div class="inner">
    <div class="filter">
      <input id="inv-q" type="search" placeholder="Filter…" aria-label="Filter">
      <select id="inv-mode" aria-label="Mode">
        <option value="all">All</option>
        <option value="deep">Deep only</option>
        <option value="index">Index only</option>
      </select>
    </div>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>Page</th><th>Mode</th><th>Status</th><th>Findings</th></tr></thead>
        <tbody>${inv}</tbody>
      </table>
    </div>
  </div>
</details>

<div class="actions">
  <a class="btn primary" href="/">New survey</a>
  <button class="btn" type="button" onclick="print()">Print / PDF</button>
</div>
`;

  return shell({
    title: `${host} · Sitemapper results`,
    description: `Sitemap survey for ${host}: Index ${result.scores.index}, SEO ${result.scores.seo}, Sitemap ${result.scores.sitemap}. Fingerprint ${result.insights.fingerprint}.`,
    body,
    path: shareId ? `/r/${shareId}` : '/api/report',
    noindex: true,
    activeStep: 3,
  });
}

export function agentPackPageHtml(
  result: Result,
  pack: AgentPack,
  opts?: { shareId?: string }
): string {
  const host = safeHost(result.site);
  const shareId = opts?.shareId;
  const base = shareId ? `/r/${shareId}` : null;
  const packHref = base ? `${base}/pack` : `/api/agent-pack?site=${encodeURIComponent(result.site)}`;
  const packMdHref = base ? `${base}/pack?format=md` : `/api/agent-pack?site=${encodeURIComponent(result.site)}&format=md`;
  const packFlatHref = base
    ? `${base}/pack?format=flat`
    : `/api/agent-pack?site=${encodeURIComponent(result.site)}&format=flat`;
  const backHref = base ? base : `/api/report?site=${encodeURIComponent(result.site)}`;
  const body = `
${stepRail(3)}
<p class="kicker">Agent pack · ${escapeHtml(host)}${shareId ? ` · saved /r/${escapeHtml(shareId)}` : ''}</p>
<h1>Exportable package for coding agents</h1>
<p class="lede">${pack.files.length} files · fingerprint ${escapeHtml(pack.fingerprint)} · ${pack.summary.taskCount} tasks${
    shareId ? ' · from saved snapshot (no re-crawl)' : ''
  }</p>
<div class="card">
  <h2>Downloads</h2>
  <div class="actions">
    <a class="btn primary" href="${packHref}">JSON pack</a>
    <a class="btn" href="${packMdHref}">Markdown</a>
    <a class="btn" href="${packFlatHref}">Flat text</a>
    <a class="btn" href="${backHref}">Back to results</a>
  </div>
  <ol class="list" style="margin-top:16px">
    ${pack.howToUse.map((line) => `<li style="border:0;padding:6px 0">${escapeHtml(line)}</li>`).join('')}
  </ol>
</div>
<div class="card">
  <h2>Files in this pack</h2>
  <div class="pack-grid">
    ${pack.files
      .map(
        (f, i) => `<div class="pack-file">
      <div><code>${escapeHtml(f.path)}</code><small>${escapeHtml(f.description)} · ${f.content.length.toLocaleString()} chars</small>
      <pre id="ap-${i}" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">${escapeHtml(f.content)}</pre></div>
      <button type="button" class="btn" data-copy="ap-${i}">Copy</button>
    </div>`
      )
      .join('')}
  </div>
</div>`;
  return shell({
    title: `Agent pack · ${host}`,
    description: `Download Sitemapper agent pack for ${host}: AGENTS.md, tasks, inventory, Cursor rule, fix prompt.`,
    body,
    path: '/api/pack',
    noindex: true,
  });
}

export function errorHtml(title: string, message: string, statusHint?: string): string {
  const body = `
${stepRail(1)}
<p class="kicker">Could not finish</p>
<h1>${escapeHtml(title)}</h1>
<p class="lede">${escapeHtml(message)}</p>
${statusHint ? `<p class="flow-note">${escapeHtml(statusHint)}</p>` : ''}
<div class="card">
  <h2>Try this</h2>
  <ul class="list">
    <li>Use a direct <code style="color:var(--accent)">.xml</code> sitemap URL</li>
    <li>Try www vs bare host</li>
    <li>Confirm robots/sitemaps are public</li>
  </ul>
  <div class="actions"><a class="btn primary" href="/">Back to step 1</a></div>
</div>`;
  return shell({ title: `${title} · Sitemapper`, description: message, body, path: '/api/report', noindex: true });
}

export function aboutHtml(): string {
  const body = `
<article class="prose">
  <p class="kicker">About</p>
  <h1>Sitemapper</h1>
  <p>A free, three-step public sitemap survey from Oortstack. No accounts. Results include a fix list and an <strong>export pack for AI coding agents</strong>.</p>
  <h2>Steps</h2>
  <ol>
    <li>Enter a site or sitemap URL</li>
    <li>We survey robots + sitemaps + sample pages</li>
    <li>You get scores, fixes, inventory, and agent files</li>
  </ol>
  <h2>Agent pack files</h2>
  <ul>
    <li><code>AGENTS.md</code> — repo instructions</li>
    <li><code>.cursor/rules/sitemapper-seo.mdc</code> — Cursor rule</li>
    <li><code>sitemapper/tasks.json</code> — prioritized tasks</li>
    <li><code>sitemapper/inventory.json</code> — URL list</li>
    <li><code>sitemapper/FIX_PROMPT.md</code> — paste-ready prompt</li>
  </ul>
  <p><a class="btn primary" href="/">Start a survey</a></p>
</article>`;
  return shell({
    title: 'About Sitemapper',
    description: 'Three-step sitemap survey with AI coding agent export packs. Built by Oortstack.',
    body,
    path: '/about',
  });
}

export function compareHtml(): string {
  const body = `
<article class="prose">
  <p class="kicker">Compare</p>
  <h1>Not just a URL list</h1>
  <div class="table-wrap" style="max-height:none;margin:16px 0">
    <table class="data">
      <thead><tr><th>Capability</th><th>Typical tool</th><th>Sitemapper</th></tr></thead>
      <tbody>
        <tr><td>Step-by-step flow</td><td>Dump results</td><td><strong>Enter → Survey → Fix/Export</strong></td></tr>
        <tr><td>AI agent pack</td><td>No</td><td><strong>AGENTS.md + tasks + fix prompt</strong></td></tr>
        <tr><td>Path lattice</td><td>No</td><td><strong>Yes</strong></td></tr>
        <tr><td>Freshness decay</td><td>Rare</td><td><strong>Yes</strong></td></tr>
        <tr><td>Run fingerprint</td><td>No</td><td><strong>sp_… receipt</strong></td></tr>
        <tr><td>Account</td><td>Often</td><td><strong>Never</strong></td></tr>
      </tbody>
    </table>
  </div>
  <p><a class="btn primary" href="/">Try the 3-step flow</a></p>
</article>`;
  return shell({
    title: 'Sitemapper vs other sitemap checkers',
    description: 'Step-by-step flow, AI agent packs, path lattice, fingerprints — compared to typical sitemap URL listers.',
    body,
    path: '/compare',
  });
}

export function guideXmlCheckerHtml(): string {
  const body = `
<article class="prose">
  <p class="kicker">Guide</p>
  <h1>Check an XML sitemap in 3 steps</h1>
  <ol>
    <li>Go to <a href="/">sitemapper.oortstack.com</a></li>
    <li>Paste your site or sitemap URL → Start survey</li>
    <li>Read fixes, then download the agent pack if you want code changes</li>
  </ol>
  <p>API: <code>/api/report?site=</code> · <code>/api/agent-pack?site=</code> · <code>/api/csv?site=</code></p>
  <p><a class="btn primary" href="/">Start</a></p>
</article>`;
  return shell({
    title: 'Free XML sitemap checker — 3 steps · Sitemapper',
    description: 'Check an XML sitemap in three steps. Export JSON, CSV, or an AI coding agent pack.',
    body,
    path: '/guides/xml-sitemap-checker',
  });
}

export function guideConflictsHtml(): string {
  const body = `
<article class="prose">
  <p class="kicker">Guide</p>
  <h1>Robots ↔ sitemap conflicts</h1>
  <p>URLs in the sitemap should not be Disallow’d in robots.txt. Sitemapper flags <code>ROBOTS_DISALLOWED_IN_SITEMAP</code> and can put that into an agent task pack.</p>
  <p><a class="btn primary" href="/">Scan a site</a></p>
</article>`;
  return shell({
    title: 'Robots.txt vs sitemap conflicts · Sitemapper',
    description: 'Find URLs advertised in sitemaps but blocked by robots.txt. Export fixes for coding agents.',
    body,
    path: '/guides/robots-sitemap-conflicts',
  });
}

export function llmsTxt(): string {
  return `# Sitemapper

> Free 3-step public XML sitemap survey + AI coding agent export packs.

Site: ${ORIGIN}

## Flow
1. Enter site or sitemap URL
2. Survey robots + sitemaps + sample pages
3. Results: scores, fixes, inventory, agent pack

## Saved share URLs (no re-crawl)
After a survey, results are stored 30 days at:
- Report: ${ORIGIN}/r/{id}
- JSON: ${ORIGIN}/r/{id}/json
- CSV: ${ORIGIN}/r/{id}/csv
- Agent pack: ${ORIGIN}/r/{id}/pack
- Pack (md/flat): ${ORIGIN}/r/{id}/pack?format=md|flat
- Pack UI: ${ORIGIN}/r/{id}/pack/view

## Live (re-crawl) APIs
- HTML report: ${ORIGIN}/api/report?site={url}  → redirects to /r/{id}
- Analyze JSON: ${ORIGIN}/api/analyze?site={url}
- CSV: ${ORIGIN}/api/csv?site={url}
- Agent pack: ${ORIGIN}/api/agent-pack?site={url}
- Stats: ${ORIGIN}/api/stats

## Pack files
- SITEMAPPER_BRIEFING.md
- AGENTS.md
- .cursor/rules/sitemapper-seo.mdc
- sitemapper/tasks.json
- sitemapper/inventory.json
- sitemapper/context.json
- sitemapper/FIX_PROMPT.md

## Limits
1200 URLs indexed, 40 deep checks, 300 HTML inventory rows (Worker preview)
Reports expire after 30 days.
`;
}

export function robotsTxt(): string {
  return `User-agent: *
Allow: /
Disallow: /api/report
Disallow: /api/analyze
Disallow: /api/csv
Disallow: /api/agent-pack
Disallow: /api/pack
Disallow: /r/
Disallow: /app
Disallow: /app/
Disallow: /login
Disallow: /auth/
Disallow: /api/stripe/

Sitemap: ${ORIGIN}/sitemap.xml
`;
}

export function sitemapXml(): string {
  const urls = [
    '/',
    '/about',
    '/compare',
    '/pricing',
    '/issues',
    '/guides/xml-sitemap-checker',
    '/guides/robots-sitemap-conflicts',
    '/tools/sitemap-checker',
    '/tools/xml-sitemap-validator',
    '/tools/sitemap-finder',
    '/tools/sitemap-explorer',
    '/tools/robots-txt-checker',
    '/tools/canonical-checker',
    '/tools/noindex-checker',
    '/tools/lastmod-checker',
    '/tools/meta-tag-checker',
    '/tools/indexability-checker',
    '/llms.txt',
    ...ISSUE_PATHS,
  ];
  const lastmod = new Date().toISOString().slice(0, 10);
  const body = urls
    .map(
      (path) => `  <url>
    <loc>${ORIGIN}${path === '/' ? '' : path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${path === '/' ? 'daily' : 'weekly'}</changefreq>
    <priority>${path === '/' ? '1.0' : '0.7'}</priority>
  </url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export function csvFromResult(result: Result): string {
  const header = [
    'url',
    'path',
    'type',
    'section',
    'deep_checked',
    'status',
    'title',
    'description',
    'canonical',
    'lastmod',
    'redirects',
    'og_title',
    'has_schema',
    'hreflang_count',
    'issue_codes',
    'issue_count',
  ];
  const lines = [header.join(',')];
  for (const page of result.pages) {
    lines.push(
      [
        page.url,
        page.path,
        page.type,
        page.section,
        page.deepChecked ? '1' : '0',
        page.status ?? '',
        page.title ?? '',
        page.description ?? '',
        page.canonical ?? '',
        page.lastmod ?? '',
        page.redirects ?? '',
        page.ogTitle ?? '',
        page.hasSchema ? '1' : '0',
        page.hreflangCount ?? '',
        page.issues.map((i) => i.code).join('|'),
        page.issues.length,
      ]
        .map(csvCell)
        .join(',')
    );
  }
  return lines.join('\n');
}

function csvCell(value: unknown): string {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function issueRows(result: Result): string {
  const map = new Map<string, number>();
  for (const issue of [...result.issues, ...result.pages.flatMap((p) => p.issues)]) {
    if (issue.code === 'INDEX_ONLY_NOT_FETCHED') continue;
    map.set(issue.code, (map.get(issue.code) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([code, count]) => `<tr><td>${escapeHtml(humanize(code))}</td><td>${count}</td></tr>`)
    .join('');
}

function siteSummary(result: Result): string {
  const host = safeHost(result.site);
  const count = result.source.discoveredUrlCount;
  if (count === 0) return `${host} did not expose usable sitemap URLs.`;
  if (count < 5) return `${host} exposed ${count} URLs — thin inventory unless intentional.`;
  return `${host}: lattice depth ${result.insights.latticeDepth}, freshness ${result.insights.freshnessCoverage}%, imbalance ${result.insights.imbalance}%.`;
}

function safeHost(site: string): string {
  try {
    return new URL(site).hostname;
  } catch {
    return site;
  }
}
