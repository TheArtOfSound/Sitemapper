#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { buildSiteIndex } from './build.js';
import { evaluateGuard, snapshotFromAuditJson, DEFAULT_GUARD_RULES } from './guard.js';

const program = new Command();

program
  .name('sitemapper')
  .description('Indexability audits, sitemap inventories, and deploy regression guards.')
  .version('0.8.0');

program
  .command('build')
  .argument('<site>', 'Domain or URL to index')
  .option('-o, --out <dir>', 'Output directory', 'site-index')
  .option('--max-pages <number>', 'Maximum sitemap pages to fetch and inspect', parseInteger, 500)
  .option('--concurrency <number>', 'Concurrent page fetches', parseInteger, 8)
  .option('--timeout <ms>', 'Fetch timeout in milliseconds', parseInteger, 12000)
  .description('Build a public index page and SEO report from a site sitemap')
  .action(async (site: string, options: { out: string; maxPages: number; concurrency: number; timeout: number }) => {
    try {
      const result = await buildSiteIndex({
        site,
        outDir: options.out,
        maxPages: options.maxPages,
        concurrency: options.concurrency,
        fetchTimeoutMs: options.timeout
      });

      printSummary(result, options.out);
    } catch (error) {
      console.error(`Sitemapper failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  });

program
  .command('audit')
  .argument('<site>', 'Domain or URL to audit')
  .option('-o, --out <dir>', 'Output directory', 'site-index')
  .option('--max-pages <number>', 'Maximum sitemap pages to fetch and inspect', parseInteger, 500)
  .option('--concurrency <number>', 'Concurrent page fetches', parseInteger, 8)
  .option('--timeout <ms>', 'Fetch timeout in milliseconds', parseInteger, 12000)
  .description('Alias for build; creates the same public index and SEO report')
  .action(async (site: string, options: { out: string; maxPages: number; concurrency: number; timeout: number }) => {
    try {
      const result = await buildSiteIndex({
        site,
        outDir: options.out,
        maxPages: options.maxPages,
        concurrency: options.concurrency,
        fetchTimeoutMs: options.timeout
      });

      printSummary(result, options.out);
    } catch (error) {
      console.error(`Sitemapper failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  });

program
  .command('guard')
  .description('Compare two Sitemapper JSON snapshots and fail on configured indexability regressions')
  .requiredOption('--current <file>', 'Current audit JSON (index.json or seo-report.json)')
  .requiredOption('--baseline <file>', 'Baseline audit JSON')
  .option('--json', 'Print machine-readable JSON', false)
  .action(async (options: { current: string; baseline: string; json?: boolean }) => {
    try {
      const current = snapshotFromAuditJson(JSON.parse(await readFile(options.current, 'utf8')));
      const baseline = snapshotFromAuditJson(JSON.parse(await readFile(options.baseline, 'utf8')));
      const result = evaluateGuard(baseline, current, DEFAULT_GUARD_RULES);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.passed ? 'Sitemapper guard: passed' : 'Sitemapper guard: FAILED');
        console.log(result.summary);
        for (const failure of result.failures) {
          console.log(`- [${failure.class}] ${failure.code} ${failure.summary}`);
        }
      }
      if (!result.passed) process.exitCode = 1;
    } catch (error) {
      console.error(`Sitemapper guard failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  });

program.parse(process.argv);

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, received ${value}`);
  }
  return parsed;
}

function printSummary(result: Awaited<ReturnType<typeof buildSiteIndex>>, outDir: string): void {
  console.log('\nSitemapper');
  console.log(`Site: ${result.site}`);
  console.log(`Pages: ${result.stats.pages}`);
  console.log(`Sections: ${result.stats.sections}`);
  console.log(`Errors: ${result.stats.errors}`);
  console.log(`Warnings: ${result.stats.warnings}`);
  console.log(`Notices: ${result.stats.notices}`);
  console.log('\nScores');
  console.log(`Index: ${result.scores.index}/100`);
  console.log(`SEO: ${result.scores.seo}/100`);
  console.log(`Sitemap: ${result.scores.sitemap}/100`);
  console.log('\nOutput');
  console.log(`✓ ${outDir}/index.html`);
  console.log(`✓ ${outDir}/index.json`);
  console.log(`✓ ${outDir}/seo-report.json`);
  console.log(`✓ ${outDir}/pages.csv`);
  console.log('');
}
