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
    .filter((loc: unknown): loc is string => typeof loc === 'string' && loc.length > 0);

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
  const queue = [...sitemapUrls];
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
      const parsed = parseSitemapXml(response.text);
      queue.push(...parsed.childSitemaps.filter((url) => !seenSitemaps.has(url)));

      for (const entry of parsed.urls) {
        try {
          const normalized = normalizePageUrl(entry.url);
          if (!sameHost(normalized, site)) continue;
          entries.set(normalized, { ...entry, url: normalized });
        } catch {
          // Ignore malformed URLs. They are not useful for the public index.
        }
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
