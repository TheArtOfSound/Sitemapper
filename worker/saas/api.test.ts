import { describe, expect, it } from 'vitest';
import { handlePublicApi } from './api.js';

type QueryCall = { sql: string; values: unknown[] };

function apiEnv() {
  const calls: QueryCall[] = [];
  const DB = {
    prepare(sql: string) {
      const call: QueryCall = { sql, values: [] };
      calls.push(call);
      return {
        bind(...values: unknown[]) {
          call.values = values;
          return {
            async first() {
              if (sql.includes('FROM api_keys k JOIN workspaces')) {
                return {
                  workspace_id: 'wsp_demo',
                  revoked_at: null,
                  plan: 'pro',
                  stripe_status: 'active',
                  owner_user_id: 'usr_demo',
                };
              }
              if (sql.startsWith('SELECT * FROM projects')) {
                return { id: 'prj_demo', host: 'example.com', site_url: 'https://example.com' };
              }
              if (sql.includes('FROM snapshots s')) {
                return {
                  declared_urls: 10,
                  errors: 0,
                  warnings: 0,
                  index_score: 100,
                  seo_score: 100,
                  sitemap_score: 100,
                  generated_at: '2026-08-22T00:00:00.000Z',
                  fingerprint: 'trusted',
                };
              }
              throw new Error(`Unexpected first(): ${sql}`);
            },
            async all() {
              if (sql.includes('FROM change_events c')) return { results: [] };
              throw new Error(`Unexpected all(): ${sql}`);
            },
            async run() {
              if (sql.startsWith('UPDATE api_keys SET last_used_at')) return { meta: { changes: 1 } };
              throw new Error(`Unexpected run(): ${sql}`);
            },
          };
        },
      };
    },
  };
  return { env: { DB } as never, calls };
}

function apiRequest(path: string): Request {
  return new Request(`https://sitemapper.example${path}`, {
    headers: { authorization: 'Bearer sk_live_test-token' },
  });
}

describe('trusted API reads', () => {
  it('filters change events through completed current snapshots and positive prior evidence', async () => {
    const test = apiEnv();
    const response = await handlePublicApi(apiRequest('/api/v1/sites/prj_demo/changes'), test.env, '/api/v1/sites/prj_demo/changes');

    expect(response?.status).toBe(200);
    const call = test.calls.find((candidate) => candidate.sql.includes('FROM change_events c'));
    expect(call?.sql).toContain('JOIN snapshots s ON s.id = c.snapshot_id');
    expect(call?.sql).toContain('JOIN snapshots ps ON ps.id = c.previous_snapshot_id');
    expect(call?.sql).toContain('LEFT JOIN crawl_jobs j ON j.id = s.job_id');
    expect(call?.sql).toContain("(s.job_id IS NULL OR j.status = 'complete')");
    expect(call?.sql).toContain('ps.declared_urls > 0');
    expect(call?.values[0]).toBe('prj_demo');
    expect(call?.values[1]).toEqual(expect.any(String));
  });

  it('returns the latest positive completed or legacy snapshot for a site', async () => {
    const test = apiEnv();
    const response = await handlePublicApi(apiRequest('/api/v1/sites/prj_demo'), test.env, '/api/v1/sites/prj_demo');

    expect(response?.status).toBe(200);
    const call = test.calls.find((candidate) => candidate.sql.includes('FROM snapshots s'));
    expect(call?.sql).toContain('LEFT JOIN crawl_jobs j ON j.id = s.job_id');
    expect(call?.sql).toContain("(s.job_id IS NULL OR j.status = 'complete')");
    expect(call?.sql).toContain('s.declared_urls > 0');
    expect(call?.sql).toContain('ORDER BY s.generated_at DESC');
    expect(call?.values).toEqual(['prj_demo']);
  });
});
