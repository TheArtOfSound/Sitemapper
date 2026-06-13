import type { SitemapSource } from '../types.js';
import { fetchText } from './fetch.js';
import { parseRobots, type RobotsRules } from './robots.js';

export interface DiscoveryResult extends SitemapSource {
  rules: RobotsRules;
}

export async function discoverSitemaps(site: string, timeoutMs: number): Promise<DiscoveryResult> {
  const base = new URL(site);
  const robotsUrl = `${base.origin}/robots.txt`;
  const fallback = `${base.origin}/sitemap.xml`;

  try {
    const robots = await fetchText(robotsUrl, timeoutMs);
    const rules = parseRobots(robots.ok ? robots.text : '');
    const sitemapUrls = robots.ok ? extractUsableSitemapUrls(robots.text) : [];

    return {
      robotsUrl,
      sitemapUrls: sitemapUrls.length > 0 ? sitemapUrls : [fallback],
      discoveredFromRobots: sitemapUrls.length > 0,
      rules
    };
  } catch {
    return {
      robotsUrl,
      sitemapUrls: [fallback],
      discoveredFromRobots: false,
      rules: parseRobots('')
    };
  }
}

function extractUsableSitemapUrls(robotsText: string): string[] {
  return robotsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^sitemap\s*:/i.test(line))
    .map((line) => line.replace(/^sitemap\s*:/i, '').trim())
    .filter(Boolean)
    .filter(isLikelyXmlSitemapUrl);
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
