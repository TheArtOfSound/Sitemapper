import type { SitemapperResult } from '../types.js';
import { csvEscape } from '../utils/fs.js';

export function renderCsv(result: SitemapperResult): string {
  const header = [
    'url',
    'path',
    'section',
    'title',
    'description',
    'canonical',
    'lastmod',
    'status',
    'issue_count',
    'issues'
  ];

  const rows = result.pages.map((page) => [
    page.url,
    page.path,
    page.section,
    page.title ?? '',
    page.description ?? '',
    page.canonical ?? '',
    page.lastmod ?? '',
    page.status ?? '',
    page.issues.length,
    page.issues.map((issue) => `${issue.severity}:${issue.code}`).join('|')
  ]);

  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n') + '\n';
}
