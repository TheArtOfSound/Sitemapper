/**
 * Google Search Console adapter.
 *
 * Official APIs used:
 * - Webmasters sites.list
 * - sitemaps.list / sitemaps.submit (submit is a hint, not an indexing guarantee)
 * - searchanalytics.query
 * - urlInspection.index.inspect (inspects index state; does NOT request indexing)
 *
 * We never infer "Google indexed" from HTTP 200.
 */

import { json, nowIso, originOf, type Env } from './env.js';
import type { SessionUser } from './auth.js';

export type GscProperty = { siteUrl: string; permissionLevel: string };

export type GscListing = {
  connected: boolean;
  properties: GscProperty[];
  note?: string;
  error?: string;
};

type StoredGsc = { refresh_token: string; client_id?: string; client_secret?: string };

export function parseStoredRefresh(raw: string): StoredGsc {
  try {
    const parsed = JSON.parse(raw) as StoredGsc;
    if (parsed && typeof parsed.refresh_token === 'string' && parsed.refresh_token) return parsed;
  } catch {
    /* plain refresh token from older rows */
  }
  return { refresh_token: raw };
}

function googleHeaders(env: Env, token: string, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, ...extra };
  if (env.GOOGLE_QUOTA_PROJECT) headers['x-goog-user-project'] = env.GOOGLE_QUOTA_PROJECT;
  return headers;
}

export async function listGscProperties(env: Env, user: SessionUser): Promise<GscListing> {
  const token = await accessToken(env, user);
  if (!token) return { connected: false, properties: [], note: 'Google Search Console is not connected.' };
  const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', { headers: googleHeaders(env, token) });
  const body = (await res.json()) as {
    siteEntry?: GscProperty[];
    error?: { message?: string };
  };
  if (!res.ok) {
    return {
      connected: true,
      properties: [],
      error: body.error?.message || `Search Console list failed (${res.status}).`,
    };
  }
  const properties = body.siteEntry || [];
  await env.DB.prepare('UPDATE gsc_connections SET properties_json = ? WHERE workspace_id = ?')
    .bind(JSON.stringify(properties), user.workspaceId)
    .run();
  return { connected: true, properties };
}

export async function inspectUrl(env: Env, user: SessionUser, siteUrl: string, inspectionUrl: string): Promise<unknown> {
  const token = await accessToken(env, user);
  if (!token) return { error: 'Search Console is not connected.', googleState: 'unknown' };
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: googleHeaders(env, token, { 'content-type': 'application/json' }),
    body: JSON.stringify({ inspectionUrl, siteUrl }),
  });
  const body = (await res.json()) as {
    inspectionResult?: {
      indexStatusResult?: { verdict?: string; coverageState?: string; lastCrawlTime?: string };
      inspectionResultLink?: string;
    };
    error?: { message?: string };
  };
  const status = body.inspectionResult?.indexStatusResult;
  return {
    googleState: res.ok ? 'authorized' : 'error',
    coverageState: status?.coverageState || null,
    verdict: status?.verdict || null,
    lastCrawlTime: status?.lastCrawlTime || null,
    inspection: body,
    error: res.ok ? undefined : body.error?.message || `Inspect failed (${res.status}).`,
    note: 'URL Inspection reports Google’s known index state. It does not request indexing.',
  };
}

export async function inspectUrlStates(
  env: Env,
  user: SessionUser,
  siteUrl: string,
  urls: string[],
  limit = 12
): Promise<Record<string, string>> {
  const token = await accessToken(env, user);
  if (!token) return {};
  const out: Record<string, string> = {};
  const slice = urls.slice(0, limit);
  const workers = 4;
  for (let i = 0; i < slice.length; i += workers) {
    const batch = slice.slice(i, i + workers);
    const rows = await Promise.all(
      batch.map(async (inspectionUrl) => {
        const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
          method: 'POST',
          headers: googleHeaders(env, token, { 'content-type': 'application/json' }),
          body: JSON.stringify({ inspectionUrl, siteUrl }),
        });
        const body = (await res.json()) as {
          inspectionResult?: { indexStatusResult?: { coverageState?: string; verdict?: string } };
        };
        const status = body.inspectionResult?.indexStatusResult;
        return [inspectionUrl, status?.coverageState || status?.verdict || (res.ok ? 'unknown' : `error ${res.status}`)] as const;
      })
    );
    for (const [url, state] of rows) out[url] = state;
  }
  return out;
}

export async function submitSitemap(env: Env, user: SessionUser, siteUrl: string, feedpath: string): Promise<unknown> {
  const token = await accessToken(env, user);
  if (!token) return { error: 'Search Console is not connected.' };
  const encodedSite = encodeURIComponent(siteUrl);
  const encodedFeed = encodeURIComponent(feedpath);
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps/${encodedFeed}`, {
    method: 'PUT',
    headers: googleHeaders(env, token),
  });
  return {
    ok: res.ok,
    status: res.status,
    note: 'Submitting a sitemap tells Google where to find URLs. It is a hint, not a guarantee that those URLs will be indexed.',
  };
}

export async function handleGscRoutes(request: Request, env: Env, user: SessionUser, path: string): Promise<Response | null> {
  const isJson = (request.headers.get('content-type') || '').includes('json');
  if (path === '/app/gsc/inspect' && request.method === 'POST') {
    if (!isJson) return null;
    if (!user.entitlements.gsc) return json({ error: 'Search Console features require the Pro or Agency plan.' }, 402);
    const body = (await request.json()) as { siteUrl?: string; inspectionUrl?: string };
    if (!body.siteUrl || !body.inspectionUrl) return json({ error: 'siteUrl and inspectionUrl required.' }, 400);
    return json(await inspectUrl(env, user, body.siteUrl, body.inspectionUrl));
  }
  if (path === '/app/gsc/sitemaps/submit' && request.method === 'POST') {
    if (!isJson) return null;
    if (!user.entitlements.gsc) return json({ error: 'Search Console features require the Pro or Agency plan.' }, 402);
    const body = (await request.json()) as { siteUrl?: string; feedpath?: string };
    if (!body.siteUrl || !body.feedpath) return json({ error: 'siteUrl and feedpath required.' }, 400);
    return json(await submitSitemap(env, user, body.siteUrl, body.feedpath));
  }
  void originOf;
  void nowIso;
  return null;
}

async function accessToken(env: Env, user: SessionUser): Promise<string | null> {
  const row = await env.DB.prepare('SELECT refresh_token_enc FROM gsc_connections WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(user.workspaceId)
    .first<{ refresh_token_enc: string }>();
  if (!row) return null;
  const stored = parseStoredRefresh(row.refresh_token_enc);
  const clientId = stored.client_id || env.GSC_CLIENT_ID || env.GOOGLE_CLIENT_ID;
  const clientSecret = stored.client_secret || env.GSC_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: stored.refresh_token,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const body = (await res.json()) as { access_token?: string };
  return body.access_token || null;
}
