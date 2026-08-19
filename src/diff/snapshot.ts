export type UrlState = {
  url: string;
  status?: number;
  title?: string;
  description?: string;
  canonical?: string;
  lastmod?: string;
  noindex: boolean;
  robotsAllowed: boolean;
  finalUrl?: string;
  redirectTarget?: string;
  sitemapSource?: string;
  deepChecked: boolean;
};

export type SnapshotIssue = {
  code: string;
  severity: string;
  url?: string;
  message?: string;
  evidence?: string;
};

export type CrawlSnapshot = {
  site: string;
  generatedAt: string;
  sitemapUrls: string[];
  sitemapHashes: Record<string, string>;
  declaredCount: number;
  liveCount: number;
  indexableCount: number;
  urls: UrlState[];
  issues: SnapshotIssue[];
  scores: { index: number; seo: number; sitemap: number };
  fingerprint?: string;
};

export function sitemapInventoryHash(snapshot: Pick<CrawlSnapshot, 'sitemapUrls' | 'urls'>): string {
  const urls = snapshot.urls.map((row) => row.url).sort();
  const sitemaps = [...snapshot.sitemapUrls].sort();
  return `${sitemaps.join('|')}::${urls.length}::${urls.slice(0, 20).join(',')}`;
}

export function urlMap(snapshot: CrawlSnapshot): Map<string, UrlState> {
  return new Map(snapshot.urls.map((row) => [row.url, row]));
}
