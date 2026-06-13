import { describe, expect, it } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildSiteIndex } from '../build.js';

// Live network test. Skipped by default so the deterministic suite stays offline
// and fast. Enable with: SITEMAPPER_LIVE=1 npm run test:live
const LIVE = Boolean(process.env.SITEMAPPER_LIVE);
const TARGET = process.env.SITEMAPPER_LIVE_SITE ?? 'https://wesearch.press';

describe.skipIf(!LIVE)('live end-to-end CLI build', () => {
  it('produces all four output artifacts from a real public site', async () => {
    const outDir = join(tmpdir(), 'sitemapper-live-test');
    await rm(outDir, { recursive: true, force: true });

    const result = await buildSiteIndex({ site: TARGET, outDir, maxPages: 25, concurrency: 6, fetchTimeoutMs: 12000 });

    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.scores.index).toBeGreaterThanOrEqual(0);
    expect(result.scores.index).toBeLessThanOrEqual(100);

    const json = JSON.parse(await readFile(join(outDir, 'index.json'), 'utf8'));
    expect(json.site).toBe(result.site);
    expect(json.pages).toHaveLength(result.pages.length);

    const seo = JSON.parse(await readFile(join(outDir, 'seo-report.json'), 'utf8'));
    expect(seo.scores).toBeDefined();

    const csv = await readFile(join(outDir, 'pages.csv'), 'utf8');
    expect(csv.split('\n')[0]).toContain('url,path,display_path');

    const htmlOut = await readFile(join(outDir, 'index.html'), 'utf8');
    expect(htmlOut).toContain('id="sitemapper-data"');

    await rm(outDir, { recursive: true, force: true });
  }, 60000);
});
