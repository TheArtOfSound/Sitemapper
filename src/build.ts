import { join } from 'node:path';
import type { SitemapperOptions, SitemapperResult } from './types.js';
import { runAudit } from './core/audit.js';
import { renderCsv } from './output/csv.js';
import { renderHtml } from './output/html.js';
import { renderJson } from './output/json.js';
import { writeTextFile } from './utils/fs.js';
import { normalizeSite } from './utils/url.js';

export interface BuildInput {
  site: string;
  outDir?: string;
  maxPages?: number;
  concurrency?: number;
  fetchTimeoutMs?: number;
  includeDescriptions?: boolean;
}

export async function buildSiteIndex(input: BuildInput): Promise<SitemapperResult> {
  const options: SitemapperOptions = {
    site: normalizeSite(input.site),
    outDir: input.outDir ?? 'site-index',
    maxPages: input.maxPages ?? 500,
    concurrency: input.concurrency ?? 8,
    fetchTimeoutMs: input.fetchTimeoutMs ?? 12000,
    includeDescriptions: input.includeDescriptions ?? true
  };

  const result = await runAudit(options);

  await writeTextFile(join(options.outDir, 'index.html'), renderHtml(result));
  await writeTextFile(join(options.outDir, 'index.json'), renderJson(result));
  await writeTextFile(join(options.outDir, 'seo-report.json'), renderJson(result));
  await writeTextFile(join(options.outDir, 'pages.csv'), renderCsv(result));

  return result;
}
