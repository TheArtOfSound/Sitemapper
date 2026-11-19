/**
 * Light SaaS survey UI — Source Serif headlines, IBM Plex Sans chrome.
 */

import { ISSUE_CATALOG, issuePath } from '../src/issues/catalog.js';
import type { FreshnessBucket, Insights, Scores, SectionStat } from './insights.js';
import { flattenLattice, recommendations, scoresAvailable } from './insights.js';
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
  /** False for separately probed critical journeys that were not declared by the sitemap. */
  sitemapListed?: boolean;
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
  scores: Scores;
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
  --bg:#f5f6f8;
  --panel:#ffffff;
  --line:#e6e8ee;
  --text:#111318;
  --mute:#6b7280;
  --accent:#4f6ef7;
  --accent-bg:#eef1fe;
  --ok:#16a34a;
  --ok-bg:#ecfdf3;
  --warn:#ea580c;
  --warn-bg:#fff1e6;
  --medium:#d97706;
  --medium-bg:#fef3c7;
  --bad:#e11d48;
  --bad-bg:#fde8ee;
  --radius:14px;
  --btn-radius:10px;
  --mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;
  --sans:"IBM Plex Sans","Segoe UI",system-ui,sans-serif;
  --serif:"Source Serif 4",Georgia,serif;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{
  margin:0;min-height:100vh;color:var(--text);
  font:16px/1.5 var(--sans);
  background:var(--bg);
  overflow-x:hidden;
}
img{max-width:100%;height:auto}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:3px}
button,.btn,.nav a,.rail a,.chip,.account-menu summary,.account-menu a{-webkit-tap-highlight-color:transparent}
.visually-hidden{position:absolute;clip:rect(0,0,0,0);width:1px;height:1px;overflow:hidden}
.wrap{
  max-width:760px;margin:0 auto;
  padding:28px 18px 72px;
  padding-left:max(18px, env(safe-area-inset-left));
  padding-right:max(18px, env(safe-area-inset-right));
  padding-bottom:max(72px, calc(28px + env(safe-area-inset-bottom)));
}
.wrap.home{max-width:980px}

.owner-story{background:#f6f8ff;border-color:#d3dbef}
.owner-story .kicker{margin-bottom:12px}
.owner-story h2{font:600 clamp(1.6rem,3vw,2.3rem)/1.16 var(--serif);letter-spacing:-.035em;margin:0 0 12px;color:#131e35}
.owner-story p{max-width:65ch;color:#46546d;line-height:1.7}
.owner-story p+p{margin-top:11px}
.owner-story__layout{display:grid;grid-template-columns:minmax(0,1fr);gap:18px}
.owner-story .actions{margin-top:23px;flex-wrap:wrap}
@media(max-width:560px){.owner-story{padding:19px}.owner-story .actions .btn{min-height:44px}}

.wrap.wide{max-width:1180px}

.topbar{
  background:var(--panel);border-bottom:1px solid var(--line);
  position:sticky;top:0;z-index:20;
}
.topbar-inner,.top{
  max-width:1120px;margin:0 auto;
  padding:10px 18px;
  padding-left:max(18px, env(safe-area-inset-left));
  padding-right:max(18px, env(safe-area-inset-right));
  display:flex;align-items:center;justify-content:space-between;gap:16px;
}
.brand{
  display:flex;align-items:center;gap:10px;color:var(--text);
  text-decoration:none;font:600 17px/1 var(--serif);letter-spacing:-.02em;flex-shrink:0;
}
.brand:hover{text-decoration:none;color:var(--text)}
.brand.wordmark{gap:9px}
.mark{
  width:32px;height:32px;display:block;object-fit:contain;flex-shrink:0;
}
.nav{display:flex;gap:4px 4px;flex-wrap:wrap;align-items:center;font:500 14px/1 var(--sans)}
.nav a{
  color:var(--mute);padding:10px 10px;min-height:44px;border-radius:8px;
  display:inline-flex;align-items:center;
}
.nav a:hover{color:var(--accent);text-decoration:none;background:var(--accent-bg)}
.nav a.on{color:var(--accent);background:var(--accent-bg)}
.topbar-end{display:flex;align-items:center;gap:12px;margin-left:auto}
.nav-help{
  width:28px;height:28px;min-width:28px;min-height:28px;padding:0;
  border:1px solid var(--line);border-radius:50%;
  color:var(--mute);font:600 13px/1 var(--sans);
  display:inline-grid;place-items:center;text-decoration:none;
}
.nav-help:hover{color:var(--accent);border-color:var(--accent);background:var(--accent-bg);text-decoration:none}
.vdiv{width:1px;height:18px;background:var(--line);flex-shrink:0}
.who{color:var(--mute);font:500 13px/1 var(--sans);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.initials{
  width:32px;height:32px;border-radius:50%;background:var(--accent-bg);color:var(--accent);
  display:grid;place-items:center;font:600 11px/1 var(--sans);flex-shrink:0;
}
.topbar-add{
  min-height:36px;padding:8px 14px;font-size:13px;flex-shrink:0;
}
.account-menu{position:relative;flex-shrink:0}
.account-menu > summary{
  list-style:none;cursor:pointer;
  display:flex;align-items:center;gap:10px;
  min-height:44px;padding:6px 4px 6px 10px;border-radius:999px;
  color:var(--text);
}
.account-menu > summary::-webkit-details-marker{display:none}
.account-menu > summary::marker{content:""}
.account-menu > summary:hover,.account-menu[open] > summary{background:var(--accent-bg)}
.account-menu > summary:focus{outline:none}
.account-menu > summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.account-menu-panel{
  position:absolute;right:0;top:calc(100% + 6px);z-index:40;
  min-width:220px;padding:6px;
  background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);
  box-shadow:0 10px 30px rgba(17,19,24,.08);
}
.account-menu-panel a{
  display:flex;align-items:center;min-height:44px;padding:8px 12px;border-radius:8px;
  color:var(--text);font:500 14px/1 var(--sans);text-decoration:none;
}
.account-menu-panel a:hover{background:var(--accent-bg);color:var(--accent);text-decoration:none}
.account-plan{
  padding:8px 12px 10px;margin:0 0 4px;border-bottom:1px solid var(--line);
  color:var(--mute);font:500 12px/1.3 var(--sans);
}
.rail a.initials{
  width:32px;height:32px;border-radius:50%;
  background:var(--accent-bg);color:var(--accent);
  font:600 11px/1 var(--sans);
}

.app-shell{min-height:100vh}
.app-shell .topbar{margin-left:68px}
.app-shell .topbar-inner{max-width:none;padding:12px 32px;padding-left:max(32px, env(safe-area-inset-left));padding-right:max(32px, env(safe-area-inset-right))}
.rail{
  position:fixed;left:0;top:0;bottom:0;width:68px;z-index:30;
  background:var(--panel);border-right:1px solid var(--line);
  display:flex;flex-direction:column;align-items:center;gap:6px;
  padding:14px 0;padding-top:max(14px, env(safe-area-inset-top));
  padding-bottom:max(14px, env(safe-area-inset-bottom));
}
.rail a{
  width:40px;height:40px;border-radius:10px;color:var(--mute);
  display:grid;place-items:center;text-decoration:none;position:relative;
}
.rail a:hover{color:var(--accent);background:var(--accent-bg);text-decoration:none}
.rail a.on{color:var(--accent);background:var(--accent-bg)}
.rail a span{
  position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;
}
.rail a.rail-brand{
  color:var(--accent);background:transparent;margin-bottom:6px;
}
.rail a.rail-brand .mark{width:32px;height:32px}
.rail a.rail-brand:hover{background:var(--accent-bg);color:var(--accent);text-decoration:none}
.rail-foot{margin-top:auto;padding-top:12px;display:grid;place-items:center}
.app-main{
  margin-left:68px;
  padding:28px 32px 56px;
  padding-left:max(32px, env(safe-area-inset-left));
  padding-right:max(32px, env(safe-area-inset-right));
  padding-bottom:max(56px, env(safe-area-inset-bottom));
}
.app-main .wrap,.app-main .wrap.wide{max-width:1180px;padding:0 0 40px}

.pipeline{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 22px}
.pipeline div{border:1px solid var(--line);background:var(--panel);padding:16px 16px;border-radius:var(--radius)}
.pipeline b{display:block;font:600 13px/1.3 var(--sans);letter-spacing:0;text-transform:none;color:var(--text);margin-bottom:6px}
.pipeline span{display:block;color:var(--mute);font:14px/1.45 var(--sans)}
.split{display:grid;grid-template-columns:1.15fr .85fr;gap:16px;align-items:start}
.dash-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:16px;align-items:stretch}
.dash-grid > :last-child{display:flex;flex-direction:column;min-height:100%}
.dash-grid > :last-child .card{flex:1;display:flex;flex-direction:column;min-height:100%}
.dash-grid > :last-child .card .timeline{flex:1;align-content:start}
.dash-grid > :last-child .card > .view-all:last-child{margin-top:auto;padding-top:12px}
.plan-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px;align-items:stretch;margin:14px 0}

.hero-stage{
  position:relative;margin:0 0 28px;aspect-ratio:16/9;height:auto;width:100%;
  overflow:hidden;border:1px solid var(--line);background:#111318;border-radius:var(--radius);
}
.hero-stage video,.hero-stage img{
  width:100%;height:100%;max-width:none;object-fit:contain;object-position:center bottom;display:block;
  pointer-events:none;border:0;outline:none;
}
.hero-stage video::cue{opacity:0}
.hero-stage::after{
  content:"";position:absolute;inset:0;pointer-events:none;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);
}
.hero-cap{
  position:absolute;left:0;right:0;bottom:0;z-index:2;pointer-events:none;
  height:26%;min-height:88px;display:flex;flex-direction:column;justify-content:center;
  background:#0d0f14;border-top:3px solid var(--accent);
  padding:12px 20px 14px;
}
.hero-cap b{display:block;font:600 11px/1 var(--sans);letter-spacing:.16em;color:#9db0ff;margin:0 0 6px}
.hero-cap span{display:block;font:600 clamp(15px,2.1vw,22px)/1.25 var(--serif);color:#fff;letter-spacing:-.02em}
.hero-sound{
  position:absolute;right:14px;top:14px;z-index:3;
  border:1px solid rgba(255,255,255,.18);background:rgba(17,19,24,.72);color:#fff;
  font:600 12px/1 var(--sans);letter-spacing:.04em;
  padding:10px 12px;border-radius:999px;cursor:pointer;min-height:36px;
}
.hero-sound:hover{background:rgba(17,19,24,.9);text-decoration:none;color:#fff}
.hero-sound[aria-pressed="true"]{background:var(--accent);border-color:var(--accent)}

.steps{
  display:flex;gap:8px;margin:0 0 28px;padding:0;list-style:none;background:transparent;border:0;
}
.steps li{
  flex:1;padding:12px 12px;text-align:left;font:12px/1.35 var(--sans);
  letter-spacing:0;text-transform:none;color:var(--mute);
  background:var(--panel);border:1px solid var(--line);border-radius:12px;
}
.steps li b{display:block;font:600 13px/1.3 var(--sans);color:var(--text);margin-bottom:4px;letter-spacing:0;text-transform:none}
.steps li.on{background:var(--accent-bg);border-color:var(--accent);color:var(--accent)}
.steps li.on b{color:var(--accent)}
.steps li.done{color:var(--ok);border-color:#bbf7d0}
.steps li.done b{color:var(--ok)}

h1{font:600 clamp(2rem,4vw,2.6rem)/1.15 var(--serif);margin:0 0 12px;letter-spacing:-.03em;color:var(--text)}
.lede{color:var(--mute);margin:0 0 22px;font:400 15px/1.55 var(--sans);max-width:40em}
.kicker{font:12px/1.4 var(--sans);letter-spacing:0;text-transform:none;color:var(--mute);margin:0 0 10px}

.card{
  border:1px solid var(--line);background:var(--panel);padding:18px 20px;margin-bottom:16px;
  border-radius:var(--radius);box-shadow:none;
}
.card h2{margin:0 0 12px;font:600 15px/1.3 var(--sans)}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 10px}
.card-head h2{margin:0;font:600 15px/1.3 var(--sans)}
.card-head h2 .pill{margin-left:8px;vertical-align:middle}
.card-head > .pill{margin-right:auto}
a.view-all{color:var(--accent);font:500 13px/1 var(--sans);text-decoration:none;white-space:nowrap;margin-left:auto}
a.view-all:hover{text-decoration:underline}
.plan-price{white-space:nowrap;color:var(--mute);font:500 13px/1 var(--sans)}
.plan-price b{color:var(--text);font:600 15px/1 var(--sans)}
.actions form{display:flex;margin:0}
.actions form .btn,.btn{white-space:nowrap}
.card p{margin:0 0 12px;color:var(--mute)}
.card p:last-child{margin-bottom:0}

.form-row{display:grid;grid-template-columns:1fr auto;gap:8px;border:0;align-items:stretch}
.form-row input,.form-row select{
  border:1px solid var(--line);background:var(--panel);color:var(--text);
  padding:12px 14px;font:16px/1.3 var(--sans);outline:none;min-width:0;width:100%;
  border-radius:var(--btn-radius);min-height:44px;
}
.form-row input:focus,.form-row select:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-bg)}
.form-row input::placeholder{color:#9aa3b2}
.form-row button{
  border:0;background:var(--accent);color:#fff;
  font:600 14px/1 var(--sans);letter-spacing:0;text-transform:none;
  padding:0 18px;cursor:pointer;border-radius:var(--btn-radius);min-height:44px;
}
.form-row button:hover{background:#3d5de8}
.form-row button:disabled{opacity:.6;cursor:wait}
.hint{margin-top:10px;font:12px/1.45 var(--sans);color:var(--mute)}
.hint code{font-family:var(--mono);font-size:.92em}

.demos{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.chip{
  display:inline-flex;align-items:center;border:1px solid var(--line);padding:8px 12px;
  font:12px/1 var(--sans);color:var(--mute);text-decoration:none;
  background:var(--panel);border-radius:999px;
}
.chip:hover{border-color:var(--accent);color:var(--accent);text-decoration:none;background:var(--accent-bg)}

.scores,.stat-band{
  display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;
  margin:14px 0 22px;background:var(--panel);border:1px solid var(--line);
  border-radius:var(--radius);overflow:hidden;
}
.stat-row{
  display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 16px;
}
.score{
  padding:18px 20px;text-align:left;background:transparent;border:0;border-radius:0;
  display:grid;grid-template-columns:44px minmax(0,1fr);
  grid-template-rows:auto auto auto;
  grid-template-areas:"icon label" "icon value" "icon helper";
  column-gap:12px;align-items:center;
}
.stat-band .score + .score,.scores .score + .score{border-left:1px solid var(--line)}
.stat-row .score{
  border:1px solid var(--line);background:var(--panel);border-radius:var(--radius);padding:14px 16px;
}
.score::before{
  content:"";width:44px;height:44px;border-radius:50%;grid-area:icon;
  background-color:var(--accent-bg);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%234f6ef7' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:center;background-size:18px;
}
.score:nth-child(2)::before{
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%234f6ef7' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' viewBox='0 0 24 24'%3E%3Cpath d='M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z'/%3E%3Cpath d='M14 3v5h5'/%3E%3Cpath d='M9 13h6M9 17h4'/%3E%3C/svg%3E");
}
.score:nth-child(3)::before{
  background-color:var(--ok-bg);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%2316a34a' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='m8 12 3 3 5-6'/%3E%3C/svg%3E");
}
.score:has(b.health.critical)::before,.score:has(.health.critical)::before{
  background-color:var(--bad-bg);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%23e11d48' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M12 8v5M12 16h.01'/%3E%3C/svg%3E");
}
.stat-row .score:nth-child(1)::before{background-color:var(--bad-bg);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%23e11d48' stroke-width='1.8' stroke-linecap='round' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M12 8v5M12 16h.01'/%3E%3C/svg%3E")}
.stat-row .score:nth-child(2)::before{background-color:var(--warn-bg);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%23ea580c' stroke-width='1.8' stroke-linecap='round' viewBox='0 0 24 24'%3E%3Cpath d='M12 3 3 20h18Z'/%3E%3Cpath d='M12 9v5M12 16h.01'/%3E%3C/svg%3E")}
.stat-row .score:nth-child(3)::before{background-color:var(--ok-bg);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%2316a34a' stroke-width='1.8' stroke-linecap='round' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='m8 12 3 3 5-6'/%3E%3C/svg%3E")}
.score > b{
  grid-area:value;font:600 1.7rem/1.1 var(--sans);color:var(--text);letter-spacing:-.02em;
}
.score > span{
  grid-area:label;margin:0;font:13px/1.3 var(--sans);letter-spacing:0;text-transform:none;color:var(--mute);
}
.score > small{
  grid-area:helper;margin:4px 0 0;font:12px/1.3 var(--sans);color:var(--mute);
}
.score > b.health{
  display:block;background:none;padding:0;border-radius:0;text-transform:none;letter-spacing:-.02em;
  font:600 1.7rem/1.1 var(--sans);
}
.score > b.health.healthy{color:var(--ok)}
.score > b.health.critical{color:var(--bad)}
.score.is-critical b{color:var(--bad)}
.score.is-critical::before{
  background-color:var(--bad-bg);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%23e11d48' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M12 8v5M12 16h.01'/%3E%3C/svg%3E");
}

.verdict{border-left:3px solid var(--accent);padding:4px 0 4px 14px;margin:8px 0 0}
.verdict strong{display:block;color:var(--text);font-size:1.05rem;margin-bottom:6px}
.fp{
  display:inline-block;margin-top:12px;font:12px/1.4 var(--mono);color:var(--ok);
  border:1px dashed #bbf7d0;background:var(--ok-bg);padding:6px 10px;border-radius:8px;
}

.list{list-style:none;margin:0;padding:0}
ol.list{list-style:decimal;padding-left:1.2em}
.list li{padding:12px 0;border-bottom:1px solid var(--line);color:var(--mute)}
.list li:last-child{border-bottom:0}
.list li strong{display:block;color:var(--text);margin-bottom:4px}
.list .proof{font:12px/1.4 var(--mono);color:var(--mute);margin-top:6px}
.prio{font:600 11px/1 var(--sans);letter-spacing:0;color:var(--warn);margin-right:6px}
.prio.p1{color:var(--bad)}
.prio.p3{color:var(--ok)}

.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  border:1px solid var(--line);background:var(--panel);color:var(--text);
  font:600 14px/1 var(--sans);letter-spacing:0;text-transform:none;
  padding:11px 14px;min-height:44px;cursor:pointer;text-decoration:none;
  border-radius:var(--btn-radius);
}
.btn:hover{border-color:var(--accent);color:var(--accent);text-decoration:none;background:var(--accent-bg)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
.btn.primary:hover{background:#3d5de8;border-color:#3d5de8;color:#fff}

details.block{
  border:1px solid var(--line);background:var(--panel);margin-bottom:12px;border-radius:var(--radius);
}
details.block > summary{
  cursor:pointer;padding:14px 16px;font:600 14px/1.3 var(--sans);list-style:none;
  display:flex;justify-content:space-between;align-items:center;gap:10px;
}
details.block > summary::-webkit-details-marker{display:none}
details.block > summary::after{content:"+";font:600 16px/1 var(--sans);color:var(--mute)}
details.block[open] > summary::after{content:"–"}
details.block .inner{padding:0 16px 16px;border-top:1px solid var(--line)}
details.block .inner > :first-child{margin-top:14px}

table.data{width:100%;border-collapse:collapse;font-size:13px}
table.data th,table.data td{
  text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top;
}
table.data th{font:600 12px/1.2 var(--sans);letter-spacing:0;text-transform:none;color:var(--mute)}
table.data small{color:var(--mute);font:12px/1.35 var(--sans);word-break:break-all}

.badge,.pill{
  display:inline-flex;align-items:center;font:600 11px/1 var(--sans);
  padding:5px 8px;border-radius:999px;letter-spacing:0;
}
.badge{border:1px solid var(--line);color:var(--mute);background:var(--bg);font-weight:500;font-size:11px}
.badge.deep{color:var(--ok);border-color:#bbf7d0;background:var(--ok-bg)}
.pill.critical{color:var(--bad);background:var(--bad-bg)}
.pill.high,.pill.warning{color:var(--warn);background:var(--warn-bg)}
.pill.medium{color:var(--medium);background:var(--medium-bg)}
.pill.low,.pill.ok{color:var(--ok);background:var(--ok-bg)}
.pill.pending{color:var(--mute);background:#f3f4f6}

.health{display:inline-flex;align-items:center}
.status,.site-card .health{
  display:inline-flex;align-items:center;gap:6px;
  font:500 13px/1 var(--sans);color:var(--mute);
  background:none;padding:0;border-radius:0;text-transform:none;letter-spacing:0;
}
.status::before,.site-card .health::before{
  content:"";width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0;
}
.status.healthy,.site-card .health.healthy,.health.healthy{color:var(--ok)}
.status.critical,.site-card .health.critical,.health.critical{color:var(--bad)}
.status.warning,.site-card .health.warning,.health.warning{color:var(--warn)}
.status.pending,.site-card .health.pending,.health.pending{color:var(--mute)}

.portfolio{display:grid;gap:0;margin-top:4px}
.site-card,.avatar,a.incident{
  text-decoration:none;color:inherit;
}
a.incident:hover,a.site-card:hover{text-decoration:none;color:inherit}
.site-card{
  display:grid;grid-template-columns:32px minmax(0,1fr) auto auto 18px;gap:10px 12px;align-items:center;
  border:0;border-bottom:1px solid var(--line);background:transparent;
  padding:12px 0;border-radius:0;
}
.site-card:last-child{border-bottom:0}
.site-card:hover{text-decoration:none;background:transparent}
.site-card:hover strong{color:var(--accent)}
.site-card strong{display:block;color:var(--text);font:600 14px/1.3 var(--sans);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.site-card p,.site-card > span:nth-child(3){margin:0;color:var(--mute);font:13px/1.4 var(--sans);white-space:nowrap}
.site-card > span:last-child,.incident > span:last-child{color:var(--mute);font:600 18px/1 var(--sans)}
.avatar,.site-card .initials{
  width:32px;height:32px;border-radius:50%;color:#fff;
  display:grid;place-items:center;font:600 11px/1 var(--sans);background:#4f6ef7;
}
.initials.c0,.avatar.c0,.c0{background:#4f6ef7}
.initials.c1,.avatar.c1,.c1{background:#111318}
.initials.c2,.avatar.c2,.c2{background:#7c3aed}
.initials.c3,.avatar.c3,.c3{background:#0f766e}
.initials.c4,.avatar.c4,.c4{background:#2563eb}
.initials.c5,.avatar.c5,.c5{background:#db2777}

.incident{
  display:grid;grid-template-columns:40px minmax(110px,.9fr) 1.3fr auto 18px;gap:10px 12px;align-items:center;
  border:0;border-bottom:1px solid var(--line);border-radius:0;padding:14px 0;margin:0;
  background:transparent;
}
.incident:last-child{border-bottom:0}
.incident:has(> :nth-child(4):last-child){grid-template-columns:40px 1fr auto 18px}
.card.incident{display:block;border:1px solid var(--line);border-left:3px solid var(--bad);border-radius:var(--radius);padding:18px 20px;margin-bottom:16px;grid-template-columns:none}
.incident strong{display:block;color:var(--text);font:600 14px/1.3 var(--sans)}
.incident p{margin:2px 0 0;color:var(--mute);font:13px/1.4 var(--sans)}
.incident > a,.chev{color:var(--mute);font:600 18px/1 var(--sans);text-decoration:none}
.incident > a:hover,.chev:hover{color:var(--accent);text-decoration:none}
.inc-icon,.incident > .health,.incident > .icon{
  width:36px;height:36px;border-radius:50%;display:grid;place-items:center;
  font:700 14px/1 var(--sans);padding:0;background:var(--accent-bg);color:var(--accent);
  text-transform:none;letter-spacing:0;
}
.inc-icon.critical,.incident > .health.critical,.incident.critical > .icon{background:var(--bad-bg);color:var(--bad)}
.inc-icon.warning,.incident > .health.warning,.incident.warning > .icon{background:var(--warn-bg);color:var(--warn)}
.inc-icon.medium,.incident > .health.medium,.incident.medium > .icon{background:var(--medium-bg);color:var(--medium)}
.inc-icon.healthy,.incident > .health.healthy,.incident.low > .icon,.incident.healthy > .icon{background:var(--ok-bg);color:var(--ok)}
.incident.critical > .icon::before{content:"!"}
.incident.warning > .icon::before{content:"▲";font-size:11px}
.incident.medium > .icon::before{content:"●";font-size:9px}
.incident.low > .icon::before,.incident.healthy > .icon::before{content:"✓";font-size:13px}
.inc-host,.inc-body{min-width:0}
.inc-host strong,.incident .inc-host{font:600 14px/1.3 var(--sans);color:var(--text)}
.inc-host span,.inc-cat{display:block;color:var(--mute);font:12px/1.35 var(--sans);margin-top:2px}

.timeline{display:grid;gap:0;align-content:start}
.timeline > *{
  display:grid;grid-template-columns:72px 1fr auto;gap:8px 12px;align-items:start;
  border-left:2px solid var(--line);padding:12px 0 12px 16px;margin-left:8px;position:relative;
}
.timeline > *::before{
  content:"";width:10px;height:10px;border-radius:50%;background:var(--accent);
  position:absolute;left:-6px;top:16px;
}
.timeline > .critical::before,.timeline > *:has(.pill.critical)::before{background:var(--bad)}
.timeline > .warning::before,.timeline > .high::before,.timeline > *:has(.pill.high)::before,.timeline > *:has(.pill.warning)::before{background:var(--warn)}
.timeline > .medium::before,.timeline > *:has(.pill.medium)::before{background:var(--medium)}
.timeline > .low::before,.timeline > .healthy::before,.timeline > *:has(.pill.low)::before,.timeline > *:has(.pill.ok)::before{background:var(--ok)}
.timeline time{color:var(--mute);font:12px/1.4 var(--sans);min-width:72px}
.timeline strong{display:block;color:var(--text);font:600 14px/1.3 var(--sans)}
.timeline p{margin:2px 0 0;color:var(--mute);font:13px/1.4 var(--sans)}

.bar-row{display:grid;grid-template-columns:1fr 48px;gap:8px;align-items:center;margin:6px 0;font:12px/1.3 var(--sans)}
.bar{height:6px;background:#eef0f4;overflow:hidden;border-radius:999px}
.bar > i{display:block;height:100%;background:var(--accent);border-radius:999px}

.fresh{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.fresh div{border:1px solid var(--line);background:var(--panel);padding:10px;text-align:center;border-radius:12px}
.fresh b{display:block;font:600 1.15rem/1 var(--sans)}
.fresh span{display:block;margin-top:4px;font:12px/1.2 var(--sans);color:var(--mute);text-transform:none}

.pack-grid{display:grid;gap:8px}
.pack-file{
  display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;
  border:1px solid var(--line);background:var(--bg);padding:10px 12px;border-radius:12px;
}
.pack-file code{font:12px/1.3 var(--mono);color:var(--accent)}
.pack-file small{display:block;color:var(--mute);font-size:12px;margin-top:3px}
.copy-ok{color:var(--ok)!important}

.loading{
  display:none;position:fixed;inset:0;background:rgba(245,246,248,.88);z-index:40;
  place-items:center;padding:20px;
}
.loading.on{display:grid}
.loading .box{
  max-width:440px;width:100%;border:1px solid var(--line);background:var(--panel);
  padding:24px 22px;border-radius:var(--radius);
}
.loading .pulse{
  width:36px;height:36px;margin:0 auto 14px;border:2px solid var(--line);
  border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;
}
@keyframes spin{to{transform:rotate(360deg)}}
.loading strong{display:block;margin-bottom:6px;font:600 1.2rem/1.3 var(--serif);color:var(--text);text-align:center}
.loading p{margin:0;font:13px/1.45 var(--sans);color:var(--mute)}
.loading .scan-kicker{text-align:center;letter-spacing:0;text-transform:none;color:var(--mute);margin:0 0 8px;font:12px/1.4 var(--sans)}
.scan-bar{
  height:8px;background:#eef0f4;overflow:hidden;margin:16px 0 8px;border:0;border-radius:999px;
}
.scan-bar > i{display:block;height:100%;width:0;background:var(--accent);transition:width .28s ease;border-radius:999px}
.scan-meta{display:flex;flex-wrap:wrap;gap:8px 14px;justify-content:space-between;font:12px/1.4 var(--sans);color:var(--mute)}
.scan-steps{list-style:none;margin:16px 0 0;padding:0;text-align:left}
.scan-steps li{
  padding:8px 0;border-top:1px solid var(--line);font:13px/1.35 var(--sans);color:var(--mute);
  display:flex;justify-content:space-between;gap:10px;
}
.scan-steps li:first-child{border-top:0}
.scan-steps li::before{content:"·";color:var(--mute);margin-right:8px;font-family:var(--mono)}
.scan-steps li.on{color:var(--accent)}
.scan-steps li.on::before{content:"→";color:var(--accent)}
.scan-steps li.done{color:var(--ok)}
.scan-steps li.done::before{content:"✓";color:var(--ok)}
.loading .scan-dismiss{display:none;margin:16px auto 0}
.loading.error .scan-dismiss{display:inline-flex}
.loading.error .pulse{display:none}

.flow-note{
  font:13px/1.45 var(--sans);color:var(--mute);margin:0 0 18px;padding:10px 12px;
  border:1px solid var(--line);background:var(--accent-bg);border-radius:12px;
}

.footer{
  margin-top:40px;padding-top:16px;border-top:1px solid var(--line);
  font:12px/1.5 var(--sans);color:var(--mute);
  display:flex;flex-wrap:wrap;gap:10px 18px;justify-content:space-between;
}
.footer a{color:var(--mute)}
.footer a:hover{color:var(--accent)}

.prose{margin-bottom:18px}
.prose h1{margin-top:0}
.prose h2{font:600 15px/1.3 var(--sans);margin:1.6em 0 .5em;color:var(--text)}
.prose p,.prose li{color:var(--mute)}
.prose code{font-family:var(--mono);font-size:.9em;color:var(--accent)}

.filter{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.filter input,.filter select{
  background:var(--panel);border:1px solid var(--line);color:var(--text);
  font:16px/1.3 var(--sans);padding:10px 12px;outline:none;border-radius:var(--btn-radius);min-height:44px;
}
.table-wrap{overflow:auto;max-height:420px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}

@media(max-width:800px){
  .pipeline{grid-template-columns:1fr 1fr}
  .split,.dash-grid{grid-template-columns:1fr}
  .topbar-inner,.top{flex-wrap:wrap;align-items:center;gap:8px 14px}
  .nav{width:100%;gap:2px 4px}
  .app-shell .topbar{margin-left:0}
  .app-shell .topbar-inner{padding:10px 16px}
  .app-main{margin-left:0;padding:20px 16px;padding-bottom:max(88px, calc(64px + env(safe-area-inset-bottom)))}
  .who,.vdiv{display:none}
  .nav-help{width:44px;height:44px;min-width:44px;min-height:44px}
  .topbar-add{min-height:44px;padding:10px 12px}
  .account-menu > summary{padding:4px;min-width:44px;justify-content:center}
  .account-menu-panel{right:0;left:auto}
  .rail{
    flex-direction:row;justify-content:space-around;align-items:center;gap:0;
    top:auto;left:0;right:0;bottom:0;width:100%;height:auto;
    border-right:0;border-top:1px solid var(--line);
    padding:6px 8px;padding-bottom:max(6px, env(safe-area-inset-bottom));
  }
  .rail a{
    width:auto;flex:1;height:52px;min-height:44px;border-radius:10px;
    grid-template-rows:20px auto;gap:2px;padding:6px 4px;
  }
  .rail a span{
    position:static;width:auto;height:auto;margin:0;overflow:visible;clip:auto;clip-path:none;
    font:600 10px/1 var(--sans);letter-spacing:.02em;
  }
  .rail-brand,.rail-foot{display:none}
}
@media(max-width:640px){
  .wrap{padding-top:20px;padding-bottom:max(48px, calc(20px + env(safe-area-inset-bottom)))}
  h1{font-size:clamp(1.55rem,7.2vw,2.2rem);line-height:1.14}
  .lede{font-size:15px;margin-bottom:18px}
  .card{padding:16px 14px;margin-bottom:14px}
  .hero-stage{margin-bottom:18px}
  .hero-cap{padding:10px 14px 12px;min-height:80px}
  .hero-cap span{font-size:15px}
  .pipeline{gap:8px;margin:14px 0 18px}
  .pipeline div{padding:12px 10px}
  .pipeline span{font-size:13px}
  .scores,.stat-band{grid-template-columns:1fr}
  .stat-band .score + .score,.scores .score + .score{border-left:0;border-top:1px solid var(--line)}
  .stat-row{grid-template-columns:1fr;gap:8px}
  .site-card{padding:12px 0}
  .incident,.incident:has(> :nth-child(4):last-child){grid-template-columns:40px 1fr auto}
  .incident > a:last-child,.incident .chev,.incident > span:last-child{display:none}
  .site-card{grid-template-columns:32px minmax(0,1fr) auto}
  .site-card > span:last-child{display:none}
  .incident .inc-host,.incident .inc-body{grid-column:2}
  .incident .pill{grid-column:3;grid-row:1 / span 2}
  .score{padding:16px 16px;column-gap:10px}
  .score::before{width:40px;height:40px}
  .score > b{font-size:1.45rem}
  .steps{flex-direction:column}
  .steps li{font-size:12px;padding:10px 10px;letter-spacing:0}
  .steps li b{font-size:13px}
  .form-row{grid-template-columns:1fr}
  .form-row button{padding:14px;min-height:44px;width:100%}
  .form-row input,.form-row select{padding:14px;min-height:44px;font-size:16px}
  .chip{padding:10px 12px;min-height:44px}
  .btn{padding:12px 14px;min-height:44px}
  .actions{gap:8px}
  .actions .btn,.actions a.btn{flex:1 1 calc(50% - 8px);justify-content:center;text-align:center}
  .actions .btn.primary,.actions a.btn.primary{flex:1 1 100%}
  .pack-file{grid-template-columns:1fr}
  .loading{padding:12px;align-items:end}
  .loading .box{padding:16px 14px;max-height:min(92dvh, 640px);overflow:auto}
  .loading strong{font-size:1.05rem}
  .scan-meta{flex-direction:column;gap:4px}
  .scan-steps li{font-size:13px}
  .table-wrap{-webkit-overflow-scrolling:touch}
  table.data{font-size:12px}
  table.data th,table.data td{padding:8px 6px}
  .fp{display:block;word-break:break-all}
  .footer{gap:8px 12px}
  .who{display:none}
}
@media(max-width:420px){
  .pipeline{grid-template-columns:1fr}
  .stat-row{grid-template-columns:1fr}
  .nav{gap:0 2px;font-size:13px}
  .nav a{padding:10px 8px}
  .brand{font-size:16px}
  .mark{width:28px;height:28px;font-size:14px}
  .steps li span,.steps li{line-height:1.2}
}
@media print{
  .topbar,.top .nav,.nav,.rail,.actions,.loading,.filter,details.block:not([open]){display:none!important}
  .app-shell .topbar,.app-main{margin-left:0}
  body{background:#fff;color:#111}
  .card,details.block,.score,.pack-file,.prose{background:#fff;border-color:#ccc;box-shadow:none}
  a{color:#06c}
}

/* SITEMAPPER EDITORIAL SYSTEM — 2026-11-19
   Intent: clarity over chrome, action over video, evidence over invented scores.
   Scoped to public pages. Signed-in app layouts, semantics, severity palettes and forms remain unchanged. */
body.site-public{
  --bg:#f5f7fc;--panel:#ffffff;--line:#d5dceb;--text:#19243d;--mute:#596981;
  --accent:#3559df;--accent-bg:#e9edff;--radius:11px;--btn-radius:6px;
  background:var(--bg);color:var(--text);
}
.site-public .topbar{background:rgba(250,251,255,.96);border-bottom-color:#dbe2ef;backdrop-filter:blur(13px)}
.site-public .topbar-inner{max-width:1260px;padding-top:13px;padding-bottom:13px}
.site-public .brand{font:750 22px/1 var(--serif);letter-spacing:-.04em;color:#172744}
.site-public .brand .mark{width:37px;height:37px}
.site-public .nav{font:650 13px/1.2 var(--sans);flex-wrap:nowrap;gap:5px}
.site-public .nav a{color:#53647d;padding:11px 12px;border-radius:5px}
.site-public .nav a:hover,.site-public .nav a.on{color:#294dd0;background:#e9eeff}
.site-public .nav .nav-login{border:1px solid #acbad8;color:#3150c0;background:transparent;margin-left:10px;padding:11px 16px}
.site-public .nav .nav-login:hover{background:#2342b1;color:#fff}
.site-public .wrap.home{max-width:1260px;padding-top:0;padding-bottom:42px}
.site-public .wrap:not(.home){max-width:880px}
.site-public .wrap:not(.home) > h1{font:500 clamp(2.7rem,5.5vw,4.3rem)/.99 var(--serif);letter-spacing:-.05em;max-width:15ch;margin:13px 0 24px}
.site-public .wrap:not(.home) .lede{max-width:56ch;font-size:17px;line-height:1.7;color:#566983}
.site-public .wrap:not(.home) .card{box-shadow:none;background:#fdfefe;border-color:#d9e0ed}
.site-public .wrap:not(.home) .card h2,.site-public .wrap:not(.home) .prose h2{font-family:var(--serif);font-size:clamp(1.4rem,3vw,1.85rem);font-weight:550;letter-spacing:-.03em;color:#24375a}
.site-public .owner-story{background:#e8edfb;border-color:#ccd7ef}
.site-public .owner-story h2{color:#203858}
.site-public .owner-story p{color:#5d6c83}
.site-public .chip:hover{border-color:var(--accent)}
.site-public .form-row button:hover{background:#2648bd}
.site-public a:focus-visible,.site-public button:focus-visible,.site-public input:focus-visible,.site-public summary:focus-visible{outline:3px solid #a95e39;outline-offset:3px}
.site-public .footer{margin-top:42px;padding-top:23px;border-color:#ccd5e6}
.site-public .footer a{color:#3556c5}
.sm-hero{display:grid;grid-template-columns:minmax(0,1.16fr) minmax(310px,.84fr);gap:clamp(20px,3.4vw,45px);padding:clamp(38px,6vw,79px) 0 35px;align-items:stretch}
.sm-hero-main{min-width:0;display:flex;flex-direction:column;align-items:stretch}
.sm-overline{display:flex;align-items:center;gap:9px;font:750 11px/1.5 var(--mono);letter-spacing:.095em;text-transform:uppercase;color:#4c65a0;margin:0}
.sm-status-pip{width:8px;height:8px;background:#4b6deb;border-radius:50%;box-shadow:0 0 0 4px #e1eaff;flex-shrink:0}
.sm-overline-index{color:#8a91a4;font-weight:500}
.site-public .sm-hero h1{font:500 clamp(3.9rem,6.3vw,6.9rem)/.94 var(--serif);letter-spacing:-.066em;color:#142343;margin:27px 0 24px;max-width:12ch}
.sm-hero h1 em,.sm-section-heading h2 em,.sm-close h2 em{font-weight:400;color:#5876db}
.sm-hero-lead{max-width:54ch;font:400 clamp(16px,1.45vw,18px)/1.7 var(--sans);color:#586a86;margin:0 0 27px}
.sm-check{background:#fdfefe;border:1px solid #ced8e9;padding:21px 21px 15px;border-radius:10px;box-shadow:0 5px 0 rgba(47,71,50,.045)}
.sm-form label{display:block;font:750 12px/1.4 var(--sans);color:#1a2b49;letter-spacing:.02em;margin-bottom:9px}
.sm-form.form-row{display:block}
.sm-form-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
.sm-form-controls input{border:1px solid #c8d4eb;padding:15px 13px;font:15px/1.3 var(--sans);border-radius:5px;background:#fff;min-height:53px}
.sm-form-controls input::placeholder{color:#909bb0}
.sm-form-controls button{font:750 14px/1 var(--sans);min-height:53px;padding:0 22px;border-radius:5px;background:#3559df;color:white;white-space:nowrap}
.sm-form-controls button span{margin-left:6px;font-size:16px}
.sm-form-note{font-size:12px;line-height:1.5;color:#3658bc;margin:13px 0 0}
.sm-form-note>span:first-child{color:#4a72d9;font-size:9px}
.sm-dot-sep{padding:0 4px;color:#91a2c9}
.sm-form-fine{font-size:11.5px;line-height:1.55;color:#64728a;margin:9px 0 0;max-width:65ch}
.sm-try{display:flex;gap:10px 12px;flex-wrap:wrap;align-items:center;padding-top:21px;font:12px/1.5 var(--sans);color:#65758d}
.sm-try .chip{background:transparent;color:#3658be;border:1px solid #d1d9ea;font-weight:650;border-radius:5px;padding:9px 11px}
.sm-evidence{display:flex;flex-direction:column;background:#111c36;border-radius:8px;color:#f3f6ff;padding:clamp(24px,3.1vw,39px);position:relative;overflow:hidden;min-width:0;border:1px solid #2d4069}
.sm-evidence:after{content:"";position:absolute;width:200px;height:200px;right:-100px;top:-110px;border:1px solid rgba(156,179,252,.13);border-radius:50%;box-shadow:0 0 0 35px rgba(156,179,252,.04),0 0 0 70px rgba(156,179,252,.026);pointer-events:none}
.sm-evidence-top{display:flex;align-items:center;justify-content:space-between;gap:12px;font:650 10px/1.4 var(--mono);letter-spacing:.05em;color:#b4c7ff}
.sm-evidence-mark{color:#c0d0ff;font-weight:750}
.sm-evidence-label{color:#a1b1d2;text-align:right}
.sm-evidence-intro{position:relative;margin:52px 0 26px;max-width:26ch}
.sm-evidence-dash{display:block;font:400 36px/1 var(--serif);color:#f7b77f}
.sm-evidence-intro p{font:500 clamp(1.8rem,3vw,2.85rem)/1.06 var(--serif);letter-spacing:-.03em;color:#f3f6ff;margin:12px 0 0}
.sm-evidence-intro p i{color:#9fbaff;font-weight:400}
.sm-inspect{list-style:none;padding:0;margin:auto 0 0}
.sm-inspect li{display:flex;gap:15px;align-items:center;border-top:1px solid #344768;padding:17px 0}
.sm-inspect-count{font:600 11px/1 var(--mono);color:#a3b8fb;min-width:24px}
.sm-inspect strong{font:650 15px/1.25 var(--sans);display:block;color:#f5f7ff}
.sm-inspect small{font:12px/1.5 var(--sans);display:block;color:#b6c5df;margin-top:4px}
.sm-inspect-symbol{margin-left:auto;font:18px/1 var(--serif);color:#aabaf4}
.sm-evidence-foot{border-top:1px solid #344768;padding-top:18px;margin:5px 0 0;color:#b7c8ef;font:650 11px/1.5 var(--mono);letter-spacing:.025em}
.sm-evidence-ring{display:inline-block;border:1.5px solid #c3d3fc;border-radius:50%;width:8px;height:8px;vertical-align:0;margin-right:5px}
.sm-signal-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;border-top:1px solid #d4ddeb;border-bottom:1px solid #d4ddeb;padding:18px 0;margin-top:10px}
.sm-signal-strip span{display:flex;align-items:center;gap:10px;padding:5px 12px;font:650 13px/1.3 var(--sans);color:#546b88;border-right:1px solid #d0d9e9}
.sm-signal-strip span:first-child{padding-left:0}
.sm-signal-strip span:last-child{border:0}
.sm-signal-strip b{font:600 11px/1 var(--mono);color:#6e88cb}
.sm-section{padding:clamp(58px,8vw,106px) 0;border-bottom:1px solid #d9e0ef}
.sm-section-heading{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(250px,.75fr);gap:15px 55px;align-items:end;margin-bottom:34px}
.sm-section-heading .sm-overline{grid-column:1/-1}
.sm-section-heading h2,.sm-incident h2{font:500 clamp(2.85rem,5.1vw,5.4rem)/.99 var(--serif);letter-spacing:-.055em;color:#1e3052;margin:0}
.sm-section-heading p:last-child{color:#5b6b87;font:16px/1.7 var(--sans);max-width:43ch;margin:0 0 5px}
.sm-how-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}
.sm-step{background:#ffffff;border:1px solid #d6dfed;border-radius:7px;padding:27px 25px 22px;min-height:270px;display:flex;flex-direction:column}
.sm-step-index{font:700 11px/1.4 var(--mono);letter-spacing:.08em;color:#718ad4}
.sm-step h3{font:500 clamp(1.7rem,2.7vw,2.45rem)/1.05 var(--serif);letter-spacing:-.035em;color:#1b315b;margin:37px 0 12px}
.sm-step p{font:14px/1.65 var(--sans);color:#5a6b85;margin:0 0 22px}
.sm-step-line{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:auto;font:650 10px/1.2 var(--mono);color:#6985c7;letter-spacing:.045em}
.sm-step-line span:nth-child(even){color:#a6b5d8}
.sm-incident{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:clamp(20px,5vw,70px);align-items:center}
.sm-incident h2{font-size:clamp(2.5rem,4.3vw,4.6rem);margin:20px 0}
.sm-incident-copy>p:not(.sm-overline){font:15px/1.75 var(--sans);color:#5a6e89}
.sm-link-row{display:flex;gap:12px 22px;flex-wrap:wrap;margin-top:28px}
.sm-link-row a{font:700 13px/1.5 var(--sans);color:#3558c2;text-underline-offset:4px;text-decoration:underline}
.sm-real-demo{border-radius:8px;overflow:hidden;border:1px solid #586d90;background:#182440;color:#ecf2ff}
.sm-demo-head{display:flex;justify-content:space-between;border-bottom:1px solid #3a4d73;padding:16px 20px;color:#b3c3f2;font:650 11px/1.4 var(--mono);letter-spacing:.05em}
.sm-demo-details summary{cursor:pointer;display:flex;align-items:center;gap:18px;padding:31px 22px;list-style:none}
.sm-demo-details summary::-webkit-details-marker{display:none}
.sm-demo-details summary:hover{background:#253a62}
.sm-demo-details summary strong{display:block;font:500 clamp(1.35rem,2.3vw,1.95rem)/1.1 var(--serif);color:#f5f7ff}
.sm-demo-details summary small{display:block;font:12px/1.55 var(--sans);color:#bdcae9;margin-top:8px}
.sm-play-icon{display:grid;place-items:center;flex:none;width:49px;height:49px;border:1px solid #b2c1f8;border-radius:50%;font-size:14px;color:#e5ebff}
.sm-demo-chevron{font:24px/1 var(--serif);color:#ccd8f5;margin-left:auto}
.sm-demo-details[open] .sm-demo-chevron{transform:rotate(180deg)}
.sm-demo-details video{width:100%;aspect-ratio:16/9;display:block;background:#0e1730;object-fit:contain}
.sm-demo-footer{display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap;padding:16px 20px;border-top:1px solid #3a4d73;font:600 10px/1.5 var(--mono);letter-spacing:.03em;color:#aebfe7}
.sm-limits .sm-section-heading{grid-template-columns:1fr}
.sm-limit-columns{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.sm-limit-col{padding:25px 0;border-top:2px solid #3357c0}
.sm-limit-col:last-child{border-color:#db865d}
.sm-limit-tag{font:750 11px/1.5 var(--mono);letter-spacing:.07em;color:#3c5dbc;margin:0 0 22px}
.sm-limit-col:last-child .sm-limit-tag{color:#9e603e}
.sm-limit-col ul{list-style:none;margin:0;padding:0}
.sm-limit-col li{position:relative;padding:13px 0 13px 23px;border-bottom:1px solid #d9e0ec;color:#536783;font:14px/1.5 var(--sans)}
.sm-limit-col li:before{content:'→';position:absolute;left:0;color:#6e89d7}
.sm-close{display:grid;grid-template-columns:1.5fr .5fr;align-items:end;gap:25px;background:#e7ebf7;border:1px solid #d1d9ec;padding:clamp(25px,4vw,48px);border-radius:9px;margin:55px 0 25px}
.sm-close h2{font:500 clamp(2.55rem,4.4vw,4.75rem)/1 var(--serif);letter-spacing:-.05em;max-width:15ch;color:#172e55;margin:16px 0}
.sm-close p:not(.sm-overline){font:15px/1.65 var(--sans);color:#586d89;max-width:55ch;margin:0}
.sm-close-actions{display:flex;flex-direction:column;gap:12px;min-width:190px}
.sm-close-primary{background:#3559df;color:#fff!important;display:flex;justify-content:space-between;gap:10px;align-items:center;text-decoration:none!important;border-radius:5px;padding:17px 20px;font:700 13px/1.4 var(--sans)}
.sm-close-primary:hover{background:#243fa8}
.sm-close-secondary{text-align:center;color:#385ac2!important;font:700 13px/1.5 var(--sans);padding:8px}
.sm-public-proof{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px 20px;color:#68778f;font:11.5px/1.6 var(--sans);padding:9px 0 0}
.sm-public-proof strong{color:#344f80}
.sm-public-proof a{text-decoration:underline;text-underline-offset:3px}
@media(max-width:1040px){
  .sm-hero{grid-template-columns:minmax(0,1.06fr) minmax(290px,.94fr);gap:24px}
  .site-public .sm-hero h1{font-size:clamp(3.65rem,6.9vw,5.4rem)}
  .sm-evidence{padding:22px}
  .sm-evidence-intro{margin-top:35px}
  .sm-inspect li{padding:13px 0}
}
@media(max-width:800px){
  .site-public .nav{width:auto;flex-wrap:wrap;justify-content:flex-end;gap:0}
  .site-public .topbar-inner{flex-wrap:wrap;gap:8px}
  .sm-hero{grid-template-columns:1fr;padding-top:38px;gap:23px}
  .site-public .sm-hero h1{font-size:clamp(3.5rem,9vw,5.5rem)}
  .sm-evidence{min-height:430px}
  .sm-evidence-intro{margin:21px 0 8px}
  .sm-section-heading,.sm-incident{grid-template-columns:1fr}
  .sm-section-heading p:last-child{max-width:66ch}
  .sm-signal-strip{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:10px}
  .sm-signal-strip span:nth-child(2){border:0}
}
@media(max-width:640px){
  .site-public .topbar-inner{padding:12px 16px 9px;justify-content:space-between}
  .site-public .brand{font-size:21px}
  .site-public .nav{width:100%;display:grid;grid-template-columns:repeat(4,1fr);gap:2px;justify-items:stretch;text-align:center}
  .site-public .nav a{font-size:12px;min-height:42px;padding:10px 5px;justify-content:center}
  .site-public .nav .nav-login{margin:0;grid-column:span 4;min-height:39px;margin-top:3px}
  .site-public .wrap.home{padding-top:0;padding-left:17px;padding-right:17px}
  .sm-hero{padding:26px 0 22px;gap:20px}
  .site-public .sm-hero h1{font-size:clamp(3.25rem,12vw,4.3rem);line-height:.98;margin:19px 0}
  .sm-hero-lead{font-size:15px;line-height:1.65;margin-bottom:18px}
  .sm-check{padding:17px 14px 14px}
  .sm-form-controls{grid-template-columns:1fr}
  .sm-form-controls button{width:100%;min-height:51px}
  .sm-form-controls input{min-height:51px}
  .sm-try{padding-top:13px}
  .sm-evidence{min-height:390px;padding:21px}
  .sm-evidence-intro{margin-top:20px}
  .sm-evidence-intro p{font-size:2.1rem}
  .sm-evidence-label{font-size:9px}
  .sm-signal-strip{gap:10px;padding:12px 0}
  .sm-signal-strip span{padding:5px 6px;font-size:12px}
  .sm-section{padding:53px 0}
  .sm-section-heading h2,.sm-incident h2{font-size:clamp(2.6rem,9vw,3.8rem)}
  .sm-how-grid,.sm-limit-columns{grid-template-columns:1fr}
  .sm-step{min-height:190px;padding:21px}
  .sm-step h3{margin-top:21px}
  .sm-close{display:block;padding:24px 19px;margin:34px 0 15px}
  .sm-close h2{font-size:2.8rem}
  .sm-close-actions{margin-top:23px}
}
@media(max-width:390px){
  .sm-overline-index{display:none}
  .site-public .sm-hero h1{font-size:3.3rem}
  .site-public .nav a{font-size:11px}
}
@media(prefers-reduced-motion:reduce){.site-public *{scroll-behavior:auto!important;transition:none!important}}
@media print{.site-public .sm-evidence,.site-public .sm-real-demo{background:white;color:#111;border:1px solid #aaa}.site-public .sm-inspect strong,.site-public .sm-evidence-intro p{color:#111}}

/* Sitemapper is a topology and evidence instrument, not a generic green editorial product. */
.site-public .brand{font-family:var(--sans);font-weight:600;letter-spacing:-.055em}
.site-public .nav a.on{box-shadow:inset 0 -2px 0 #3559df}
.site-public .sm-hero h1{font-family:var(--sans);font-weight:600;letter-spacing:-.078em;line-height:.97;max-width:12.5ch;font-size:clamp(3.5rem,6.5vw,6.4rem)}
.site-public .sm-hero h1 em{font-family:var(--sans);font-weight:500;font-style:normal;color:#3559df}
.site-public .sm-section-heading h2,.site-public .sm-incident h2,.site-public .sm-close h2{font-family:var(--sans);font-weight:600;letter-spacing:-.068em}
.site-public .sm-section-heading h2 em,.site-public .sm-close h2 em{font-family:var(--sans);font-style:normal;font-weight:500;color:#4266e1}
.site-public .sm-evidence{background:#111c36;border-color:#253960;box-shadow:0 12px 30px rgba(19,36,77,.08)}
.site-public .sm-evidence:after{border-color:rgba(177,196,255,.13);box-shadow:0 0 0 35px rgba(141,170,255,.03),0 0 0 70px rgba(141,170,255,.015)}
.site-public .sm-evidence-intro{margin:30px 0 20px;max-width:100%}
.site-public .sm-evidence-intro p{font-family:var(--sans);font-weight:500;font-size:clamp(1.6rem,2.3vw,2.2rem);line-height:1.11;max-width:22ch}
.site-public .sm-evidence-intro p i{font-family:var(--sans);font-style:normal;color:#abbcff}
.site-public .sm-evidence-intro>span{display:block;font:12px/1.5 var(--sans);color:#b4c1dd;margin-top:12px}
.site-public .sm-map-visual{margin:4px 0 25px}
.site-public .sm-map-visual svg{width:100%;height:auto;display:block;border-radius:8px}
.site-public .sm-inspect{margin:0}
.site-public .sm-inspect li{padding:12px 0}
.site-public .sm-evidence-foot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;letter-spacing:0}
.site-public .sm-evidence-foot span{color:#e9ad87}
.site-public .sm-overline,.site-public .sm-step-index,.site-public .sm-step-line{font-family:var(--mono)}
.site-public .sm-status-pip{background:#4b6deb;box-shadow:0 0 0 4px #e2e8fe}
.site-public .sm-form-controls button,.site-public .sm-close-primary{background:#3559df}
.site-public .sm-form-controls button:hover,.site-public .sm-close-primary:hover{background:#2546bf}
.site-public .sm-hero-main .sm-check{box-shadow:0 5px 0 rgba(42,79,182,.035)}
.site-public .sm-real-demo{background:#142343;border-color:#354a78}
.site-public .sm-demo-head,.site-public .sm-demo-footer{border-color:#354b72}
.site-public .sm-demo-details summary:hover{background:#243a6a}
.site-public .sm-demo-details video{background:#101a34}
.site-public .sm-close{background:#e9edf9;border-color:#cfdaf4}
.site-public .sm-step{border-top:3px solid #3559df}
.site-public .sm-step:nth-child(2){border-top-color:#8a9bd4}
.site-public .sm-step:nth-child(3){border-top-color:#d88661}
.site-public .sm-evidence-top,.site-public .sm-evidence-foot{font-family:var(--mono)}
.site-public .sm-limits .sm-limit-col:first-child{border-color:#3559df}
.site-public .sm-limits .sm-limit-col:last-child{border-color:#d88661}
.site-public .wrap:not(.home)>h1{font-family:var(--sans);font-weight:600;letter-spacing:-.065em}
.site-public .owner-story h2{font-family:var(--sans);letter-spacing:-.05em;font-weight:600}
@media(max-width:640px){
 .site-public .sm-hero h1{font-size:clamp(3.1rem,11.5vw,4.55rem);line-height:.97;letter-spacing:-.078em}
 .site-public .sm-evidence-intro p{font-size:1.8rem}
 .site-public .sm-evidence{min-height:auto}
 .site-public .sm-map-visual{margin-bottom:18px}
}

/* Sitemapper product pages: same topology instrument, clearer choices. */
.site-public .wrap.wide{max-width:1260px}
.site-public .sm-pricing-intro,.site-public .sm-compare-intro{padding:55px 0 35px;border-bottom:1px solid #d6def0}
.site-public .sm-pricing-intro h1,.site-public .sm-compare-intro h1{
  font:600 clamp(3.25rem,6.2vw,6.4rem)/.98 var(--sans);
  letter-spacing:-.075em;max-width:15ch;color:#142343;margin:20px 0 22px
}
.site-public .sm-pricing-intro h1 span,.site-public .sm-compare-intro h1 span{color:#3559df}
.site-public .sm-pricing-lede,.site-public .sm-compare-lead{max-width:70ch;color:#596b89;font:16px/1.75 var(--sans);margin:0}
.site-public .sm-pricing-flow{display:flex;gap:20px;flex-wrap:wrap;margin-top:30px}
.site-public .sm-pricing-flow span{padding:11px 16px;background:#e7ecf9;border:1px solid #d5def1;color:#33496f;border-radius:5px;font:650 12px/1.4 var(--sans)}
.site-public .sm-pricing-flow b{color:#4669da;font:600 11px var(--mono);margin-right:9px}
.site-public .sm-plan-intro{display:flex;align-items:baseline;justify-content:space-between;gap:20px 40px;padding:48px 0 22px}
.site-public .sm-plan-intro h2{margin:0;font:600 clamp(2rem,3.25vw,3rem)/1.1 var(--sans);letter-spacing:-.055em;color:#1b2c4a}
.site-public .sm-plan-intro p{max-width:45ch;margin:0;color:#5d6d85;font:14px/1.7 var(--sans)}
.site-public .sm-plan-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.site-public .sm-price-card{display:flex;flex-direction:column;border:1px solid #d4dceb;background:#fff;border-radius:8px;padding:23px 20px 20px;min-width:0}
.site-public .sm-price-card--highlight{border-color:#496ae1;box-shadow:0 0 0 1px #496ae1,0 12px 25px rgba(44,73,154,.06)}
.site-public .sm-price-card-head{border-bottom:1px solid #e3e8f2;padding-bottom:18px;min-height:185px}
.site-public .sm-plan-id{font:650 10px/1.4 var(--mono);color:#697d9e;letter-spacing:.055em}
.site-public .sm-price-card h2{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:17px 0 6px;font:600 30px/1.1 var(--sans);letter-spacing:-.06em;color:#182949}
.site-public .sm-price-for{font:700 9px/1.5 var(--mono);letter-spacing:.03em;color:#3559df;background:#e7edff;padding:5px 6px;border-radius:3px}
.site-public .sm-price-outcome{font:13px/1.55 var(--sans);color:#64738a;min-height:42px;margin:0 0 13px}
.site-public .sm-price-card .plan-price{font-size:13px;color:#5c6a81;display:block}
.site-public .sm-price-card .plan-price b{color:#152844;font:650 28px/1.2 var(--sans);letter-spacing:-.04em}
.site-public .sm-price-essentials{margin:17px 0 0;list-style:none;padding:0;flex:1}
.site-public .sm-price-essentials li{position:relative;padding:8px 0 8px 20px;border-bottom:1px solid #eef0f6;font:12.5px/1.45 var(--sans);color:#52637f}
.site-public .sm-price-essentials li:before{content:"✓";color:#496ad2;position:absolute;left:0;font-weight:800}
.site-public .sm-plan-details{border-bottom:1px solid #e6eaf3}
.site-public .sm-plan-details summary{cursor:pointer;list-style:none;padding:17px 0;font:700 12px/1.4 var(--sans);color:#3758bb;display:flex;align-items:center;justify-content:space-between;gap:6px}
.site-public .sm-plan-details summary::-webkit-details-marker{display:none}
.site-public .sm-plan-details summary>span{font:600 22px/1 var(--sans);color:#8195c9}
.site-public .sm-plan-details[open] summary>span{transform:rotate(45deg)}
.site-public .sm-plan-details .list{margin:3px 0 16px;padding-left:17px}
.site-public .sm-plan-details .list li{font-size:12px;line-height:1.6;color:#5a6b88}
.site-public .sm-price-actions{display:flex;flex-direction:column;margin-top:19px;gap:9px}
.site-public .sm-price-actions .btn,.site-public .sm-price-actions button{font-size:12px;line-height:1.3;width:100%;min-height:45px;background:#3559df;color:white;border-color:#3559df;border-radius:5px;text-align:center}
.site-public .sm-price-actions form{width:100%}
.site-public .sm-price-actions form:nth-child(2) button{background:#fff;color:#3559df;border:1px solid #c6d4fa}
.site-public .sm-price-actions .btn:hover,.site-public .sm-price-actions button:hover{background:#2444b6;color:white}
.site-public .sm-price-note{margin:35px 0;padding:22px 24px;background:#e9effa;border-left:3px solid #5674e2;font:13px/1.65 var(--sans);color:#516783}
.site-public .sm-price-note strong{display:block;color:#203452;margin-bottom:5px}
.site-public .sm-price-note a{color:#3359c5;font-weight:700;text-decoration:underline}
.site-public .sm-compare-intro{padding-bottom:55px}
.site-public .sm-compare-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:42px 0}
.site-public .sm-compare-item{display:flex;flex-direction:column;border:1px solid #d3ddee;background:white;border-radius:8px;padding:27px 25px 24px;min-height:460px;border-top:3px solid #3559df}
.site-public .sm-compare-item:nth-child(2){border-top-color:#879bcf}
.site-public .sm-compare-item:nth-child(3){border-top-color:#dd926f}
.site-public .sm-compare-step{font:650 10px/1.5 var(--mono);color:#6c83b7}
.site-public .sm-compare-item h2{margin:28px 0 14px;font:600 clamp(1.8rem,2.8vw,2.6rem)/1.1 var(--sans);letter-spacing:-.055em;color:#1c2f4c}
.site-public .sm-compare-item p{font:14px/1.7 var(--sans);color:#5e6b80}
.site-public .sm-compare-item ul{padding-left:18px;margin:14px 0 26px;color:#51627d;font:13px/1.6 var(--sans)}
.site-public .sm-compare-item li{margin:7px 0}
.site-public .sm-compare-link{margin-top:auto;display:block;text-decoration:none;background:#edf1fe;color:#2f54ca;padding:13px 12px;font:750 13px/1.4 var(--sans);text-align:center;border-radius:5px}
.site-public .sm-compare-link:hover{background:#dfe8ff}
.site-public .sm-compare-clarity{display:grid;grid-template-columns:200px 1fr auto;gap:20px;align-items:center;padding:28px 0 48px;border-top:1px solid #d2dceb}
.site-public .sm-compare-clarity>span{font:700 11px/1.5 var(--mono);letter-spacing:.045em;color:#bd7851}
.site-public .sm-compare-clarity strong{color:#243550}
.site-public .sm-compare-clarity p{font:13px/1.7 var(--sans);color:#60718d;margin:6px 0 0}
.site-public .sm-compare-clarity a{font-weight:700;font-size:13px;white-space:nowrap}
@media(max-width:1020px){.site-public .sm-plan-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.site-public .sm-compare-clarity{grid-template-columns:1fr 2fr}.site-public .sm-compare-clarity a{grid-column:2}}
@media(max-width:720px){.site-public .sm-compare-grid{grid-template-columns:1fr}.site-public .sm-compare-item{min-height:0}.site-public .sm-compare-item h2{margin-top:16px}.site-public .sm-plan-intro{display:block}.site-public .sm-plan-intro p{margin-top:14px}.site-public .sm-pricing-intro,.site-public .sm-compare-intro{padding:33px 0 25px}}
@media(max-width:580px){.site-public .sm-plan-grid{grid-template-columns:1fr}.site-public .sm-price-card-head{min-height:0}.site-public .sm-price-outcome{min-height:0}.site-public .sm-pricing-intro h1,.site-public .sm-compare-intro h1{font-size:clamp(2.65rem,10.3vw,4rem)}.site-public .sm-compare-clarity{display:block}.site-public .sm-compare-clarity>span{display:block;margin-bottom:14px}.site-public .sm-compare-clarity a{display:block;margin-top:18px}}

/* Final usability pass: get prices on screen quickly and use the builder's real portrait. */
.site-public .sm-pricing-intro{padding:36px 0 25px}
.site-public .sm-pricing-intro h1{font-size:clamp(2.85rem,5vw,4.7rem);max-width:21ch;margin:18px 0 15px}
.site-public .sm-pricing-flow{display:none}
.site-public .sm-plan-intro{padding:25px 0 17px}
.site-public .sm-pricing-lede{max-width:64ch}
.site-public .owner-story__layout{grid-template-columns:158px minmax(0,1fr);align-items:start;gap:26px}
.site-public .sm-builder-photo{width:158px;height:182px;object-fit:cover;object-position:center top;border-radius:7px;border:1px solid #d3ddef}
.site-public .wrap:not(.home) .owner-story h2,
.site-public .wrap:not(.home) .card h2{font-family:var(--sans);font-weight:600;letter-spacing:-.045em}
@media(max-width:650px){
 .site-public .sm-pricing-intro{padding:26px 0 18px}
 .site-public .sm-pricing-intro h1{font-size:clamp(2.7rem,9.7vw,3.55rem)}
 .site-public .sm-plan-intro{padding:21px 0 15px}
 .site-public .sm-plan-intro h2{font-size:1.7rem}
 .site-public .sm-pricing-lede{font-size:14px;line-height:1.6}
 .site-public .owner-story__layout{grid-template-columns:92px minmax(0,1fr);gap:14px}
 .site-public .sm-builder-photo{width:92px;height:110px}
}
@media(max-width:390px){.site-public .owner-story__layout{display:block}.site-public .sm-builder-photo{margin:0 0 15px}}

`;
}

function fonts(): string {
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,500;600;700&display=swap" rel="stylesheet">`;
}

function brandMark(): string {
  return `<img class="mark" src="/brand/logo-mark.png" width="32" height="32" alt="" aria-hidden="true">`;
}

function initialsFromEmail(email?: string): string {
  const raw = (email || '').trim();
  if (!raw) return 'U';
  const local = raw.split('@')[0] || raw;
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function railSvg(kind: 'home' | 'sites' | 'changes' | 'alerts' | 'settings'): string {
  const paths: Record<typeof kind, string> = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
    sites:
      '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
    changes: '<path d="M4 19V10M10 19V5M16 19v-6M3 19h18"/>',
    alerts: '<path d="M12 3a6 6 0 0 1 6 6c0 7 2 8 2 8H4s2-1 2-8a6 6 0 0 1 6-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M4.9 6.3l1.5 1.5M17.6 16.2l1.5 1.5M3 12h2M19 12h2M4.9 17.7l1.5-1.5M17.6 7.8l1.5-1.5"/>',
  };
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind]}</svg>`;
}

function publicNav(path: string): string {
  const item = (href: string, label: string, active: boolean, cls = '') =>
    `<a href="${href}"${active ? ' aria-current="page" class="on '+cls+'"' : cls ? ' class="'+cls+'"' : ''}>${label}</a>`;
  return `<nav class="nav" aria-label="Primary">
    ${item('/', 'Scan a site', path === '/' || path.startsWith('/api/report') || path.startsWith('/r/'))}
    ${item('/#how-it-works', 'How it works', false)}
    ${item('/pricing', 'Pricing', path.startsWith('/pricing'))}
    ${item('/about', 'About', path.startsWith('/about'))}
    ${item('/login', 'Sign in', path.startsWith('/login'), 'nav-login')}
  </nav>`;
}

function appRail(path: string, userEmail?: string): string {
  const on = (id: string) => {
    if (id === 'home') return path === '/app' || path === '/app/';
    if (id === 'sites') return path.startsWith('/app/sites') && !path.includes('/changes');
    if (id === 'changes') return path.includes('/changes');
    if (id === 'alerts') return path.startsWith('/app/settings');
    if (id === 'settings')
      return path.startsWith('/app/settings') || path.startsWith('/app/billing') || path.startsWith('/app/gsc');
    return false;
  };
  const item = (href: string, id: 'home' | 'sites' | 'changes' | 'alerts' | 'settings', label: string) =>
    `<a href="${href}"${on(id) ? ' class="on"' : ''} title="${label}" aria-label="${label}">${railSvg(id)}<span>${label}</span></a>`;
  return `<nav class="rail" aria-label="App">
    <a class="rail-brand" href="/app" aria-label="Sitemapper home">${brandMark()}</a>
    ${item('/app', 'home', 'Home')}
    ${item('/app/sites', 'sites', 'Sites')}
    ${item('/app/changes', 'changes', 'Changes')}
    ${item('/app/settings#alerts', 'alerts', 'Alerts')}
    ${item('/app/settings', 'settings', 'Settings')}
    <span class="rail-foot"><a href="/app/settings" class="initials" aria-label="Account">${escapeHtml(initialsFromEmail(userEmail))}</a></span>
  </nav>`;
}

function appTopbar(userEmail?: string, workspaceName?: string, plan?: string): string {
  const email = userEmail || '';
  const local = email.includes('@') ? email.split('@')[0] : email;
  const who = workspaceName || local || 'Workspace';
  const planLine = plan
    ? `<div class="account-plan">${escapeHtml(plan.charAt(0).toUpperCase() + plan.slice(1))} plan</div>`
    : '';
  return `<header class="topbar">
    <div class="topbar-inner">
      <a class="brand wordmark" href="/app">${brandMark()} <span>Sitemapper</span></a>
      <div class="topbar-end">
        <a class="btn primary topbar-add" href="/app/sites/new">Add site</a>
        <a class="nav-help" href="/guides/xml-sitemap-checker" title="Help" aria-label="Help">?</a>
        <span class="vdiv" aria-hidden="true"></span>
        <details class="account-menu">
          <summary aria-label="Account">
            <span class="who">${escapeHtml(who)}</span>
            <span class="initials" aria-hidden="true">${escapeHtml(initialsFromEmail(email))}</span>
          </summary>
          <div class="account-menu-panel">
            ${planLine}
            <a href="/app/billing">Billing</a>
            <a href="/app/settings">Settings</a>
            <a href="/app/sites/new">Add site</a>
            <a href="/logout">Sign out</a>
          </div>
        </details>
      </div>
    </div>
  </header>`;
}

function publicTopbar(path: string): string {
  return `<header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/">${brandMark()} Sitemapper</a>
      ${publicNav(path)}
    </div>
  </header>`;
}

function chromeFooter(kind: 'public' | 'app' = 'public'): string {
  if (kind === 'app') {
    return `<footer class="footer">
    <span>
      <a href="/app/sites/new">Add site</a> ·
      <a href="/app/billing">Billing</a> ·
      <a href="/app/settings">Settings</a> ·
      <a href="/logout">Sign out</a>
    </span>
  </footer>`;
  }
  return `<footer class="footer">
    <span>Free check · website safety · <a href="https://oortstack.com">Oortstack</a> · <a href="/about">Built by Bryan Leonard</a></span>
    <span>
      <a href="/robots.txt">robots</a> ·
      <a href="/sitemap.xml">sitemap</a> ·
      <a href="/llms.txt">llms.txt</a> ·
      <a href="/api/stats">stats</a>
    </span>
  </footer>`;
}

export function shell(opts: {
  title: string;
  description: string;
  body: string;
  path?: string;
  jsonLd?: unknown[];
  noindex?: boolean;
  activeStep?: number;
  chrome?: 'public' | 'app';
  userEmail?: string;
  firstSiteId?: string;
  workspaceName?: string;
  plan?: string;
}): string {
  const path = opts.path || '/';
  const canonical = `${ORIGIN}${path === '/' ? '' : path}`;
  const jsonLd = (opts.jsonLd || [])
    .map((block) => `<script type="application/ld+json">${JSON.stringify(block).replace(/</g, '\\u003c')}</script>`)
    .join('');
  const robots = opts.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large';
  const isApp = opts.chrome === 'app';
  const frame = isApp
    ? `${appRail(path, opts.userEmail)}
${appTopbar(opts.userEmail, opts.workspaceName, opts.plan)}
<div class="app-main">
<div class="wrap">
  ${opts.body}
  ${chromeFooter('app')}
</div>
</div>`
    : `${publicTopbar(path)}
<div class="wrap">
  ${opts.body}
  ${chromeFooter('public')}
</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeHtml(opts.description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Sitemapper">
<meta property="og:title" content="${escapeHtml(opts.title)}">
<meta property="og:description" content="${escapeHtml(opts.description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${ORIGIN}/brand/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(opts.title)}">
<meta name="twitter:description" content="${escapeHtml(opts.description)}">
<meta name="twitter:image" content="${ORIGIN}/brand/og.jpg">
<meta name="theme-color" content="#f7f4ed">
<link rel="icon" href="/brand/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png" sizes="180x180">
${fonts()}
<style>${css()}</style>
${jsonLd}
</head>
<body${isApp ? ' class="app-shell"' : ' class="site-public"'}>
<div class="loading" id="loading" aria-live="polite">
  <div class="box">
    <div class="pulse" aria-hidden="true"></div>
    <p class="scan-kicker" id="scan-kicker">Free survey</p>
    <strong id="scan-title">Starting survey</strong>
    <p id="scan-detail">robots.txt, then XML sitemaps, then a live page sample. Typical scans finish in 8–40 seconds.</p>
    <div class="scan-bar" id="scan-barwrap" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-labelledby="scan-title">
      <i id="scan-bar"></i>
    </div>
    <p class="scan-meta"><span id="scan-pct">0%</span><span id="scan-time">0s elapsed</span><span id="scan-eta">estimating…</span></p>
    <ol class="scan-steps" id="scan-steps">
      <li data-step="robots">robots.txt</li>
      <li data-step="sitemaps">XML sitemaps</li>
      <li data-step="pages">Live page sample</li>
      <li data-step="score">Score &amp; snapshot</li>
    </ol>
    <button type="button" class="btn scan-dismiss" id="scan-dismiss">Close</button>
  </div>
</div>
${frame}
<script>
(function(){
  var form=document.getElementById('map-form');
  var loading=document.getElementById('loading');
  var abort=null;
  var scanTimer=null;
  var scanStarted=0;
  var lastPercent=0;
  var lastBeat=0;
  var lastStage='';
  var stageStarted=0;
  var stageCurrent=0;
  var stageTotal=0;
  function $(id){return document.getElementById(id);}
  function setScan(ev){
    if(!loading) return;
    loading.removeAttribute('hidden');
    loading.classList.add('on');
    loading.classList.toggle('error', ev.stage==='error');
    var title=$('scan-title');
    var detail=$('scan-detail');
    var bar=$('scan-bar');
    var wrap=$('scan-barwrap');
    var pct=$('scan-pct');
    var eta=$('scan-eta');
    var dismiss=$('scan-dismiss');
    if(ev.stage && ev.stage!==lastStage){
      lastStage=ev.stage;
      stageStarted=Date.now();
      stageCurrent=0;
      stageTotal=0;
    }
    if(typeof ev.current==='number') stageCurrent=ev.current;
    if(typeof ev.total==='number') stageTotal=ev.total;
    if(title) title.textContent=ev.label||'Surveying';
    if(detail) detail.textContent=ev.detail||'';
    var p=typeof ev.percent==='number'?ev.percent:0;
    if(bar) bar.style.width=p+'%';
    if(wrap) wrap.setAttribute('aria-valuenow', String(p));
    if(pct) pct.textContent=p+'%';
    if(dismiss) dismiss.style.display=ev.stage==='error'?'inline-flex':'none';
    var order=['robots','sitemaps','pages','score'];
    var cur=order.indexOf(ev.stage);
    if(ev.stage==='start') cur=0;
    if(ev.stage==='save'||ev.stage==='done') cur=order.length;
    if(ev.stage==='error') cur=-1;
    document.querySelectorAll('#scan-steps li').forEach(function(li){
      var i=order.indexOf(li.getAttribute('data-step'));
      li.classList.remove('on','done');
      if(i>=0 && i<cur) li.classList.add('done');
      if(i===cur) li.classList.add('on');
    });
    if(eta && ev.eta) eta.textContent=ev.eta;
  }
  function tickTime(){
    var el=$('scan-time');
    var eta=$('scan-eta');
    if(!scanStarted) return;
    var s=Math.max(0, Math.round((Date.now()-scanStarted)/1000));
    if(el) el.textContent=s+'s elapsed';
    if(eta && lastPercent>=100){
      eta.textContent='opening report';
    } else if(eta && lastStage==='pages'){
      var stageSeconds=Math.max(1,Math.round((Date.now()-stageStarted)/1000));
      if(stageCurrent>0 && stageTotal>stageCurrent){
        var remain=Math.max(1,Math.round((stageSeconds*(stageTotal-stageCurrent))/stageCurrent));
        eta.textContent=remain<=2?'almost done':'about '+remain+'s left';
      } else if(stageTotal>0 && stageCurrent>=stageTotal){
        eta.textContent='finishing sample';
      } else {
        eta.textContent='checking live sample';
      }
    } else if(eta && (lastStage==='robots'||lastStage==='sitemaps'||lastStage==='start')){
      eta.textContent=Date.now()-lastBeat>18000?'slow origin — still working':'checking sitemap source';
    } else if(eta && (lastStage==='score'||lastStage==='save')){
      eta.textContent='building report';
    }
  }
  function stopScanTimer(){
    if(scanTimer){clearInterval(scanTimer);scanTimer=null;}
  }
  function startScan(site){
    if(!loading || !window.fetch) return;
    if(abort) abort.abort();
    abort=new AbortController();
    scanStarted=Date.now();
    lastBeat=Date.now();
    lastPercent=3;
    lastStage='';
    stageStarted=scanStarted;
    stageCurrent=0;
    stageTotal=0;
    setScan({stage:'start',label:'Starting survey',detail:site,percent:3});
    stopScanTimer();
    scanTimer=setInterval(tickTime,250);
    tickTime();
    var btn=form && form.querySelector('button');
    if(btn){btn.disabled=true;}
    fetch('/api/scan?site='+encodeURIComponent(site),{signal:abort.signal,headers:{accept:'application/x-ndjson'}})
      .then(function(res){
        var type=res.headers.get('content-type')||'';
        if(!res.body || type.indexOf('ndjson')===-1){
          return res.json().then(function(j){
            throw new Error((j && j.error) || ('Survey failed ('+res.status+').'));
          }, function(){ throw new Error('Survey failed ('+res.status+').'); });
        }
        var reader=res.body.getReader();
        var dec=new TextDecoder();
        var buf='';
        function applyLines(lines){
          for(var i=0;i<lines.length;i++){
            if(!lines[i]) continue;
            var ev;
            try{ ev=JSON.parse(lines[i]); }catch(e){ continue; }
            if(typeof ev.percent==='number') lastPercent=ev.percent;
            setScan(ev);
            tickTime();
            if(ev.stage==='done' && ev.shareUrl){
              stopScanTimer();
              window.location.href=ev.shareUrl;
              return true;
            }
            if(ev.stage==='error') throw new Error(ev.error||ev.label||'Survey failed.');
          }
          return false;
        }
        function pump(){
          return reader.read().then(function(chunk){
            lastBeat=Date.now();
            if(chunk.value) buf+=dec.decode(chunk.value,{stream:true});
            if(chunk.done) buf+=dec.decode();
            var lines=buf.split('\\n');
            if(!chunk.done) buf=lines.pop()||'';
            else buf='';
            if(applyLines(lines)) return;
            if(chunk.done) throw new Error('Survey ended without a report. Try again.');
            return pump();
          });
        }
        return pump();
      })
      .catch(function(err){
        if(err && err.name==='AbortError') return;
        stopScanTimer();
        setScan({stage:'error',label:'Could not finish this survey',detail:String(err && err.message || err),percent:lastPercent});
        var eta=$('scan-eta');
        if(eta) eta.textContent='stopped';
        if(btn){btn.disabled=false;btn.textContent='Try again';}
      });
  }
  if(form&&loading){
    form.addEventListener('submit',function(ev){
      var input=form.querySelector('[name="site"]');
      var site=input && input.value;
      if(!site || !window.fetch) {
        var btn=form.querySelector('button');
        if(btn){btn.disabled=true;btn.textContent='Working…';}
        loading.removeAttribute('hidden');
        loading.classList.add('on');
        return;
      }
      ev.preventDefault();
      startScan(site);
    });
  }
  document.querySelectorAll('a.chip[href*="/api/report"]').forEach(function(a){
    a.addEventListener('click',function(ev){
      try{
        var href=a.getAttribute('href')||'';
        var u=new URL(href, window.location.origin);
        var site=u.searchParams.get('site');
        if(!site || !window.fetch) return;
        ev.preventDefault();
        startScan(site);
      }catch(e){}
    });
  });
  var dismiss=$('scan-dismiss');
  if(dismiss&&loading){
    dismiss.addEventListener('click',function(){
      if(abort) abort.abort();
      stopScanTimer();
      loading.classList.remove('on','error');
      var btn=form && form.querySelector('button');
      if(btn) btn.disabled=false;
    });
  }
  document.addEventListener('keydown',function(ev){
    if(ev.key==='Escape' && loading && loading.classList.contains('on')){
      if(abort) abort.abort();
      stopScanTimer();
      loading.classList.remove('on','error');
      var btn=form && form.querySelector('button');
      if(btn) btn.disabled=false;
    }
  });
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
      var ok=(!term||hay.indexOf(term)!==-1)&&(m==='all'||(m==='deep'&&deep)||(m==='inventory'&&!deep));
      row.style.display=ok?'':'none';
    });
  }
  if(q) q.addEventListener('input',filter);
  if(mode) mode.addEventListener('change',filter);
  var hero=document.getElementById('hero-demo');
  var sound=document.getElementById('hero-sound');
  var cap=document.getElementById('hero-cap');
  var cues=[
    [0,3.5,'SITEMAPPER','Your website can break without looking broken.'],
    [3.5,9.3,'MONITOR','One production site. 1,361 pages watched.'],
    [9.3,14.1,'OORTSTACK.COM','Latest scan still shows 1,361 sitemap URLs.'],
    [14.1,20.2,'DETECT','Sitemap URLs dropped from 1,361 to 0.'],
    [20.2,25.7,'UNDERSTAND','Search visibility risk — pages may stop being discovered.'],
    [25.7,30.6,'THEN','A later scan recorded 1,361 URLs again.'],
    [30.6,99,'SITEMAPPER','Know what changed before traffic, customers, or revenue tell you.']
  ];
  function setCap(k,line){
    if(!cap) return;
    cap.innerHTML='<b>'+k+'</b><span>'+line+'</span>';
  }
  function tickCap(){
    if(!hero||!cap) return;
    var t=hero.currentTime||0;
    for(var i=0;i<cues.length;i++){
      if(t>=cues[i][0]&&t<cues[i][1]){setCap(cues[i][2],cues[i][3]);return;}
    }
  }
  if(hero){
    hero.addEventListener('timeupdate',tickCap);
    hero.addEventListener('seeked',tickCap);
    hero.addEventListener('play',tickCap);
    if(hero.textTracks&&hero.textTracks[0]) hero.textTracks[0].mode='hidden';
  }
  if(hero&&sound){
    sound.addEventListener('click',function(){
      hero.muted=!hero.muted;
      sound.setAttribute('aria-pressed', hero.muted ? 'false' : 'true');
      sound.textContent=hero.muted ? 'Sound' : 'Sound on';
      var play=hero.play();
      if(play&&play.catch) play.catch(function(){});
    });
  }
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
<!-- Editorial 2026: one clear job, the working scan is the primary action. -->
<section class="sm-hero" aria-labelledby="sm-hero-title">
  <div class="sm-hero-main">
    <p class="sm-overline"><span class="sm-status-pip" aria-hidden="true"></span> WEBSITE CHANGE INTELLIGENCE <span class="sm-overline-index">/ FREE FIRST CHECK</span></p>
    <h1 id="sm-hero-title">Your site changed.<br><em>Know what broke.</em></h1>
    <p class="sm-hero-lead">Find missing sitemap pages, risky indexing changes, and errors in a live page sample. Start with a free scan of any public site. No account needed.</p>
    <div class="sm-check" id="map">
      <form class="sm-form form-row" id="map-form" action="/api/report" method="get" role="search">
        <label for="site">Your website URL</label>
        <div class="sm-form-controls">
          <input id="site" name="site" type="url" inputmode="url" autocomplete="url" required placeholder="https://yourwebsite.com" aria-describedby="sm-input-help">
          <button type="submit">Check my site <span aria-hidden="true">↗</span></button>
        </div>
      </form>
      <p class="sm-form-note" id="sm-input-help"><span aria-hidden="true">●</span> Free public scan <span class="sm-dot-sep" aria-hidden="true">·</span> No signup <span class="sm-dot-sep" aria-hidden="true">·</span> No install</p>
      <p class="sm-form-fine">Up to 1,200 sitemap URLs inventoried and 40 live pages sampled per free scan. Timing depends on origin and sitemap size; slow discovery is reported as inconclusive.</p>
    </div>
    <div class="sm-try">
      <span>Want to see it in action?</span>
      <a class="chip" href="/api/report?site=https%3A%2F%2Fwesearch.press">Scan WeSearch ↗</a>
      <a class="chip" href="/api/report?site=https%3A%2F%2Fimagineqira.com">Scan Qira ↗</a>
    </div>
  </div>
  <aside class="sm-evidence" aria-label="Illustrated example of a site map and the checks Sitemapper performs">
  <div class="sm-evidence-top"><span class="sm-evidence-mark">SITEMAPPER / TOPOLOGY</span><span class="sm-evidence-label">ILLUSTRATIVE EXAMPLE</span></div>
  <div class="sm-evidence-intro">
    <p>One homepage.<br><i>Many ways to break.</i></p>
    <span>See the routes behind the screen.</span>
  </div>
  <div class="sm-map-visual" role="img" aria-label="Illustration: a homepage connected to pricing, an article, and checkout. Checkout is shown as a route requiring attention. This is an example, not a live scan.">
    <svg viewBox="0 0 500 232" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs><pattern id="sm-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#334260" stroke-width=".6" opacity=".65"/></pattern></defs>
      <rect x="0.5" y=".5" width="499" height="231" rx="8" fill="#182440" stroke="#35476f"/>
      <rect x="1" y="1" width="498" height="230" rx="8" fill="url(#sm-grid)" />
      <path d="M 250 70 V105 M250 105 H100 V141 M250 105 V141 M250 105 H400 V141" fill="none" stroke="#768df7" stroke-width="2" stroke-linecap="round"/>
      <path d="M250 105 H400 V141" fill="none" stroke="#f5a77c" stroke-width="2.5" stroke-dasharray="5 4"/>
      <rect x="166" y="25" width="168" height="48" rx="7" fill="#e8edff" stroke="#a0b3ff"/>
      <circle cx="185" cy="49" r="5" fill="#4c66e7"/><text x="199" y="54" fill="#1b284c" font-size="17" font-weight="600" font-family="Arial, sans-serif">Homepage</text>
      <rect x="30" y="140" width="140" height="48" rx="7" fill="#243558" stroke="#7287cb"/>
      <circle cx="49" cy="164" r="5" fill="#9db3ff"/><text x="61" y="169" fill="#f1f4ff" font-size="15" font-family="Arial, sans-serif">Pricing</text>
      <rect x="180" y="140" width="140" height="48" rx="7" fill="#243558" stroke="#7287cb"/>
      <circle cx="199" cy="164" r="5" fill="#9db3ff"/><text x="211" y="169" fill="#f1f4ff" font-size="15" font-family="Arial, sans-serif">Article</text>
      <rect x="330" y="140" width="140" height="48" rx="7" fill="#49343d" stroke="#f7ae83"/>
      <circle cx="349" cy="164" r="5" fill="#f5ab7f"/><text x="361" y="169" fill="#fff0e2" font-size="15" font-family="Arial, sans-serif">Checkout</text>
      <text x="36" y="216" fill="#b3c1e8" font-size="11" font-family="monospace">ILLUSTRATIVE ROUTE MAP</text>
      <text x="337" y="216" fill="#efb492" font-size="11" font-family="monospace">— NEEDS REVIEW</text>
    </svg>
  </div>
  <ol class="sm-inspect">
    <li><span class="sm-inspect-count">01</span><div><strong>Discover routes</strong><small>What the sitemap says exists.</small></div></li>
    <li><span class="sm-inspect-count">02</span><div><strong>Inspect a sample</strong><small>Which live pages respond, redirect, or fail.</small></div></li>
    <li><span class="sm-inspect-count">03</span><div><strong>Keep a baseline</strong><small>See what changes after the next deployment.</small></div></li>
  </ol>
  <p class="sm-evidence-foot">No account needed for the first scan. <span>Not a security audit.</span></p>
</aside>
</section>

<div class="sm-signal-strip" aria-label="Scan service details">
  <span><b>01</b> Public URL</span>
  <span><b>02</b> Inspect evidence</span>
  <span><b>03</b> Fix what matters</span>
  <span><b>04</b> Keep watching</span>
</div>

<section class="sm-section sm-how" id="how-it-works" aria-labelledby="sm-how-title">
  <div class="sm-section-heading"><p class="sm-overline">THE METHOD / 01</p><h2 id="sm-how-title">An answer you can<br><em>act on.</em></h2><p>Not another dashboard full of vague risk scores. Understand what was observed, what it means, and what to inspect next.</p></div>
  <div class="sm-how-grid">
    <article class="sm-step"><span class="sm-step-index">01 / SCAN</span><h3>See the structure.</h3><p>Discover sitemap and robots data, then examine a live sample of your publicly accessible pages.</p><div class="sm-step-line"><span>ROBOTS</span><span>→</span><span>XML</span><span>→</span><span>PAGES</span></div></article>
    <article class="sm-step"><span class="sm-step-index">02 / UNDERSTAND</span><h3>Find the change.</h3><p>Review what was actually fetched, the warning signals, and the limits of the evidence.</p><div class="sm-step-line"><span>OBSERVE</span><span>→</span><span>COMPARE</span></div></article>
    <article class="sm-step"><span class="sm-step-index">03 / ACT</span><h3>Protect the next deploy.</h3><p>Keep a baseline, monitor later changes, and add alerts or CI checks when your team needs them.</p><div class="sm-step-line"><span>FIX</span><span>→</span><span>MONITOR</span></div></article>
  </div>
</section>

<section class="sm-section sm-incident" aria-labelledby="sm-incident-title">
  <div class="sm-incident-copy"><p class="sm-overline">THE REAL PROBLEM / 02</p><h2 id="sm-incident-title">A green homepage tells you almost nothing.</h2><p>A deployment can remove a sitemap, break a signup path, or change the signals search engines read while the top of the site still loads.</p><p>That is why Sitemapper captures the underlying evidence, not just a homepage screenshot.</p><div class="sm-link-row"><a href="/compare">Compare the methods ↗</a><a href="/guides/xml-sitemap-checker">Read the practical guide ↗</a></div></div>
  <div class="sm-real-demo">
    <div class="sm-demo-head"><span>RECORDED INCIDENT / OORTSTACK</span><span aria-hidden="true">● ● ●</span></div>
    <details class="sm-demo-details"><summary><span class="sm-play-icon" aria-hidden="true">▶</span><span><strong>Watch what changed underneath.</strong><small>A recorded example from a sitemap incident, not a live report.</small></span><span class="sm-demo-chevron" aria-hidden="true">⌄</span></summary>
      <video controls playsinline preload="none" poster="/brand/hero.jpg?v=3" aria-label="Recorded Sitemapper incident demonstration">
        <source src="/brand/hero.mp4?v=3" type="video/mp4">
        <track kind="captions" src="/brand/hero.vtt?v=3" srclang="en" label="Captions" default>
        This browser does not support inline video. <a href="/brand/hero.mp4?v=3">Open the recording</a>.
      </video>
    </details>
    <div class="sm-demo-footer"><span>NO FAKE SUCCESS METRICS</span><span>DISCOVERY → SAMPLE → EVIDENCE</span></div>
  </div>
</section>

<section class="sm-section sm-limits" aria-labelledby="sm-limits-title">
  <div class="sm-section-heading"><p class="sm-overline">WHAT YOU GET / 03</p><h2 id="sm-limits-title">Clear scope.<br><em>No mystery claims.</em></h2></div>
  <div class="sm-limit-columns"><div class="sm-limit-col"><p class="sm-limit-tag"><span aria-hidden="true">✓</span> WHAT IT CHECKS</p><ul><li>Accessible robots.txt and XML sitemap sources</li><li>Public URL inventory and sampled page status</li><li>Canonical, metadata, and indexability signals</li><li>Optional comparisons and critical journey paths</li></ul></div><div class="sm-limit-col"><p class="sm-limit-tag"><span aria-hidden="true">—</span> WHAT IT DOESN'T PROVE</p><ul><li>That every page on a site was tested</li><li>That Google has indexed a particular page</li><li>That a site passed a security or uptime audit</li><li>That a change caused a measured revenue loss</li></ul></div></div>
</section>

<section class="sm-close" aria-labelledby="sm-close-title">
  <div><p class="sm-overline">READY FOR THE NEXT DEPLOY?</p><h2 id="sm-close-title">Your baseline is only useful if you <em>keep checking.</em></h2><p>Start free. Add daily monitoring, alerts, or deployment guardrails when the evidence matters to your operation.</p></div>
  <div class="sm-close-actions"><a class="sm-close-primary" href="/pricing">See monitoring options <span aria-hidden="true">↗</span></a><a class="sm-close-secondary" href="/about">Who builds this? →</a></div>
</section>

<div class="sm-public-proof"><span><strong>Built by Bryan Leonard</strong> · <a href="https://imagineqira.com/bryanleonard/?view=systems">View the builder</a></span><span>Live check counts: ${stats.runs.toLocaleString()} surveys · ${stats.pages.toLocaleString()} sitemap URLs discovered across checks</span></div>
`;

  const markup = shell({
    title: 'Sitemapper — scan your website and see what changed.',
    description:
      'Free public website scan for sitemap, page and indexability problems. Save a baseline and monitor changes after deploys.',
    body,
    path: '/',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Sitemapper',
        url: ORIGIN,
        applicationCategory: 'BrowserApplication',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        description: 'Website change detection and safety. Free public check and one-site daily monitoring; paid plans add alerts, CI, capacity, and integrations.',
      },
    ],
  });
  return markup.replace('class="wrap"', 'class="wrap home"');
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
  const hasScores = scoresAvailable(result.scores);
  const scoreValue = (value: number) => (hasScores ? String(value) : 'Not scored');

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
        <td><span class="badge ${page.deepChecked ? 'deep' : ''}">${page.deepChecked ? 'Deep' : 'Inventory'}</span></td>
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
  <div class="card-head"><h2>Share this survey</h2></div>
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
  <div class="card-head"><h2>Share link unavailable</h2></div>
  <p>This run was not saved to storage (KV missing). Exports below re-run a live survey.</p>
</div>`;

  const baselineCard = hasScores
    ? `<div class="card">
  <div class="card-head"><h2>Keep this as a baseline</h2></div>
  <p>A free account can monitor one site daily and keep 14 days of snapshots. Builder raises the limit to five sites, keeps 90 days, and adds email alerts and CI guardrails.</p>
  <form method="get" action="/app/sites/new" class="form-row" style="margin-top:10px">
    <input type="hidden" name="site" value="${escapeHtml(result.site)}">
    ${shareId ? `<input type="hidden" name="share" value="${escapeHtml(shareId)}">` : ''}
    <input type="text" value="${escapeHtml(host)}" readonly aria-label="Host">
    <button type="submit">Monitor this site</button>
  </form>
  <p class="hint">Creates an account if you do not have one. Free includes one daily monitor; Builder adds email alerts and CI guardrails. HTTP 200 is not indexing.</p>
</div>`
    : `<div class="card">
  <div class="card-head"><h2>Run the survey again before monitoring</h2></div>
  <p>This run did not collect enough evidence to become a trusted baseline. Retry when the origin is reachable; Sitemapper will not turn this inconclusive snapshot into a monitor.</p>
  <div class="actions"><a class="btn primary" href="/?site=${encodeURIComponent(result.site)}">Try another survey</a></div>
</div>`;

  const body = `
${stepRail(3)}
<p class="kicker">Results${shareId ? ` · /r/${escapeHtml(shareId)}` : ''}</p>
<h1>${escapeHtml(host)}</h1>
<p class="lede">${escapeHtml(result.source.discoveredUrlCount.toLocaleString())} sitemap URLs found · ${result.source.deepCheckedCount} live-checked · ${escapeHtml(result.generatedAt)}</p>

<div class="stat-band">
  <div class="score"><span>Index</span><b>${scoreValue(result.scores.index)}</b>${hasScores ? '' : '<small>Insufficient crawl evidence</small>'}</div>
  <div class="score"><span>SEO</span><b>${scoreValue(result.scores.seo)}</b>${hasScores ? '' : '<small>Insufficient crawl evidence</small>'}</div>
  <div class="score"><span>Sitemap</span><b>${scoreValue(result.scores.sitemap)}</b>${hasScores ? '' : '<small>Insufficient crawl evidence</small>'}</div>
</div>

${shareCard}

${baselineCard}

<div class="card">
  <div class="card-head"><h2>Verdict</h2></div>
  <div class="verdict">
    <strong>${escapeHtml(result.source.compatibility)}</strong>
    <span style="color:var(--mute)">${escapeHtml(siteSummary(result))}</span>
  </div>
  <div class="fp">Fingerprint ${escapeHtml(result.insights.fingerprint)} · ${escapeHtml(result.insights.structuralSignature)}</div>
</div>

<div class="card">
  <div class="card-head"><h2>${hasScores ? 'What to fix first' : 'What to do next'}</h2></div>
  <p>${hasScores ? 'Ordered by priority. Each line includes proof from this run.' : 'This run is not a trusted diagnosis. Verify availability, then collect fresh evidence.'}</p>
  <ul class="list">${recList || '<li>No critical recommendations — keep monitoring.</li>'}</ul>
</div>

<div class="card">
  <div class="card-head"><h2>Export for AI coding agents</h2></div>
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
        <option value="inventory">Inventory only</option>
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
    description: hasScores
      ? `Sitemap survey for ${host}: Index ${result.scores.index}, SEO ${result.scores.seo}, Sitemap ${result.scores.sitemap}. Fingerprint ${result.insights.fingerprint}.`
      : `Sitemap survey for ${host}: Not scored because the crawl returned insufficient evidence. Fingerprint ${result.insights.fingerprint}.`,
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
<p class="kicker">Agent pack${shareId ? ` · saved /r/${escapeHtml(shareId)}` : ''}</p>
<h1>${escapeHtml(host)}</h1>
<p class="lede">${pack.files.length} files · fingerprint ${escapeHtml(pack.fingerprint)} · ${pack.summary.taskCount} tasks${
    shareId ? ' · from saved snapshot (no re-crawl)' : ''
  }</p>
<div class="card">
  <div class="card-head"><h2>Downloads</h2></div>
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
  <div class="card-head"><h2>Files in this pack</h2></div>
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
  <div class="card-head"><h2>Try this</h2></div>
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
<p class="kicker">About · Sitemapper</p>
<h1>Know what changed. Know who's responsible.</h1>
<p class="lede">Sitemapper helps site owners catch changes that look harmless in a deployment but can break discovery, customer journeys, and revenue. Check a public site for free. Keep a daily baseline with a free account, or add alerts and CI safeguards on paid plans.</p>
<div class="card owner-story">
  <p class="kicker">A real person behind the tool</p>
  <div class="owner-story__layout">
    <img class="sm-builder-photo" src="https://imagineqira.com/assets/bryan-leonard-20261117.webp" alt="Bryan Leonard, builder of Sitemapper" width="158" height="182" loading="lazy" decoding="async">
    <div>
      <h2>Built by Bryan Leonard.</h2>
      <p>Sitemapper is developed by <a href="https://imagineqira.com/bryanleonard/?view=systems" rel="noopener noreferrer">Bryan Leonard</a>, co-founder of Qira, as part of the Oortstack tool family. It comes from operating websites and needing reliable answers after a release: what changed, what broke, and what should be checked first.</p>
      <p>There is a public person and a project history to inspect. <a href="https://imagineqira.com/company/" rel="noopener noreferrer">Meet the Qira team</a> or review <a href="https://github.com/TheArtOfSound/Sitemapper" rel="noopener noreferrer">the Sitemapper source</a>.</p>
      <div class="actions"><a class="btn primary" href="mailto:bryanleonard@imagineqira.com?subject=Sitemapper%20question">Contact the builder</a><a class="btn" href="https://imagineqira.com/bryanleonard/?view=systems" rel="noopener noreferrer">View Bryan's work</a></div>
    </div>
  </div>
</div>
<div class="card">
  <div class="card-head"><h2>What a scan actually checks</h2></div>
  <ol class="list">
    <li>Read the public robots.txt file and discover the XML sitemap inventory.</li>
    <li>Sample accessible pages, inspect status codes, and identify signals worth reviewing.</li>
    <li>Show a dated report, a prioritized fix list, and an optional agent pack for implementation.</li>
  </ol>
  <p>Monitoring compares later snapshots for sitemap changes, unavailable pages, and declared critical journeys. Free keeps one site with daily checks and 14 days of history. <a href="/pricing">See the plan limits</a> before deciding whether alerts or CI guardrails are relevant.</p>
</div>
<div class="card">
  <div class="card-head"><h2>What we do not claim</h2></div>
  <p>Sitemapper reports what its crawler was able to observe. A small public sample is not a full penetration test, uptime guarantee, or confirmation that Google indexed a page. Blocked or slow sites may produce incomplete evidence, which should be treated as inconclusive rather than a clean bill of health.</p>
  <p>We also do not convert a broken page into an invented dollar-loss estimate. The report tells you where to investigate; your analytics and operating data establish actual impact.</p>
</div>
<div class="card">
  <div class="card-head"><h2>Explore or get help</h2></div>
  <div class="actions"><a class="btn primary" href="/">Check a public site</a><a class="btn" href="/compare">Compare approaches</a><a class="btn" href="/pricing">View monitoring plans</a></div>
</div>`;
  return shell({
    title: 'About Sitemapper · The builder, methods and limitations',
    description: 'Meet Bryan Leonard, the builder behind Sitemapper at Qira and Oortstack. See how its website checks work, their limits, and how to ask for help.',
    body,
    path: '/about',
  });
}

export function compareHtml(): string {
  const body = `
<section class="sm-compare-intro" aria-labelledby="sm-compare-title">
  <p class="sm-overline">SITEMAPPER / HOW TO CHOOSE</p>
  <h1 id="sm-compare-title">A scan answers today.<br><span>Monitoring answers tomorrow.</span></h1>
  <p class="sm-compare-lead">A sitemap list is useful. Knowing which publicly accessible pages respond, and what changed since the last deployment, is more useful when you're maintaining a real website.</p>
</section>
<div class="sm-compare-grid" aria-label="Three ways to use Sitemapper">
  <article class="sm-compare-item">
    <span class="sm-compare-step">01 / ONE-TIME</span>
    <h2>Check now.</h2>
    <p>Discover public sitemap URLs and sample live pages. No account required. Useful before sharing a site or after a release.</p>
    <ul><li>Public robots and XML sitemap inventory</li><li>Live page status and indexing signals</li><li>A reviewable report with limits</li></ul>
    <a class="sm-compare-link" href="/">Run a free scan ↗</a>
  </article>
  <article class="sm-compare-item">
    <span class="sm-compare-step">02 / RECURRING</span>
    <h2>Watch the change.</h2>
    <p>Save an account-based baseline and compare what happened after later checks. Start with one site and daily checks on the Free plan.</p>
    <ul><li>Dashboard changes and history</li><li>One-site daily monitoring is free</li><li>Email alerts start on Builder</li></ul>
    <a class="sm-compare-link" href="/pricing">See monitoring plans ↗</a>
  </article>
  <article class="sm-compare-item">
    <span class="sm-compare-step">03 / DEPLOYMENT</span>
    <h2>Build a guardrail.</h2>
    <p>Connect the monitoring evidence to release workflows. Builder and higher plans add CI safeguards; connected tools depend on plan limits.</p>
    <ul><li>CI guardrails on Builder and above</li><li>More frequent checks on higher tiers</li><li>Available integrations depend on plan</li></ul>
    <a class="sm-compare-link" href="/pricing">Compare safeguards ↗</a>
  </article>
</div>
<div class="sm-compare-clarity">
  <span>IMPORTANT DISTINCTION</span>
  <div><strong>Detection is not proof of business impact.</strong><p>Sitemapper cannot promise complete coverage, prove Google indexing from an HTTP response, or calculate actual revenue lost from a broken page. Use source evidence plus your own analytics to evaluate impact.</p></div>
  <a href="/about">Read the methods ↗</a>
</div>`;
  return shell({
    title: 'Check, monitor and protect website changes · Sitemapper',
    description: 'Compare a free public website scan, daily monitoring and CI release guardrails. See what each checks and what it cannot prove.',
    body,
    path: '/compare',
  });
}

export function guideXmlCheckerHtml(): string {
  const body = `
<p class="kicker">Guide</p>
<h1>Check an XML sitemap in 3 steps</h1>
<p class="lede">Paste a site or sitemap URL. Read fixes, then export an agent pack if you want code changes.</p>
<div class="card">
  <div class="card-head"><h2>Steps</h2></div>
  <ol class="list">
    <li>Go to <a href="/">sitemapper.oortstack.com</a></li>
    <li>Paste your site or sitemap URL → Start survey</li>
    <li>Read fixes, then download the agent pack if you want code changes</li>
  </ol>
  <p class="hint">API: <code>/api/report?site=</code> · <code>/api/agent-pack?site=</code> · <code>/api/csv?site=</code></p>
  <div class="actions"><a class="btn primary" href="/">Start</a></div>
</div>`;
  return shell({
    title: 'Free XML sitemap checker — 3 steps · Sitemapper',
    description: 'Check an XML sitemap in three steps. Export JSON, CSV, or an AI coding agent pack.',
    body,
    path: '/guides/xml-sitemap-checker',
  });
}

export function guideConflictsHtml(): string {
  const body = `
<p class="kicker">Guide</p>
<h1>Robots ↔ sitemap conflicts</h1>
<p class="lede">URLs in the sitemap should not be Disallow’d in robots.txt.</p>
<div class="card">
  <div class="card-head"><h2>What Sitemapper flags</h2></div>
  <p>Sitemapper flags <code>ROBOTS_DISALLOWED_IN_SITEMAP</code> and can put that into an agent task pack.</p>
  <div class="actions"><a class="btn primary" href="/">Scan a site</a></div>
</div>`;
  return shell({
    title: 'Robots.txt vs sitemap conflicts · Sitemapper',
    description: 'Find URLs advertised in sitemaps but blocked by robots.txt. Export fixes for coding agents.',
    body,
    path: '/guides/robots-sitemap-conflicts',
  });
}

export function llmsTxt(): string {
  return `# Sitemapper

> Free sitemap checker and one-site daily monitoring. Paid plans add alerts, CI, capacity, and integrations.

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
- Progress stream: ${ORIGIN}/api/scan?site={url}  → NDJSON stages, then share URL
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
Up to 1,200 sitemap URLs discovered, 40 live page checks, 300 HTML inventory rows (Worker preview)
Reports expire after 30 days.
`;
}

export function robotsTxt(): string {
  return `User-agent: *
Allow: /
Disallow: /api/report
Disallow: /api/scan
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
  if (!scoresAvailable(result.scores)) return `${host} did not provide enough crawl evidence for a scored result.`;
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
