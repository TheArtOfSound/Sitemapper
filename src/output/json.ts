import type { SitemapperResult } from '../types.js';

export function renderJson(result: SitemapperResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
