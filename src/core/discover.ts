import type { SitemapSource } from '../types.js';
import { fetchText } from './fetch.js';

export async function discoverSitemaps(site: string, timeoutMs: number): Promise<SitemapSource> {
  const base = new URL(site);
  const robotsUrl = `${base.origin}/robots.txt`;
  const fallback = `${base.origin}/sitemap.xml`;

  try {
    const robots = await fetchText(robotsUrl, timeoutMs);
    const sitemapUrls = robots.ok
      ? robots.text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => /^sitemap\s*:/i.test(line))
          .map((line) => line.replace(/^sitemap\s*:/i, '').trim())
          .filter(Boolean)
      : [];

    return {
      robotsUrl,
      sitemapUrls: sitemapUrls.length > 0 ? sitemapUrls : [fallback],
      discoveredFromRobots: sitemapUrls.length > 0
    };
  } catch {
    return {
      robotsUrl,
      sitemapUrls: [fallback],
      discoveredFromRobots: false
    };
  }
}
