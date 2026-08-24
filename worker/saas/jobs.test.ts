import { describe, expect, it, vi } from 'vitest';
import { buildInsights } from '../insights.js';
import type { Result } from '../render.js';
import { assertConclusiveCrawlResult, handleQueue, handleScheduled, runCrawlJob } from './jobs.js';

function sourceWithCount(discoveredUrlCount: number): Result['source'] {
  return {
    robotsUrl: 'https://example.com/robots.txt',
    sitemapUrls: ['https://example.com/sitemap.xml'],
    discoveredFromRobots: true,
    inputMode: 'site',
    testedUrls: ['https://example.com/sitemap.xml'],
    failures: [],
    compatibility: 'Compatible',
    discoveredUrlCount,
    deepCheckedCount: 1,
  };
}

function conclusiveResult(): Result {
  const site = 'https://example.com';
  const source = sourceWithCount(1);
  const scores: Result['scores'] = { index: 90, seo: 80, sitemap: 70, available: true };
  const pages: Result['pages'] = [
    {
      url: 'https://example.com/',
      path: '/',
      type: 'page',
      section: '/',
      deepChecked: true,
      status: 200,
      issues: [],
    },
  ];
  return {
    site,
    generatedAt: '2026-08-22T14:00:00.000Z',
    source,
    scores,
    stats: { pages: 1, sections: 1, errors: 0, warnings: 0, notices: 0 },
    pages,
    issues: [],
    insights: buildInsights(site, pages, source, scores),
  };
}

function persistenceGuardEnv() {
  const sqlCalls: string[] = [];
  let snapshotWrites = 0;
  const env = {
    DB: {
      prepare(sql: string) {
        sqlCalls.push(sql);
        return {
          bind(..._values: unknown[]) {
            return {
              async run() {
                if (sql.startsWith('UPDATE crawl_jobs SET status = ?, started_at')) {
                  return { meta: { changes: 1 } };
                }
                throw new Error(`Unexpected run(): ${sql}`);
              },
              async first() {
                if (sql.includes('SELECT plan, stripe_status FROM workspaces')) {
                  return { plan: 'free', stripe_status: '' };
                }
                if (sql.includes('SELECT deep_checks FROM usage_counters')) return { deep_checks: 0 };
                throw new Error(`Unexpected first(): ${sql}`);
              },
            };
          },
        };
      },
    },
    SNAPSHOTS: {
      async put() {
        snapshotWrites += 1;
        throw new Error('Snapshot persistence must not be reached.');
      },
    },
  };
  return { env, sqlCalls, snapshotWrites: () => snapshotWrites };
}

function scheduledEnv(insertChanges: number) {
  const sent: unknown[] = [];
  let monitorUpdates = 0;
  const row = {
    project_id: 'prj_oortstack',
    frequency_minutes: 1440,
    workspace_id: 'ws_operator',
    site_url: 'https://oortstack.com',
  };
  const DB = {
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) {
          return {
            async all() {
              if (sql.includes('FROM monitors m JOIN projects')) return { results: [row] };
              throw new Error(`Unexpected all(): ${sql}`);
            },
            async first() {
              if (sql.includes("status IN ('queued', 'running')")) return null;
              throw new Error(`Unexpected first(): ${sql}`);
            },
            async run() {
              if (sql.startsWith('INSERT OR IGNORE INTO crawl_jobs')) return { meta: { changes: insertChanges } };
              if (sql.startsWith('UPDATE monitors SET last_started_at')) {
                monitorUpdates += 1;
                return { meta: { changes: 1 } };
              }
              throw new Error(`Unexpected run(): ${sql}`);
            },
          };
        },
      };
    },
  };

  return {
    env: {
      DB,
      CRAWLS: {
        async send(message: unknown) {
          sent.push(message);
        },
      },
    },
    sent,
    monitorUpdates: () => monitorUpdates,
  };
}

describe('scheduled crawl enqueueing', () => {
  it('does not send an orphan queue message when the idempotency insert was ignored', async () => {
    const test = scheduledEnv(0);
    await handleScheduled(test.env as never);
    expect(test.sent).toEqual([]);
    expect(test.monitorUpdates()).toBe(0);
  });

  it('queues and advances the monitor only after creating the job row', async () => {
    const test = scheduledEnv(1);
    await handleScheduled(test.env as never);
    expect(test.sent).toHaveLength(1);
    expect(test.monitorUpdates()).toBe(1);
  });
});

describe('crawl evidence guard', () => {
  it('rejects an inconclusive crawl before snapshot persistence', async () => {
    const test = persistenceGuardEnv();
    const result = {
      issues: [{ code: 'SCAN_INCONCLUSIVE', severity: 'notice', message: 'Timed out.' }],
      scores: { index: 0, seo: 0, sitemap: 0, available: false },
      source: sourceWithCount(0),
    };

    await expect(
      runCrawlJob(
        test.env as never,
        {
          jobId: 'job_inconclusive',
          projectId: 'prj_oortstack',
          workspaceId: 'ws_operator',
          kind: 'scheduled',
          siteUrl: 'https://oortstack.com',
        },
        async () => result as never
      )
    ).rejects.toThrow('SCAN_INCONCLUSIVE');

    expect(test.snapshotWrites()).toBe(0);
    expect(test.sqlCalls.some((sql) => sql.includes('INSERT INTO snapshots'))).toBe(false);
  });

  it('rejects zero sitemap inventory before snapshot persistence even when journey pages and scores are available', async () => {
    const test = persistenceGuardEnv();
    const result = {
      issues: [],
      scores: { index: 90, seo: 80, sitemap: 70, available: true },
      source: sourceWithCount(0),
      pages: [
        {
          url: 'https://example.com/pricing',
          path: '/pricing',
          type: 'page',
          section: '/',
          deepChecked: true,
          status: 200,
          issues: [],
        },
      ],
    };

    await expect(
      runCrawlJob(
        test.env as never,
        {
          jobId: 'job_zero_inventory',
          projectId: 'prj_oortstack',
          workspaceId: 'ws_operator',
          kind: 'scheduled',
          siteUrl: 'https://oortstack.com',
        },
        async () => result as never
      )
    ).rejects.toThrow('SCAN_INCONCLUSIVE');

    expect(test.snapshotWrites()).toBe(0);
    expect(test.sqlCalls.some((sql) => sql.includes('INSERT INTO snapshots'))).toBe(false);
  });

  it('accepts inventory counts at or above one when the crawl is otherwise conclusive', () => {
    expect(() =>
      assertConclusiveCrawlResult({
        issues: [],
        scores: { index: 90, seo: 80, sitemap: 70, available: true },
        source: sourceWithCount(1),
      })
    ).not.toThrow();
  });

  it('accepts legacy scored results when the availability marker is absent and inventory exists', () => {
    expect(() =>
      assertConclusiveCrawlResult({
        issues: [],
        scores: { index: 90, seo: 80, sitemap: 70 },
        source: sourceWithCount(1),
      })
    ).not.toThrow();
  });

  it('acknowledges a completed crawl when later bookkeeping fails and continues independent effects', async () => {
    const writes: Array<{ sql: string; values: unknown[] }> = [];
    let snapshotWrites = 0;
    let usageWrites = 0;
    let acknowledgements = 0;
    let retries = 0;
    const env = {
      DB: {
        prepare(sql: string) {
          return {
            bind(...values: unknown[]) {
              return {
                async first() {
                  if (sql.includes('SELECT plan, stripe_status FROM workspaces')) {
                    return { plan: 'free', stripe_status: '' };
                  }
                  if (sql.includes('SELECT deep_checks FROM usage_counters')) return { deep_checks: 0 };
                  if (sql.includes('FROM snapshots s')) return null;
                  throw new Error(`Unexpected first(): ${sql}`);
                },
                async all() {
                  if (sql.includes('SELECT code, id FROM issues')) return { results: [] };
                  throw new Error(`Unexpected all(): ${sql}`);
                },
                async run() {
                  writes.push({ sql, values });
                  if (sql.startsWith('UPDATE monitors SET last_finished_at')) {
                    throw new Error('monitor bookkeeping unavailable');
                  }
                  if (sql.includes('INSERT INTO usage_counters')) usageWrites += 1;
                  return { meta: { changes: 1 } };
                },
              };
            },
          };
        },
      },
      SNAPSHOTS: {
        async put() {
          snapshotWrites += 1;
        },
      },
    };
    const body = {
      jobId: 'job_post_commit_failure',
      projectId: 'prj_oortstack',
      workspaceId: 'ws_operator',
      kind: 'scheduled' as const,
      siteUrl: 'https://oortstack.com',
    };
    let loggedError = '';
    const errorLog = vi.spyOn(console, 'error').mockImplementation((entry) => {
      loggedError = String(entry);
    });

    try {
      await handleQueue(
        {
          messages: [
            {
              body,
              ack() {
                acknowledgements += 1;
              },
              retry() {
                retries += 1;
              },
            },
          ],
        } as never,
        env as never,
        async () => conclusiveResult()
      );
    } finally {
      errorLog.mockRestore();
    }

    const completedJob = writes.find((write) => write.sql.startsWith('UPDATE crawl_jobs SET status = ?, error = NULL, finished_at'));
    const demotedJob = writes.find(
      (write) => write.sql.startsWith('UPDATE crawl_jobs SET status = ?, error = ?') && write.values[0] === 'failed'
    );
    expect(snapshotWrites).toBe(1);
    expect(completedJob?.values[0]).toBe('complete');
    expect(completedJob?.sql).toContain('error = NULL');
    expect(demotedJob).toBeUndefined();
    expect(usageWrites).toBe(1);
    expect(acknowledgements).toBe(1);
    expect(retries).toBe(0);
    expect(loggedError).toContain('"event":"crawl_post_commit_step_failed"');
    expect(loggedError).toContain('"step":"monitor"');
  });

  it('marks both the job and monitor failed before retrying a failed analysis', async () => {
    const writes: Array<{ sql: string; values: unknown[] }> = [];
    let acknowledgements = 0;
    let retries = 0;
    const env = {
      DB: {
        prepare(sql: string) {
          return {
            bind(...values: unknown[]) {
              return {
                async first() {
                  if (sql.includes('SELECT plan, stripe_status FROM workspaces')) {
                    return { plan: 'free', stripe_status: '' };
                  }
                  if (sql.includes('SELECT deep_checks FROM usage_counters')) return { deep_checks: 0 };
                  throw new Error(`Unexpected first(): ${sql}`);
                },
                async run() {
                  writes.push({ sql, values });
                  return { meta: { changes: 1 } };
                },
              };
            },
          };
        },
      },
    };
    const body = {
      jobId: 'job_failed_analysis',
      projectId: 'prj_oortstack',
      workspaceId: 'ws_operator',
      kind: 'scheduled' as const,
      siteUrl: 'https://oortstack.com',
    };

    await handleQueue(
      {
        messages: [
          {
            body,
            ack() {
              acknowledgements += 1;
            },
            retry() {
              retries += 1;
            },
          },
        ],
      } as never,
      env as never,
      async () => {
        throw new Error('origin timed out');
      }
    );

    const failedJob = writes.find((write) => write.sql.startsWith('UPDATE crawl_jobs SET status = ?, error'));
    const failedMonitor = writes.find((write) => write.sql.startsWith('UPDATE monitors SET last_finished_at'));
    expect(failedJob?.values[0]).toBe('failed');
    expect(failedMonitor?.values[1]).toBe('failed');
    expect(failedMonitor?.values[2]).toBe('prj_oortstack');
    expect(acknowledgements).toBe(0);
    expect(retries).toBe(1);
  });
});
