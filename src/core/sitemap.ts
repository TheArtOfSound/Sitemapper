import { XMLParser } from 'fast-xml-parser';
import type { RawSitemapEntry } from '../types.js';
import { normalizePageUrl, sameHost } from '../utils/url.js';
import { fetchText } from './fetch.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

interface ParsedSitemap {
  childSitemaps: string[];
  urls: RawSitemapEntry[];
}

function parseSitemapXml(xml: string): ParsedSitemap {
  const parsed = parser.parse(xml) as any;
  const sitemapItems = asArray(parsed?.sitemapindex?.sitemap);
  const urlItems = asArray(parsed?.urlset?.url);

  const childSitemaps = sitemapItems
    .map((item: any) => item?.loc)
    .filter((loc: unknown): loc is string => typeof loc === 'string' && loc.length > 0)
    .filter(isLikelyXmlSitemapUrl);

  const urls = urlItems
    .map((item: any) => ({
      url: item?.loc,
      lastmod: item?.lastmod,
      changefreq: item?.changefreq,
      priority: item?.priority === undefined ? undefined : String(item.priority)
    }))
    .filter((entry: RawSitemapEntry) => typeof entry.url === 'string' && entry.url.length > 0);

  return { childSitemaps, urls };
}

export async function loadSitemapEntries(site: string, sitemapUrls: string[], timeoutMs: number): Promise<{ entries: RawSitemapEntry[]; loadedSitemaps: string[]; failedSitemaps: string[] }> {
  const queue = sitemapUrls.filter(isLikelyXmlSitemapUrl);
  const seenSitemaps = new Set<string>();
  const entries = new Map<string, RawSitemapEntry>();
  const loadedSitemaps: string[] = [];
  const failedSitemaps: string[] = [];

  while (queue.length > 0) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);

    try {
      const response = await fetchText(sitemapUrl, timeoutMs);
      if (!response.ok) {
        failedSitemaps.push(sitemapUrl);
        continue;
      }

      loadedSitemaps.push(sitemapUrl);
      try {
        const parsed = parseSitemapXml(response.text);
        queue.push(...parsed.childSitemaps.filter((url) => !seenSitemaps.has(url)));
        for (const entry of parsed.urls) putEntry(entries, site, entry);
      } catch {
        // Fall through to raw <loc> recovery below.
      }

      for (const loc of extractLocTags(response.text)) {
        if (!sameHost(loc, site)) continue;
        if (isLikelyXmlSitemapUrl(loc) && !seenSitemaps.has(loc)) {
          queue.push(loc);
          continue;
        }
        putEntry(entries, site, { url: loc, lastmod: extractLastmodNearLoc(response.text, loc) });
      }
    } catch {
      failedSitemaps.push(sitemapUrl);
    }
  }

  return {
    entries: Array.from(entries.values()).sort((a, b) => a.url.localeCompare(b.url)),
    loadedSitemaps,
    failedSitemaps
  };
}

function putEntry(entries: Map<string, RawSitemapEntry>, site: string, entry: RawSitemapEntry): void {
  try {
    const normalized = normalizePageUrl(entry.url);
    if (!sameHost(normalized, site)) return;
    if (isLikelyXmlSitemapUrl(normalized)) return;
    entries.set(normalized, { ...entry, url: normalized });
  } catch {
    // Ignore malformed URLs. They are not useful for the public index.
  }
}

function extractLocTags(xml: string): string[] {
  const out: string[] = [];
  const regex = /<loc[^>]*>\s*([^<\s]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml))) {
    try {
      out.push(normalizePageUrl(decodeXml(match[1])));
    } catch {
      // Ignore malformed loc values.
    }
  }
  return Array.from(new Set(out));
}

function extractLastmodNearLoc(xml: string, loc: string): string | undefined {
  const index = xml.indexOf(loc);
  if (index < 0) return undefined;
  const slice = xml.slice(Math.max(0, index - 600), Math.min(xml.length, index + 1200));
  return /<lastmod[^>]*>\s*([^<\s]+)\s*<\/lastmod>/i.exec(slice)?.[1]?.trim();
}

function isLikelyXmlSitemapUrl(input: string): boolean {
  try {
    const path = new URL(input).pathname.toLowerCase();
    if (path.endsWith('/llms.txt') || path.endsWith('/robots.txt')) return false;
    return /sitemap/.test(path) || /\.xml(\.gz)?$/.test(path);
  } catch {
    return false;
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
