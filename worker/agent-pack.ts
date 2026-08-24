/**
 * Export packages for AI coding agents (Cursor, Claude Code, Codex, Grok, etc.)
 * One run → drop-in files they can read without re-crawling.
 */

import { recommendations, scoresAvailable, type Insights } from './insights.js';
import type { Issue, Page, Result } from './render.js';

export type AgentFile = {
  path: string;
  description: string;
  content: string;
  contentType: string;
};

export type AgentPackScores =
  | { index: number; seo: number; sitemap: number; available?: true }
  | { available: false; label: 'Not scored' };

export type AgentPack = {
  packVersion: string;
  format: 'sitemapper-agent-pack';
  generatedAt: string;
  site: string;
  fingerprint: string;
  structuralSignature: string;
  origin: string;
  howToUse: string[];
  files: AgentFile[];
  summary: {
    scores: AgentPackScores;
    stats: Result['stats'];
    compatibility: string;
    urlsDiscovered: number;
    deepChecked: number;
    topIssues: Array<{ code: string; count: number }>;
    taskCount: number;
  };
};

const ORIGIN = 'https://sitemapper.oortstack.com';
const PACK_VERSION = '1.0.0';

export function buildAgentPack(result: Result): AgentPack {
  const recs = recommendations(result);
  const topIssues = issueCounts(result);
  const tasks = buildTasks(result, recs);
  const host = safeHost(result.site);
  const exportedScores = exportScores(result.scores);

  const briefing = buildBriefingMd(result, recs, topIssues, tasks);
  const agentsMd = buildAgentsMd(result, tasks);
  const cursorRule = buildCursorRule(result, tasks);
  const inventoryJson = JSON.stringify(compactInventory(result), null, 2);
  const tasksJson = JSON.stringify(
    {
      site: result.site,
      fingerprint: result.insights.fingerprint,
      generatedAt: result.generatedAt,
      tasks,
    },
    null,
    2
  );
  const contextJson = JSON.stringify(
    {
      site: result.site,
      generatedAt: result.generatedAt,
      fingerprint: result.insights.fingerprint,
      structuralSignature: result.insights.structuralSignature,
      scores: exportedScores,
      stats: result.stats,
      source: result.source,
      insights: slimInsights(result.insights),
      recommendations: recs,
      rootIssues: result.issues,
      topIssues,
    },
    null,
    2
  );
  const fixPrompt = buildFixPrompt(result, tasks, recs);

  const files: AgentFile[] = [
    {
      path: 'SITEMAPPER_BRIEFING.md',
      description: 'Human + agent briefing of the survey',
      content: briefing,
      contentType: 'text/markdown; charset=utf-8',
    },
    {
      path: 'AGENTS.md',
      description: 'Drop into a repo root for coding agents',
      content: agentsMd,
      contentType: 'text/markdown; charset=utf-8',
    },
    {
      path: '.cursor/rules/sitemapper-seo.mdc',
      description: 'Cursor rule with crawlability constraints',
      content: cursorRule,
      contentType: 'text/markdown; charset=utf-8',
    },
    {
      path: 'sitemapper/tasks.json',
      description: 'Prioritized machine-readable fix tasks',
      content: tasksJson,
      contentType: 'application/json; charset=utf-8',
    },
    {
      path: 'sitemapper/inventory.json',
      description: 'Compact URL inventory from the sitemap',
      content: inventoryJson,
      contentType: 'application/json; charset=utf-8',
    },
    {
      path: 'sitemapper/context.json',
      description: 'Scores, insights, recommendations, top issues',
      content: contextJson,
      contentType: 'application/json; charset=utf-8',
    },
    {
      path: 'sitemapper/FIX_PROMPT.md',
      description: 'Paste into any coding agent to start fixes',
      content: fixPrompt,
      contentType: 'text/markdown; charset=utf-8',
    },
  ];

  return {
    packVersion: PACK_VERSION,
    format: 'sitemapper-agent-pack',
    generatedAt: result.generatedAt,
    site: result.site,
    fingerprint: result.insights.fingerprint,
    structuralSignature: result.insights.structuralSignature,
    origin: ORIGIN,
    howToUse: [
      'Download the pack JSON or copy individual files.',
      `Add AGENTS.md to the ${host} repo root (or merge into an existing AGENTS.md).`,
      'Add .cursor/rules/sitemapper-seo.mdc for Cursor projects.',
      'Give the agent FIX_PROMPT.md + tasks.json as the work order.',
      'Use inventory.json to know which public URLs the sitemap advertises.',
      `Re-run: ${ORIGIN}/api/report?site=${encodeURIComponent(result.site)}`,
    ],
    files,
    summary: {
      scores: exportedScores,
      stats: result.stats,
      compatibility: result.source.compatibility,
      urlsDiscovered: result.source.discoveredUrlCount,
      deepChecked: result.source.deepCheckedCount,
      topIssues,
      taskCount: tasks.length,
    },
  };
}

export function agentPackMarkdown(pack: AgentPack): string {
  const parts = [
    `# Sitemapper agent pack — ${pack.site}`,
    '',
    `Fingerprint: \`${pack.fingerprint}\` · Signature: \`${pack.structuralSignature}\``,
    `Generated: ${pack.generatedAt}`,
    '',
    '## How to use',
    ...pack.howToUse.map((line, i) => `${i + 1}. ${line}`),
    '',
    '## Summary',
    `- Compatibility: ${pack.summary.compatibility}`,
    `- Scores: ${scoreSummary(pack.summary.scores)}`,
    `- Sitemap URLs found: ${pack.summary.urlsDiscovered} (live-checked ${pack.summary.deepChecked})`,
    `- Tasks: ${pack.summary.taskCount}`,
    `- Top issues: ${pack.summary.topIssues
      .slice(0, 8)
      .map((i) => `${i.code}×${i.count}`)
      .join(', ')}`,
    '',
  ];

  for (const file of pack.files) {
    parts.push(`---`, ``, `## File: \`${file.path}\``, ``, file.description, ``, '```', file.content, '```', ``);
  }
  return parts.join('\n');
}

/** NDJSON-ish single-file dump some agents prefer */
export function agentPackFlat(pack: AgentPack): string {
  return pack.files
    .map((f) => `===== FILE: ${f.path} =====\n${f.content}\n`)
    .join('\n');
}

type Task = {
  id: string;
  priority: number;
  title: string;
  why: string;
  proof: string;
  acceptance: string[];
  relatedUrls: string[];
  codes: string[];
};

function buildTasks(
  result: Result,
  recs: Array<{ priority: number; title: string; why: string; proof: string }>
): Task[] {
  const byCode = new Map<string, Page[]>();
  for (const page of result.pages) {
    for (const issue of page.issues) {
      if (issue.code === 'INDEX_ONLY_NOT_FETCHED') continue;
      const list = byCode.get(issue.code) || [];
      if (list.length < 12) list.push(page);
      byCode.set(issue.code, list);
    }
  }

  const tasks: Task[] = recs.map((rec, i) => {
    const codes = extractCodes(rec.proof);
    const urls = new Set<string>();
    for (const code of codes) {
      for (const page of byCode.get(code) || []) urls.add(page.url);
    }
    // fallback: pages with highest issue counts
    if (!urls.size) {
      for (const page of result.pages.filter((p) => p.deepChecked && p.issues.length).slice(0, 5)) {
        urls.add(page.url);
      }
    }
    return {
      id: `task-${String(i + 1).padStart(2, '0')}`,
      priority: rec.priority,
      title: rec.title,
      why: rec.why,
      proof: rec.proof,
      acceptance: acceptanceFor(rec.title, codes),
      relatedUrls: [...urls].slice(0, 15),
      codes,
    };
  });

  // Add granular high-signal page tasks from deep sample
  const granularCodes = [
    'NOINDEX_IN_SITEMAP',
    'ROBOTS_DISALLOWED_IN_SITEMAP',
    'BAD_STATUS',
    'MISSING_TITLE',
    'MISSING_META_DESCRIPTION',
    'CANONICAL_CROSS_HOST',
  ];
  let g = 0;
  for (const code of granularCodes) {
    const pages = byCode.get(code) || [];
    if (!pages.length) continue;
    g += 1;
    tasks.push({
      id: `page-${String(g).padStart(2, '0')}`,
      priority: code.includes('NOINDEX') || code.includes('ROBOTS') || code.includes('BAD') ? 1 : 2,
      title: `Fix ${humanize(code)} on ${pages.length} URL(s)`,
      why: pages[0]?.issues.find((i) => i.code === code)?.message || humanize(code),
      proof: `${code} × ${countCode(result, code)}; sample URLs attached.`,
      acceptance: [
        `No remaining ${code} on the listed URLs after re-survey`,
        'Sitemap and live HTML agree on indexability',
      ],
      relatedUrls: pages.map((p) => p.url).slice(0, 15),
      codes: [code],
    });
  }

  return tasks.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)).slice(0, 24);
}

function buildBriefingMd(
  result: Result,
  recs: Array<{ priority: number; title: string; why: string; proof: string }>,
  topIssues: Array<{ code: string; count: number }>,
  tasks: Task[]
): string {
  const host = safeHost(result.site);
  return `# Sitemapper briefing — ${host}

Generated: ${result.generatedAt}
Fingerprint: \`${result.insights.fingerprint}\`
Structural signature: \`${result.insights.structuralSignature}\`
Source: ${ORIGIN}

## Verdict
${result.source.compatibility}

- Sitemap URLs found: **${result.source.discoveredUrlCount}**
- Live checked: **${result.source.deepCheckedCount}**
- Scores: ${scoreSummary(result.scores, ' · ', true)}
- Issues: ${result.stats.errors} errors · ${result.stats.warnings} warnings · ${result.stats.notices} notices
- Freshness coverage: ${result.insights.freshnessCoverage}%
- Lattice: depth ${result.insights.latticeDepth}, breadth ${result.insights.latticeBreadth}, ${result.insights.leafPaths} leaves
- Section imbalance: ${result.insights.imbalance}%

## Proof ledger
${result.insights.proof.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## Top issue codes
${topIssues
  .slice(0, 12)
  .map((i) => `- \`${i.code}\` × ${i.count}`)
  .join('\n')}

## Priority recommendations
${recs.map((r) => `### P${r.priority} — ${r.title}\n${r.why}\nProof: ${r.proof}`).join('\n\n')}

## Task list for agents (${tasks.length})
${tasks
  .map(
    (t) =>
      `- **${t.id}** (P${t.priority}) ${t.title}\n  - Why: ${t.why}\n  - Codes: ${t.codes.join(', ') || '—'}\n  - URLs: ${t.relatedUrls.slice(0, 5).join(', ') || '—'}`
  )
  .join('\n')}

## Sitemap candidates checked
${result.source.sitemapUrls.map((u) => `- ${u}`).join('\n') || '- (none)'}

## Re-run
${ORIGIN}/api/report?site=${encodeURIComponent(result.site)}
${ORIGIN}/api/agent-pack?site=${encodeURIComponent(result.site)}
`;
}

function buildAgentsMd(result: Result, tasks: Task[]): string {
  const host = safeHost(result.site);
  return `# Agent notes — sitemap / SEO inventory for ${host}

This file was generated by [Sitemapper](${ORIGIN}) so coding agents can fix crawlability without re-crawling.

## Ground truth
- Site: ${result.site}
- Fingerprint: \`${result.insights.fingerprint}\`
- Structural signature: \`${result.insights.structuralSignature}\`
- Survey time: ${result.generatedAt}
- Compatibility: ${result.source.compatibility}
- Scores: ${scoreSummary(result.scores, ' / ')}

## Rules for agents
1. Prefer fixing sitemap.xml, robots.txt, titles, meta descriptions, canonicals, and noindex conflicts over redesigns.
2. Do not invent ranking promises or keyword strategies.
3. Only claim a URL is public if it appears in \`sitemapper/inventory.json\` or was deep-checked.
4. After changes, re-run: \`${ORIGIN}/api/report?site=${encodeURIComponent(result.site)}\` and compare fingerprint/signature.
5. Keep lastmod accurate when you change page content.

## Ordered work
${tasks
  .slice(0, 12)
  .map(
    (t, i) =>
      `${i + 1}. **${t.title}** (\`${t.id}\`, P${t.priority})\n   - ${t.why}\n   - Acceptance: ${t.acceptance.join('; ')}`
  )
  .join('\n')}

## Files in this pack
- \`sitemapper/tasks.json\` — structured tasks
- \`sitemapper/inventory.json\` — URL inventory
- \`sitemapper/context.json\` — full machine context
- \`sitemapper/FIX_PROMPT.md\` — paste-ready prompt
- \`.cursor/rules/sitemapper-seo.mdc\` — Cursor rule

## Do not
- Scrape the whole site blindly when inventory.json already lists sitemap URLs
- Remove URLs from the sitemap without fixing indexability first
- Ship noindex pages that remain in the sitemap
`;
}

function buildCursorRule(result: Result, tasks: Task[]): string {
  return `---
description: Sitemapper crawlability constraints for ${safeHost(result.site)}
globs:
  - "**/sitemap*.xml"
  - "**/robots.txt"
  - "**/*.{tsx,ts,jsx,js,html,mdx,php}"
alwaysApply: false
---

# Sitemapper SEO constraints

Survey fingerprint: \`${result.insights.fingerprint}\`
Structural signature: \`${result.insights.structuralSignature}\`

When editing pages or sitemap generation for ${result.site}:

- Every public indexable page should appear in the XML sitemap
- Never list noindex or robots-disallowed URLs in the sitemap
- Prefer accurate lastmod on sitemap entries when content changes
- Titles and meta descriptions should be unique on template pages
- Canonical should be same-host and self-referencing after redirects

## Open tasks from last survey
${tasks
  .slice(0, 8)
  .map((t) => `- [ ] P${t.priority} ${t.title}`)
  .join('\n')}

Re-verify: ${ORIGIN}/api/report?site=${encodeURIComponent(result.site)}
`;
}

function buildFixPrompt(
  result: Result,
  tasks: Task[],
  recs: Array<{ priority: number; title: string; why: string; proof: string }>
): string {
  return `# Fix crawlability for ${result.site}

You are working in the codebase that powers \`${safeHost(result.site)}\`.
A Sitemapper survey already ran — do **not** re-scrape the whole web.

## Survey receipt
- Fingerprint: \`${result.insights.fingerprint}\`
- Signature: \`${result.insights.structuralSignature}\`
- Scores: ${scoreSummary(result.scores)}
- Verdict: ${result.source.compatibility}

## Your job
Work the tasks below in priority order. Use \`sitemapper/inventory.json\` and \`sitemapper/tasks.json\` as ground truth.

${tasks
  .slice(0, 10)
  .map(
    (t, i) => `### ${i + 1}. ${t.title}
- ID: ${t.id}
- Priority: P${t.priority}
- Why: ${t.why}
- Proof: ${t.proof}
- Codes: ${t.codes.join(', ') || 'n/a'}
- Sample URLs:
${t.relatedUrls
  .slice(0, 8)
  .map((u) => `  - ${u}`)
  .join('\n') || '  - (see inventory)'}
- Acceptance:
${t.acceptance.map((a) => `  - ${a}`).join('\n')}
`
  )
  .join('\n')}

## Recommendations (context)
${recs.map((r) => `- P${r.priority}: ${r.title} — ${r.why}`).join('\n')}

## Done means
1. Code/config changes address P1 tasks first
2. You note residual risks for anything not fixed
3. You suggest re-running ${ORIGIN}/api/agent-pack?site=${encodeURIComponent(result.site)}
`;
}

function exportScores(scores: Result['scores']): AgentPackScores {
  if (!scoresAvailable(scores)) return { available: false, label: 'Not scored' };
  return scores.available === true
    ? { index: scores.index, seo: scores.seo, sitemap: scores.sitemap, available: true }
    : { index: scores.index, seo: scores.seo, sitemap: scores.sitemap };
}

function scoreSummary(
  scores: Result['scores'] | AgentPackScores,
  separator = ' · ',
  bold = false
): string {
  if (scores.available === false || !('index' in scores)) return bold ? '**Not scored**' : 'Not scored';
  const value = (label: string, score: number) => `${label} ${bold ? `**${score}**` : score}`;
  return [value('Index', scores.index), value('SEO', scores.seo), value('Sitemap', scores.sitemap)].join(separator);
}

function compactInventory(result: Result) {
  const inventoryPages = result.pages.filter((page) => page.sitemapListed !== false);
  return {
    site: result.site,
    generatedAt: result.generatedAt,
    fingerprint: result.insights.fingerprint,
    count: inventoryPages.length,
    pages: inventoryPages.map((p) => ({
      url: p.url,
      path: p.path,
      type: p.type,
      section: p.section,
      deep: p.deepChecked,
      status: p.status ?? null,
      title: p.title ?? null,
      lastmod: p.lastmod ?? null,
      issues: p.issues.filter((i) => i.code !== 'INDEX_ONLY_NOT_FETCHED').map((i) => i.code),
    })),
  };
}

function slimInsights(insights: Insights) {
  return {
    fingerprint: insights.fingerprint,
    structuralSignature: insights.structuralSignature,
    latticeDepth: insights.latticeDepth,
    latticeBreadth: insights.latticeBreadth,
    leafPaths: insights.leafPaths,
    freshness: insights.freshness,
    freshnessCoverage: insights.freshnessCoverage,
    sections: insights.sections.slice(0, 30),
    types: insights.types,
    imbalance: insights.imbalance,
    orphanRoots: insights.orphanRoots,
    proof: insights.proof,
  };
}

function issueCounts(result: Result): Array<{ code: string; count: number }> {
  const map = new Map<string, number>();
  for (const issue of [...result.issues, ...result.pages.flatMap((p) => p.issues)]) {
    if (issue.code === 'INDEX_ONLY_NOT_FETCHED') continue;
    map.set(issue.code, (map.get(issue.code) || 0) + 1);
  }
  return [...map.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);
}

function countCode(result: Result, code: string): number {
  let n = 0;
  for (const issue of [...result.issues, ...result.pages.flatMap((p) => p.issues)]) {
    if (issue.code === code) n += 1;
  }
  return n;
}

function extractCodes(proof: string): string[] {
  const codes = proof.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) || [];
  return [...new Set(codes)].filter((c) => c.includes('_') || c.startsWith('NO') || c.startsWith('MISSING'));
}

function acceptanceFor(title: string, codes: string[]): string[] {
  const base = [
    'Re-run Sitemapper and confirm the related issue counts drop',
    'No new P1 errors introduced on deep-checked sample',
  ];
  if (/lastmod/i.test(title)) base.unshift('Sitemap entries emit valid lastmod for changed pages');
  if (/robots/i.test(title)) base.unshift('No sitemap URL remains Disallow in robots.txt');
  if (/noindex/i.test(title) || codes.includes('NOINDEX_IN_SITEMAP')) {
    base.unshift('noindex pages removed from sitemap or made indexable');
  }
  if (/title|meta/i.test(title)) base.unshift('Affected templates render unique title/description');
  if (/thin|expand/i.test(title)) base.unshift('Sitemap URL count matches real public IA');
  return base.slice(0, 4);
}

function humanize(code: string): string {
  return code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function safeHost(site: string): string {
  try {
    return new URL(site).hostname;
  } catch {
    return site;
  }
}

// keep Issue type import used for documentation / future filters
void (null as unknown as Issue);
