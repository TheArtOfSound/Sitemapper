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

export async function listGscProperties(env: Env, user: SessionUser): Promise<unknown> {
  const token = await accessToken(env, user);
  if (!token) return { connected: false, properties: [], note: 'Google Search Console is not connected.' };
  const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> };
  return { connected: true, properties: body.siteEntry || [] };
}

export async function inspectUrl(env: Env, user: SessionUser, siteUrl: string, inspectionUrl: string): Promise<unknown> {
  const token = await accessToken(env, user);
  if (!token) return { error: 'Search Console is not connected.', googleState: 'unknown' };
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ inspectionUrl, siteUrl }),
  });
  const body = await res.json();
  return {
    googleState: 'authorized',
    inspection: body,
    note: 'URL Inspection reports Google’s known index state. It does not request indexing.',
  };
}

export async function submitSitemap(env: Env, user: SessionUser, siteUrl: string, feedpath: string): Promise<unknown> {
  const token = await accessToken(env, user);
  if (!token) return { error: 'Search Console is not connected.' };
  const encodedSite = encodeURIComponent(siteUrl);
  const encodedFeed = encodeURIComponent(feedpath);
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps/${encodedFeed}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}` },
  });
  return {
    ok: res.ok,
    status: res.status,
    note: 'Submitting a sitemap tells Google where to find URLs. It is a hint, not a guarantee that those URLs will be indexed.',
  };
}

export async function handleGscRoutes(request: Request, env: Env, user: SessionUser, path: string): Promise<Response | null> {
  if (path === '/app/gsc' && request.method === 'GET') {
    return json(await listGscProperties(env, user));
  }
  if (path === '/app/gsc/inspect' && request.method === 'POST') {
    const body = (await request.json()) as { siteUrl?: string; inspectionUrl?: string };
    if (!body.siteUrl || !body.inspectionUrl) return json({ error: 'siteUrl and inspectionUrl required.' }, 400);
    return json(await inspectUrl(env, user, body.siteUrl, body.inspectionUrl));
  }
  if (path === '/app/gsc/sitemaps/submit' && request.method === 'POST') {
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
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  const row = await env.DB.prepare('SELECT refresh_token_enc FROM gsc_connections WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(user.workspaceId)
    .first<{ refresh_token_enc: string }>();
  if (!row) return null;
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: row.refresh_token_enc,
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
