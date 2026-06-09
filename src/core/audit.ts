import pLimit from 'p-limit';
import type { PageIssue, PageRecord, RawSitemapEntry, SitemapperOptions, SitemapperResult, SitemapperScores, SitemapperStats } from '../types.js';
import { fetchText } from './fetch.js';
import { buildPageFromHtml } from './page.js';
import { discoverSitemaps } from './discover.js';
import { loadSitemapEntries } from './sitemap.js';

export async function runAudit(options: SitemapperOptions): Promise<SitemapperResult> {
  const source = await discoverSitemaps(options.site, options.fetchTimeoutMs);
  const sitemapLoad = await loadSitemapEntries(options.site, source.sitemapUrls, options.fetchTimeoutMs);
  const rootIssues: PageIssue[] = [];

  if (!source.discoveredFromRobots) {
    rootIssues.push({ severity: 'notice', code: 'ROBOTS_NO_SITEMAP_REFERENCE', message: 'robots.txt did not expose a Sitemap: entry; tried /sitemap.xml fallback.' });
  }

  for (const failed of sitemapLoad.failedSitemaps) {
    rootIssues.push({ severity: 'error', code: 'SITEMAP_FETCH_FAILED', message: `Could not load sitemap: ${failed}` });
  }

  const entries = sitemapLoad.entries.slice(0, options.maxPages);
  if (sitemapLoad.entries.length > options.maxPages) {
    rootIssues.push({ severity: 'warning', code: 'MAX_PAGES_LIMIT_REACHED', message: `Checked first ${options.maxPages} pages out of ${sitemapLoad.entries.length}.` });
  }

  const pages = await inspectPages(entries, options);
  const duplicateIssues = findDuplicateMetadataIssues(pages);
  const pagesWithDuplicates = pages.map((page) => ({
    ...page,
    issues: [...page.issues, ...(duplicateIssues.get(page.url) ?? [])]
  }));

  return {
    site: options.site,
    generatedAt: new Date().toISOString(),
    source: {
      ...source,
      sitemapUrls: sitemapLoad.loadedSitemaps.length > 0 ? sitemapLoad.loadedSitemaps : source.sitemapUrls
    },
    scores: score(pagesWithDuplicates, rootIssues),
    stats: stats(pagesWithDuplicates, rootIssues),
    pages: pagesWithDuplicates,
    issues: rootIssues
  };
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
      for (const page of group) addIssue(issues, page.url, { severity: 'warning', code: 'DUPLICATE_TITLE', message: 'Title is duplicated on another indexed page.' });
    }
  }
  for (const group of byDescription.values()) {
    if (group.length > 1) {
      for (const page of group) addIssue(issues, page.url, { severity: 'notice', code: 'DUPLICATE_META_DESCRIPTION', message: 'Meta description is duplicated on another indexed page.' });
    }
  }

  return issues;
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
  const total = Math.max(pages.length, 1);
  const errors = [...rootIssues, ...pages.flatMap((page) => page.issues)].filter((issue) => issue.severity === 'error').length;
  const warnings = [...rootIssues, ...pages.flatMap((page) => page.issues)].filter((issue) => issue.severity === 'warning').length;
  const missingTitle = pages.filter((page) => !page.title).length;
  const missingDescription = pages.filter((page) => !page.description).length;
  const sections = new Set(pages.map((page) => page.section)).size;
  const missingLastmod = pages.filter((page) => !page.lastmod).length;

  return {
    index: clamp(100 - Math.round((missingTitle / total) * 30) - Math.max(0, 10 - sections) * 2),
    seo: clamp(100 - errors * 8 - warnings * 2 - Math.round((missingDescription / total) * 20)),
    sitemap: clamp(100 - rootIssues.filter((issue) => issue.severity === 'error').length * 15 - Math.round((missingLastmod / total) * 15))
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
