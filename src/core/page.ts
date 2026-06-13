import * as cheerio from 'cheerio';
import type { PageIssue, PageRecord, RawSitemapEntry, RedirectHop } from '../types.js';
import { displayPathFromUrl, normalizePageUrl, pageTypeFromUrl, pathFromUrl, sectionFromUrl } from '../utils/url.js';

export function buildPageFromHtml(
  entry: RawSitemapEntry,
  status: number | undefined,
  finalUrl: string | undefined,
  html: string | undefined,
  redirect?: { chain: RedirectHop[]; loop: boolean }
): PageRecord {
  const chain = redirect?.chain ?? [];
  const loop = redirect?.loop ?? false;
  const issues: PageIssue[] = [];
  const path = pathFromUrl(entry.url);
  const displayPath = displayPathFromUrl(entry.url);
  const section = sectionFromUrl(entry.url);
  const pageType = pageTypeFromUrl(entry.url);
  const isGenerated = ['archive', 'cluster', 'category_page', 'canvas', 'story', 'generated'].includes(pageType);

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
  } else if (status >= 300 && !loop && chain.length === 0) {
    issues.push({ severity: 'warning', code: 'REDIRECT_STATUS', message: `Page returned redirect status ${status}.` });
  }

  // v0.3: redirect chain reporting. Exactly one redirect issue per page.
  if (loop) {
    issues.push({ severity: 'error', code: 'REDIRECT_LOOP', message: 'Sitemap URL enters a redirect loop.' });
  } else if (chain.length >= 2) {
    issues.push({ severity: 'warning', code: 'REDIRECT_CHAIN', message: `Sitemap URL passes through ${chain.length} redirects before resolving.` });
  } else if (chain.length === 1 || (finalUrl && safeNormalize(finalUrl) !== safeNormalize(entry.url))) {
    issues.push({ severity: 'warning', code: 'REDIRECTED_URL', message: `Sitemap URL resolves to ${finalUrl ?? chain[chain.length - 1]?.location}.` });
  }

  if (!title) {
    issues.push({ severity: isGenerated ? 'notice' : 'warning', code: 'MISSING_TITLE', message: 'Page is missing a <title> tag.' });
  } else {
    if (title.length < 15) issues.push({ severity: 'notice', code: 'SHORT_TITLE', message: 'Title is very short.' });
    if (title.length > 75) issues.push({ severity: isGenerated ? 'notice' : 'warning', code: 'LONG_TITLE', message: 'Title may be too long for search results.' });
  }

  if (!description) {
    issues.push({ severity: isGenerated ? 'notice' : 'warning', code: 'MISSING_META_DESCRIPTION', message: 'Page is missing a meta description.' });
  } else {
    if (description.length < 50) issues.push({ severity: 'notice', code: 'SHORT_META_DESCRIPTION', message: 'Meta description is short.' });
    if (description.length > 180) issues.push({ severity: isGenerated ? 'notice' : 'warning', code: 'LONG_META_DESCRIPTION', message: 'Meta description may be too long.' });
  }

  if (!canonical) {
    issues.push({ severity: 'notice', code: 'MISSING_CANONICAL', message: 'Page is missing a canonical link.' });
  } else {
    // v0.4: validate the canonical target. A canonical matching either the
    // sitemap URL or the post-redirect URL is healthy (self-referencing).
    const resolved = resolveUrl(canonical, entry.url);
    if (resolved) {
      const selfUrls = new Set([safeNormalize(entry.url)]);
      if (finalUrl) selfUrls.add(safeNormalize(finalUrl));
      if (!safeSameHost(resolved, entry.url)) {
        issues.push({ severity: 'warning', code: 'CANONICAL_CROSS_HOST', message: `Canonical points to another host: ${resolved}.` });
      } else if (!selfUrls.has(safeNormalize(resolved))) {
        issues.push({ severity: 'notice', code: 'CANONICAL_MISMATCH', message: `Canonical points to a different URL: ${resolved}.` });
      }
    }
  }

  if (noindex) {
    issues.push({ severity: 'error', code: 'NOINDEX_IN_SITEMAP', message: 'Page appears in sitemap but has a noindex robots directive.' });
  }

  if (!entry.lastmod) {
    issues.push({ severity: isGenerated ? 'notice' : 'warning', code: 'MISSING_LASTMOD', message: 'Sitemap entry is missing lastmod.' });
  }

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
    redirects: chain.length || undefined,
    redirectChain: chain.length > 0 ? chain : undefined,
    ok: issues.every((issue) => issue.severity !== 'error'),
    issues
  };
}

function cleanText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

// Compare URLs by their normalized form so that a trailing slash, default port,
// or host casing difference is not mistaken for a real redirect.
function safeNormalize(url: string): string {
  try {
    return normalizePageUrl(url);
  } catch {
    return url;
  }
}

function resolveUrl(href: string, base: string): string | undefined {
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

function safeSameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}
