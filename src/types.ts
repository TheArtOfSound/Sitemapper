export type IssueSeverity = 'error' | 'warning' | 'notice' | 'pass';

export type PageType =
  | 'home'
  | 'static'
  | 'category'
  | 'category_page'
  | 'archive'
  | 'cluster'
  | 'canvas'
  | 'source'
  | 'story'
  | 'generated'
  | 'unknown';

export interface SitemapperOptions {
  site: string;
  outDir: string;
  maxPages: number;
  concurrency: number;
  fetchTimeoutMs: number;
  includeDescriptions: boolean;
}

export interface SitemapSource {
  robotsUrl: string;
  sitemapUrls: string[];
  discoveredFromRobots: boolean;
}

export interface RawSitemapEntry {
  url: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

export interface PageIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
}

export interface PageRecord {
  url: string;
  path: string;
  displayPath: string;
  section: string;
  pageType: PageType;
  title?: string;
  description?: string;
  canonical?: string;
  finalUrl?: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
  status?: number;
  ok: boolean;
  issues: PageIssue[];
}

export interface SitemapperScores {
  index: number;
  seo: number;
  sitemap: number;
}

export interface SitemapperStats {
  pages: number;
  sections: number;
  warnings: number;
  errors: number;
  notices: number;
}

export interface SitemapperResult {
  site: string;
  generatedAt: string;
  source: SitemapSource;
  scores: SitemapperScores;
  stats: SitemapperStats;
  pages: PageRecord[];
  issues: PageIssue[];
}
