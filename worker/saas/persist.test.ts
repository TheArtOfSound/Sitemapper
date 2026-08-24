import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import type { CrawlSnapshot } from '../../src/diff/snapshot.js';
import { ISSUE_UPSERT_SQL, resultToSnapshot, saveSnapshot } from './persist.js';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): {
      all(...values: unknown[]): unknown[];
      get(...values: unknown[]): unknown;
      run(...values: unknown[]): unknown;
    };
  };
};

type Database = InstanceType<typeof DatabaseSync>;

const databases: Database[] = [];

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function issueDb(): Database {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  db.exec(`
    CREATE TABLE issues (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      code TEXT NOT NULL,
      severity TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      resolved_at TEXT,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      affected_urls INTEGER NOT NULL DEFAULT 0,
      evidence TEXT,
      UNIQUE (project_id, code)
    );
    CREATE TABLE crawl_jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL
    )
  `);
  return db;
}

function sqliteD1(db: Database) {
  type Statement = ReturnType<typeof statement>;

  function statement(sql: string, values: unknown[] = []) {
    return {
      bind(...bound: unknown[]) {
        return statement(sql, bound);
      },
      async first() {
        return db.prepare(sql).get(...values) ?? null;
      },
      async all() {
        return { success: true, meta: { changes: 0 }, results: db.prepare(sql).all(...values) };
      },
      async run() {
        const result = db.prepare(sql).run(...values) as { changes: number | bigint };
        return { success: true, meta: { changes: Number(result.changes) }, results: [] };
      },
    };
  }

  return {
    prepare(sql: string) {
      return statement(sql);
    },
    async batch(statements: Statement[]) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const item of statements) results.push(await item.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

describe('issue reconciliation', () => {
  it('rejects a zero-inventory snapshot before writing its object', async () => {
    let objectWrites = 0;
    const snapshot: CrawlSnapshot = {
      site: 'https://example.com',
      generatedAt: '2026-08-22T12:00:00.000Z',
      sitemapUrls: ['https://example.com/sitemap.xml'],
      sitemapHashes: {},
      declaredCount: 0,
      liveCount: 0,
      indexableCount: 0,
      urls: [],
      issues: [],
      scores: { index: 0, seo: 0, sitemap: 0 },
    };

    await expect(
      saveSnapshot(
        {
          SNAPSHOTS: {
            async put() {
              objectWrites += 1;
            },
          },
        } as never,
        { projectId: 'prj_zero', kind: 'anonymous', snapshot }
      )
    ).rejects.toThrow('SCAN_INCONCLUSIVE');
    expect(objectWrites).toBe(0);
  });

  it('keeps non-sitemap journey probes out of sitemap source and indexable counts', () => {
    const snapshot = resultToSnapshot({
      site: 'https://example.com',
      generatedAt: '2026-08-22T12:00:00.000Z',
      source: {
        sitemapUrls: ['https://example.com/sitemap.xml'],
        discoveredUrlCount: 1,
      },
      pages: [
        {
          url: 'https://example.com/page',
          status: 200,
          deepChecked: true,
          sitemapListed: true,
          issues: [],
        },
        {
          url: 'https://example.com/checkout',
          status: 200,
          deepChecked: true,
          sitemapListed: false,
          issues: [],
        },
      ],
      issues: [],
      scores: { index: 90, seo: 90, sitemap: 90 },
      insights: { fingerprint: 'sp_test' },
    } as never);

    expect(snapshot.declaredCount).toBe(1);
    expect(snapshot.indexableCount).toBe(1);
    expect(snapshot.urls.find((row) => row.url.endsWith('/page'))?.sitemapSource).toBe(
      'https://example.com/sitemap.xml'
    );
    expect(snapshot.urls.find((row) => row.url.endsWith('/checkout'))?.sitemapSource).toBeUndefined();
  });

  it('reopens a resolved issue instead of violating the project/code uniqueness rule', () => {
    const db = issueDb();
    db.prepare(
      `INSERT INTO issues
       (id, project_id, code, severity, first_seen_at, last_seen_at, resolved_at, occurrence_count, affected_urls, evidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'iss_original',
      'prj_oortstack',
      'SITEMAPS_FOUND_BUT_UNUSABLE',
      'error',
      '2026-08-19T07:30:39.078Z',
      '2026-08-19T10:45:38.440Z',
      '2026-08-19T13:45:57.219Z',
      13,
      0,
      'old evidence'
    );

    db.prepare(ISSUE_UPSERT_SQL).run(
      'iss_replacement_that_must_not_be_inserted',
      'prj_oortstack',
      'SITEMAPS_FOUND_BUT_UNUSABLE',
      'warning',
      '2026-08-22T12:46:53.597Z',
      '2026-08-22T12:46:53.597Z',
      2,
      'fresh evidence'
    );

    const row = db
      .prepare('SELECT * FROM issues WHERE project_id = ? AND code = ?')
      .get('prj_oortstack', 'SITEMAPS_FOUND_BUT_UNUSABLE') as Record<string, unknown>;
    expect(row.id).toBe('iss_original');
    expect(row.first_seen_at).toBe('2026-08-19T07:30:39.078Z');
    expect(row.last_seen_at).toBe('2026-08-22T12:46:53.597Z');
    expect(row.resolved_at).toBeNull();
    expect(row.occurrence_count).toBe(14);
    expect(row.affected_urls).toBe(2);
    expect(row.severity).toBe('warning');
    expect(row.evidence).toBe('fresh evidence');
  });

  it('still inserts a genuinely new issue', () => {
    const db = issueDb();
    db.prepare(ISSUE_UPSERT_SQL).run(
      'iss_new',
      'prj_oortstack',
      'ROBOTS_ACCESS_CHANGED',
      'error',
      '2026-08-22T12:46:53.597Z',
      '2026-08-22T12:46:53.597Z',
      1,
      'robots.txt changed'
    );

    const row = db.prepare('SELECT * FROM issues WHERE id = ?').get('iss_new') as Record<string, unknown>;
    expect(row.occurrence_count).toBe(1);
    expect(row.resolved_at).toBeNull();
  });

  it('reopens, preserves, and resolves issues together in one snapshot reconciliation', async () => {
    const db = issueDb();
    db.exec(`
      CREATE TABLE snapshots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        job_id TEXT,
        kind TEXT NOT NULL,
        r2_key TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        declared_urls INTEGER NOT NULL,
        live_urls INTEGER NOT NULL,
        indexable_urls INTEGER NOT NULL,
        errors INTEGER NOT NULL,
        warnings INTEGER NOT NULL,
        notices INTEGER NOT NULL,
        index_score INTEGER,
        seo_score INTEGER,
        sitemap_score INTEGER,
        fingerprint TEXT,
        sitemap_hash TEXT,
        is_baseline INTEGER NOT NULL
      );
      INSERT INTO issues VALUES
        ('iss_recurring', 'prj_mix', 'RECURRING', 'error', '2026-08-01', '2026-08-02', '2026-08-03', 4, 1, 'old recurring'),
        ('iss_persistent', 'prj_mix', 'PERSISTENT', 'warning', '2026-08-01', '2026-08-02', NULL, 2, 1, 'old persistent'),
        ('iss_absent', 'prj_mix', 'ABSENT_NOW', 'warning', '2026-08-01', '2026-08-02', NULL, 7, 1, 'old absent');
    `);

    const snapshot: CrawlSnapshot = {
      site: 'https://example.com',
      generatedAt: '2026-08-22T12:46:53.597Z',
      sitemapUrls: [],
      sitemapHashes: {},
      declaredCount: 2,
      liveCount: 2,
      indexableCount: 2,
      urls: [],
      issues: [
        { code: 'RECURRING', severity: 'warning', url: 'https://example.com/a', evidence: 'fresh recurring' },
        { code: 'PERSISTENT', severity: 'error', url: 'https://example.com/b', evidence: 'fresh persistent' },
      ],
      scores: { index: 80, seo: 80, sitemap: 80 },
    };
    const objects = new Map<string, string>();
    await saveSnapshot(
      {
        DB: sqliteD1(db),
        SNAPSHOTS: {
          async put(key: string, value: string) {
            objects.set(key, value);
          },
        },
      } as never,
      { projectId: 'prj_mix', jobId: 'job_mix', kind: 'scheduled', snapshot }
    );

    const recurring = db.prepare("SELECT * FROM issues WHERE code = 'RECURRING'").get() as Record<string, unknown>;
    const persistent = db.prepare("SELECT * FROM issues WHERE code = 'PERSISTENT'").get() as Record<string, unknown>;
    const absent = db.prepare("SELECT * FROM issues WHERE code = 'ABSENT_NOW'").get() as Record<string, unknown>;
    expect(recurring).toMatchObject({
      id: 'iss_recurring',
      resolved_at: null,
      occurrence_count: 5,
      severity: 'warning',
      evidence: 'fresh recurring',
    });
    expect(persistent).toMatchObject({
      id: 'iss_persistent',
      resolved_at: null,
      occurrence_count: 3,
      severity: 'error',
      evidence: 'fresh persistent',
    });
    expect(absent.occurrence_count).toBe(7);
    expect(absent.resolved_at).not.toBeNull();
    expect(objects).toHaveLength(1);
  });

  it('diffs against the latest positive trusted snapshot instead of failed or legacy zero artifacts', async () => {
    const db = issueDb();
    db.exec(`
      CREATE TABLE snapshots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        job_id TEXT,
        kind TEXT NOT NULL,
        r2_key TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        declared_urls INTEGER NOT NULL,
        live_urls INTEGER NOT NULL,
        indexable_urls INTEGER NOT NULL,
        errors INTEGER NOT NULL,
        warnings INTEGER NOT NULL,
        notices INTEGER NOT NULL,
        index_score INTEGER,
        seo_score INTEGER,
        sitemap_score INTEGER,
        fingerprint TEXT,
        sitemap_hash TEXT,
        is_baseline INTEGER NOT NULL
      );
      CREATE TABLE change_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        previous_snapshot_id TEXT,
        code TEXT NOT NULL,
        severity TEXT NOT NULL,
        url TEXT,
        before_json TEXT,
        after_json TEXT,
        grouped_count INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO crawl_jobs (id, status) VALUES
        ('job_complete', 'complete'),
        ('job_failed', 'failed'),
        ('job_zero_complete', 'complete');
      INSERT INTO snapshots VALUES
        ('snap_complete', 'prj_trusted', 'job_complete', 'scheduled', 'trusted.json', '2026-08-20T00:00:00.000Z', 2, 2, 2, 0, 0, 0, 90, 90, 90, NULL, NULL, 1),
        ('snap_failed', 'prj_trusted', 'job_failed', 'scheduled', 'failed.json', '2026-08-21T00:00:00.000Z', 0, 0, 0, 1, 0, 0, 0, 0, 0, NULL, NULL, 0),
        ('snap_zero_complete', 'prj_trusted', 'job_zero_complete', 'scheduled', 'zero-complete.json', '2026-08-21T06:00:00.000Z', 0, 0, 0, 1, 0, 0, 0, 0, 0, NULL, NULL, 0),
        ('snap_zero_jobless', 'prj_trusted', NULL, 'anonymous', 'zero-jobless.json', '2026-08-21T12:00:00.000Z', 0, 0, 0, 1, 0, 0, 0, 0, 0, NULL, NULL, 0);
    `);

    const urlState = (url: string) => ({
      url,
      status: 200,
      noindex: false,
      robotsAllowed: true,
      deepChecked: true,
    });
    const trusted: CrawlSnapshot = {
      site: 'https://example.com',
      generatedAt: '2026-08-20T00:00:00.000Z',
      sitemapUrls: ['https://example.com/sitemap.xml'],
      sitemapHashes: {},
      declaredCount: 2,
      liveCount: 2,
      indexableCount: 2,
      urls: [urlState('https://example.com/a'), urlState('https://example.com/b')],
      issues: [],
      scores: { index: 90, seo: 90, sitemap: 90 },
    };
    const failed: CrawlSnapshot = {
      ...trusted,
      generatedAt: '2026-08-21T00:00:00.000Z',
      declaredCount: 0,
      liveCount: 0,
      indexableCount: 0,
      urls: [],
      scores: { index: 0, seo: 0, sitemap: 0 },
    };
    const zeroLegacy: CrawlSnapshot = {
      ...failed,
      sitemapUrls: ['https://example.com/legacy-candidate.xml'],
    };
    const next: CrawlSnapshot = {
      ...trusted,
      generatedAt: '2026-08-22T00:00:00.000Z',
      declaredCount: 3,
      liveCount: 3,
      indexableCount: 3,
      urls: [...trusted.urls, urlState('https://example.com/c')],
    };
    const objects = new Map<string, string>([
      ['trusted.json', JSON.stringify(trusted)],
      ['failed.json', JSON.stringify(failed)],
      ['zero-complete.json', JSON.stringify(zeroLegacy)],
      ['zero-jobless.json', JSON.stringify(zeroLegacy)],
    ]);

    const saved = await saveSnapshot(
      {
        DB: sqliteD1(db),
        SNAPSHOTS: {
          async put(key: string, value: string) {
            objects.set(key, value);
          },
          async get(key: string) {
            const value = objects.get(key);
            return value === undefined ? null : { text: async () => value };
          },
        },
      } as never,
      { projectId: 'prj_trusted', jobId: 'job_new', kind: 'scheduled', snapshot: next }
    );

    expect(saved.events.find((event) => event.code === 'URL_ADDED')).toMatchObject({ count: 1 });
    expect(saved.events.some((event) => event.code === 'SITEMAP_DISAPPEARED')).toBe(false);
    const lineage = db
      .prepare('SELECT DISTINCT previous_snapshot_id FROM change_events WHERE snapshot_id = ?')
      .all(saved.snapshotId) as Array<{ previous_snapshot_id: string }>;
    expect(lineage).toEqual([{ previous_snapshot_id: 'snap_complete' }]);
  });
});
