import * as cheerio from 'cheerio';
import type { PageIssue, PageRecord, RawSitemapEntry } from '../types.js';
import { pathFromUrl, sectionFromPath } from '../utils/url.js';

export function buildPageFromHtml(entry: RawSitemapEntry, status: number | undefined, finalUrl: string | undefined, html: string | undefined): PageRecord {
  const issues: PageIssue[] = [];
  const path = pathFromUrl(entry.url);
  const section = sectionFromPath(path);

  let title: string | undefined;
  let description: string | undefined;
  let canonical: string | undefined;
  let noindex = false;

  if (html) {
    const $ = cheerio.load(html);
    title = cleanText($('title').first().text());
    description = cleanText($('meta[name="description"]').first().attr('content'));
    canonical = cleanText($('link[rel="canonical"]').first().attr('href'));
    const robots = cleanText($('meta[name="robots"]').first().attr('content'))?.toLowerCase();
    noindex = Boolean(robots?.includes('noindex'));
  }

  if (!status) {
    issues.push({ severity: 'error', code: 'FETCH_FAILED', message: 'Page could not be fetched.' });
  } else if (status >= 400) {
    issues.push({ severity: 'error', code: 'BAD_STATUS', message: `Page returned HTTP ${status}.` });
  } else if (status >= 300) {
    issues.push({ severity: 'warning', code: 'REDIRECT_STATUS', message: `Page returned redirect status ${status}.` });
  }

  if (finalUrl && finalUrl !== entry.url) {
    issues.push({ severity: 'warning', code: 'REDIRECTED_URL', message: `Sitemap URL resolves to ${finalUrl}.` });
  }

  if (!title) {
    issues.push({ severity: 'warning', code: 'MISSING_TITLE', message: 'Page is missing a <title> tag.' });
  } else {
    if (title.length < 15) issues.push({ severity: 'notice', code: 'SHORT_TITLE', message: 'Title is very short.' });
    if (title.length > 65) issues.push({ severity: 'notice', code: 'LONG_TITLE', message: 'Title may be too long for search results.' });
  }

  if (!description) {
    issues.push({ severity: 'warning', code: 'MISSING_META_DESCRIPTION', message: 'Page is missing a meta description.' });
  } else {
    if (description.length < 50) issues.push({ severity: 'notice', code: 'SHORT_META_DESCRIPTION', message: 'Meta description is short.' });
    if (description.length > 170) issues.push({ severity: 'notice', code: 'LONG_META_DESCRIPTION', message: 'Meta description may be too long.' });
  }

  if (!canonical) {
    issues.push({ severity: 'notice', code: 'MISSING_CANONICAL', message: 'Page is missing a canonical link.' });
  }

  if (noindex) {
    issues.push({ severity: 'error', code: 'NOINDEX_IN_SITEMAP', message: 'Page appears in sitemap but has a noindex robots directive.' });
  }

  if (!entry.lastmod) {
    issues.push({ severity: 'notice', code: 'MISSING_LASTMOD', message: 'Sitemap entry is missing lastmod.' });
  }

  return {
    url: entry.url,
    path,
    section,
    title,
    description,
    canonical,
    lastmod: entry.lastmod,
    changefreq: entry.changefreq,
    priority: entry.priority,
    status,
    ok: issues.every((issue) => issue.severity !== 'error'),
    issues
  };
}

function cleanText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}
