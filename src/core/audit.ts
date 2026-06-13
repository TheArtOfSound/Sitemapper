import pLimit from 'p-limit';
import type { PageIssue, PageRecord, RawSitemapEntry, SitemapperOptions, SitemapperResult, SitemapperScores, SitemapperStats } from '../types.js';
import { canonicalDedupeKey } from '../utils/url.js';
import { fetchText } from './fetch.js';
import { buildPageFromHtml } from './page.js';
import { discoverSitemaps } from './discover.js';
import { loadSitemapEntries } from './sitemap.js';
import { isPathAllowed, requestPath, type RobotsRules } from './robots.js';

export async function runAudit(options: SitemapperOptions): Promise<SitemapperResult> {
  const { rules, ...source } = await discoverSitemaps(options.site, options.fetchTimeoutMs);
  const sitemapLoad = await loadSitemapEntries(options.site, source.sitemapUrls, options.fetchTimeoutMs);
  const rootIssues: PageIssue[] = [];
  const totalSitemapEntries = sitemapLoad.entries.length;

  if (!source.discoveredFromRobots) {
    rootIssues.push({ severity: 'notice', code: 'ROBOTS_NO_SITEMAP_REFERENCE', message: 'robots.txt did not expose a Sitemap: entry; tried /sitemap.xml fallback.' });
  }

  if (totalSitemapEntries === 0 && sitemapLoad.loadedSitemaps.length > 0) {
    rootIssues.push({ severity: 'error', code: 'SITEMAPS_FOUND_BUT_UNUSABLE', message: 'Sitemap files loaded, but no usable same-host URL entries were extracted.' });
  }

  if (totalSitemapEntries === 0 && sitemapLoad.loadedSitemaps.length === 0) {
    rootIssues.push({ severity: 'error', code: 'NO_ACCESSIBLE_SITEMAP', message: 'No accessible XML sitemap could be loaded.' });
  }

  if (totalSitemapEntries === 1) {
    rootIssues.push({ severity: 'warning', code: 'SINGLE_URL_SITEMAP', message: 'Only 1 URL was found in the sitemap inventory. This is thin unless the site is intentionally one page.' });
  } else if (totalSitemapEntries > 1 && totalSitemapEntries < 5) {
    rootIssues.push({ severity: 'warning', code: 'THIN_SITEMAP', message: `Only ${totalSitemapEntries} URLs were found in the sitemap inventory.` });
  }

  for (const failed of sitemapLoad.failedSitemaps) {
    rootIssues.push({ severity: 'error', code: 'SITEMAP_FETCH_FAILED', message: `Could not load sitemap: ${failed}` });
  }

  const entries = sitemapLoad.entries.slice(0, options.maxPages);
  if (sitemapLoad.entries.length > options.maxPages) {
    rootIssues.push({ severity: 'warning', code: 'MAX_PAGES_LIMIT_REACHED', message: `Checked first ${options.maxPages} pages out of ${sitemapLoad.entries.length}.` });
  }

  const inspectedPages = await inspectPages(entries, options);
  const pages = dedupePages(inspectedPages, rootIssues);
  const duplicateIssues = findDuplicateMetadataIssues(pages);
  const pagesWithDuplicates = pages.map((page) => ({
    ...page,
    issues: [...page.issues, ...(duplicateIssues.get(page.url) ?? [])]
  }));
  const finalPages = applyRobotsConflicts(pagesWithDuplicates, rules, rootIssues);

  return {
    site: options.site,
    generatedAt: new Date().toISOString(),
    source: {
      ...source,
      sitemapUrls: sitemapLoad.loadedSitemaps.length > 0 ? sitemapLoad.loadedSitemaps : source.sitemapUrls
    },
    scores: score(finalPages, rootIssues),
    stats: stats(finalPages, rootIssues),
    pages: finalPages,
    issues: rootIssues
  };
}

// v0.2: flag sitemap URLs that robots.txt disallows (the "submitted URL blocked
// by robots.txt" conflict). Only runs when robots.txt actually defined rules.
function applyRobotsConflicts(pages: PageRecord[], rules: RobotsRules, rootIssues: PageIssue[]): PageRecord[] {
  if (!rules.hasGroups) return pages;
  let blocked = 0;
  const out = pages.map((page) => {
    if (isPathAllowed(rules, requestPath(page.url))) return page;
    blocked += 1;
    return {
      ...page,
      issues: [
        ...page.issues,
        {
          severity: 'warning' as const,
          code: 'ROBOTS_DISALLOWED_IN_SITEMAP',
          message: 'URL is listed in the sitemap but blocked by robots.txt.'
        }
      ]
    };
  });
  if (blocked > 0) {
    rootIssues.push({
      severity: 'warning',
      code: 'ROBOTS_SITEMAP_CONFLICTS',
      message: `${blocked} sitemap URL(s) are advertised in the sitemap but disallowed by robots.txt.`
    });
  }
  return out;
}

async function inspectPages(entries: RawSitemapEntry[], options: SitemapperOptions): Promise<PageRecord[]> {
  const limit = pLimit(options.concurrency);
  const tasks = entries.map((entry) => limit(async () => {
    try {
      const response = await fetchText(entry.url, options.fetchTimeoutMs);
      return buildPageFromHtml(entry, response.status, response.finalUrl, response.text);
    } catch {
      return buildPageFromHtml(entry, undefined, undefined, undefined);
    }
  }));

  return Promise.all(tasks);
}

function dedupePages(pages: PageRecord[], rootIssues: PageIssue[]): PageRecord[] {
  const byKey = new Map<string, PageRecord>();
  let duplicateCount = 0;

  for (const page of pages) {
    const key = canonicalDedupeKey(page.canonical || page.finalUrl || page.url);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, page);
      continue;
    }

    duplicateCount += 1;
    byKey.set(key, chooseBetterPage(existing, page));
  }

  if (duplicateCount > 0) {
    rootIssues.push({ severity: 'notice', code: 'DUPLICATE_URLS_DEDUPED', message: `${duplicateCount} duplicate-ish sitemap URLs were collapsed in the public index.` });
  }

  return Array.from(byKey.values()).sort((a, b) => a.url.localeCompare(b.url));
}

function chooseBetterPage(a: PageRecord, b: PageRecord): PageRecord {
  const aScore = pageCompletenessScore(a);
  const bScore = pageCompletenessScore(b);
  return bScore > aScore ? b : a;
}

function pageCompletenessScore(page: PageRecord): number {
  return Number(Boolean(page.title)) * 3 + Number(Boolean(page.description)) * 2 + Number(Boolean(page.lastmod)) + Number(page.status === 200) * 2;
}

function findDuplicateMetadataIssues(pages: PageRecord[]): Map<string, PageIssue[]> {
  const byTitle = new Map<string, PageRecord[]>();
  const byDescription = new Map<string, PageRecord[]>();

  for (const page of pages) {
    if (page.title) addToMap(byTitle, page.title.toLowerCase(), page);
    if (page.description) addToMap(byDescription, page.description.toLowerCase(), page);
  }

  const issues = new Map<string, PageIssue[]>();
  for (const group of byTitle.values()) {
    if (group.length > 1) {
      for (const page of group) addIssue(issues, page.url, { severity: duplicateSeverity(page), code: 'DUPLICATE_TITLE', message: 'Title is duplicated on another indexed page.' });
    }
  }
  for (const group of byDescription.values()) {
    if (group.length > 1) {
      for (const page of group) addIssue(issues, page.url, { severity: 'notice', code: 'DUPLICATE_META_DESCRIPTION', message: 'Meta description is duplicated on another indexed page.' });
    }
  }

  return issues;
}

function duplicateSeverity(page: PageRecord): 'warning' | 'notice' {
  return ['cluster', 'archive', 'category_page', 'canvas', 'generated'].includes(page.pageType) ? 'notice' : 'warning';
}

function addToMap(map: Map<string, PageRecord[]>, key: string, value: PageRecord): void {
  const existing = map.get(key) ?? [];
  existing.push(value);
  map.set(key, existing);
}

function addIssue(map: Map<string, PageIssue[]>, url: string, issue: PageIssue): void {
  const existing = map.get(url) ?? [];
  existing.push(issue);
  map.set(url, existing);
}

function stats(pages: PageRecord[], rootIssues: PageIssue[]): SitemapperStats {
  const allIssues = [...rootIssues, ...pages.flatMap((page) => page.issues)];
  return {
    pages: pages.length,
    sections: new Set(pages.map((page) => page.section)).size,
    errors: allIssues.filter((issue) => issue.severity === 'error').length,
    warnings: allIssues.filter((issue) => issue.severity === 'warning').length,
    notices: allIssues.filter((issue) => issue.severity === 'notice').length
  };
}

function score(pages: PageRecord[], rootIssues: PageIssue[]): SitemapperScores {
  const totalWeight = Math.max(weightedPageTotal(pages), 1);
  const weightedMissingTitle = weightedCount(pages, (page) => !page.title);
  const weightedMissingDescription = weightedCount(pages, (page) => !page.description);
  const errors = [...rootIssues, ...pages.flatMap((page) => page.issues)].filter((issue) => issue.severity === 'error').length;
  const warnings = [...rootIssues, ...pages.flatMap((page) => page.issues)].filter((issue) => issue.severity === 'warning').length;
  const notices = [...rootIssues, ...pages.flatMap((page) => page.issues)].filter((issue) => issue.severity === 'notice').length;
  const sections = new Set(pages.map((page) => page.section)).size;
  const missingLastmod = weightedCount(pages, (page) => !page.lastmod);
  const sitemapDepthPenalty = pages.length === 1 ? 35 : pages.length > 1 && pages.length < 5 ? 20 : pages.length < 10 ? 10 : 0;

  return {
    index: clamp(100 - sitemapDepthPenalty - Math.round((weightedMissingTitle / totalWeight) * 20) - Math.max(0, 10 - sections) * 2),
    seo: clamp(100 - errors * 10 - warnings * 1.25 - notices * 0.15 - Math.round((weightedMissingDescription / totalWeight) * 12)),
    sitemap: clamp(100 - sitemapDepthPenalty - rootIssues.filter((issue) => issue.severity === 'error').length * 15 - Math.round((missingLastmod / totalWeight) * 10))
  };
}

function weightedPageTotal(pages: PageRecord[]): number {
  return pages.reduce((sum, page) => sum + pageWeight(page), 0);
}

function weightedCount(pages: PageRecord[], predicate: (page: PageRecord) => boolean): number {
  return pages.reduce((sum, page) => sum + (predicate(page) ? pageWeight(page) : 0), 0);
}

function pageWeight(page: PageRecord): number {
  if (['home', 'static'].includes(page.pageType)) return 1;
  if (['category', 'source'].includes(page.pageType)) return 0.75;
  if (['category_page', 'archive', 'canvas'].includes(page.pageType)) return 0.35;
  if (['cluster', 'story', 'generated'].includes(page.pageType)) return 0.25;
  return 0.5;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
