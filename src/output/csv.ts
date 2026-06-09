import type { SitemapperResult } from '../types.js';
import { csvEscape } from '../utils/fs.js';

export function renderCsv(result: SitemapperResult): string {
  const header = [
    'url',
    'path',
    'display_path',
    'section',
    'page_type',
    'title',
    'description',
    'canonical',
    'final_url',
    'lastmod',
    'status',
    'issue_count',
    'issues'
  ];

  const rows = result.pages.map((page) => [
    page.url,
    page.path,
    page.displayPath,
    page.section,
    page.pageType,
    page.title ?? '',
    page.description ?? '',
    page.canonical ?? '',
    page.finalUrl ?? '',
    page.lastmod ?? '',
    page.status ?? '',
    page.issues.length,
    page.issues.map((issue) => `${issue.severity}:${issue.code}`).join('|')
  ]);

  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n') + '\n';
}
