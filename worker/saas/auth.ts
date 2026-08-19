import { entitlementsFor, type Entitlements } from '../../src/plans.js';
import { json, newId, nowIso, originOf, randomToken, redirect, sha256Hex, timingSafeEqual, type Env } from './env.js';

const COOKIE = 'sp_session';
const SESSION_DAYS = 30;

export type SessionUser = {
  userId: string;
  email: string | null;
  name: string | null;
  workspaceId: string;
  plan: string;
  stripeStatus: string;
  entitlements: Entitlements;
};

export async function readSession(request: Request, env: Env): Promise<SessionUser | null> {
  if (!env.DB) return null;
  const token = cookieValue(request, COOKIE);
  if (!token) return null;
  const id = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.user_id, s.workspace_id, s.expires_at, u.email, u.name, w.plan, w.stripe_status
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN workspaces w ON w.id = s.workspace_id
     WHERE s.id = ?`
  )
    .bind(id)
    .first<{
      user_id: string;
      workspace_id: string;
      expires_at: string;
      email: string | null;
      name: string | null;
      plan: string;
      stripe_status: string;
    }>();
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) return null;
  return {
    userId: row.user_id,
    email: row.email,
    name: row.name,
    workspaceId: row.workspace_id,
    plan: row.plan,
    stripeStatus: row.stripe_status,
    entitlements: entitlementsFor(row.plan, row.stripe_status),
  };
}

export async function createSession(env: Env, userId: string, workspaceId: string, userAgent: string | null): Promise<string> {
  const token = await randomToken(32);
  const id = await sha256Hex(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, workspace_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(id, userId, workspaceId, nowIso(), expires, userAgent)
    .run();
  return token;
}

export function sessionCookie(token: string, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:';
  const maxAge = SESSION_DAYS * 86400;
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:';
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export async function requireUser(request: Request, env: Env, next?: string): Promise<SessionUser | Response> {
  const user = await readSession(request, env);
  if (user) return user;
  const dest = next || new URL(request.url).pathname + new URL(request.url).search;
  return redirect(`/login?next=${encodeURIComponent(dest)}`);
}

export async function upsertGithubUser(env: Env, profile: { id: string; login: string; email?: string; name?: string }): Promise<{ userId: string; workspaceId: string }> {
  const existing = await env.DB.prepare('SELECT id FROM users WHERE github_id = ?').bind(String(profile.id)).first<{ id: string }>();
  if (existing) {
    await env.DB.prepare('UPDATE users SET last_login_at = ?, email = COALESCE(?, email), name = COALESCE(?, name) WHERE id = ?')
      .bind(nowIso(), profile.email || null, profile.name || profile.login, existing.id)
      .run();
    const membership = await env.DB.prepare('SELECT workspace_id FROM memberships WHERE user_id = ? ORDER BY created_at LIMIT 1')
      .bind(existing.id)
      .first<{ workspace_id: string }>();
    return { userId: existing.id, workspaceId: membership?.workspace_id || (await ensureWorkspace(env, existing.id, profile.login)) };
  }
  const userId = newId('usr');
  await env.DB.prepare(
    'INSERT INTO users (id, email, name, github_id, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(userId, profile.email || `${profile.login}@users.noreply.github.com`, profile.name || profile.login, String(profile.id), nowIso(), nowIso())
    .run();
  const workspaceId = await ensureWorkspace(env, userId, profile.login);
  return { userId, workspaceId };
}

export async function upsertGoogleUser(env: Env, profile: { id: string; email: string; name?: string }): Promise<{ userId: string; workspaceId: string }> {
  const existing = await env.DB.prepare('SELECT id FROM users WHERE google_id = ? OR email = ?')
    .bind(profile.id, profile.email)
    .first<{ id: string }>();
  if (existing) {
    await env.DB.prepare('UPDATE users SET last_login_at = ?, google_id = COALESCE(google_id, ?), email = ?, name = COALESCE(?, name) WHERE id = ?')
      .bind(nowIso(), profile.id, profile.email, profile.name || null, existing.id)
      .run();
    const membership = await env.DB.prepare('SELECT workspace_id FROM memberships WHERE user_id = ? ORDER BY created_at LIMIT 1')
      .bind(existing.id)
      .first<{ workspace_id: string }>();
    return { userId: existing.id, workspaceId: membership?.workspace_id || (await ensureWorkspace(env, existing.id, profile.email)) };
  }
  const userId = newId('usr');
  await env.DB.prepare('INSERT INTO users (id, email, name, google_id, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(userId, profile.email, profile.name || profile.email, profile.id, nowIso(), nowIso())
    .run();
  const workspaceId = await ensureWorkspace(env, userId, profile.email);
  return { userId, workspaceId };
}

export async function upsertEmailUser(env: Env, email: string): Promise<{ userId: string; workspaceId: string }> {
  const normalized = email.trim().toLowerCase();
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(normalized).first<{ id: string }>();
  if (existing) {
    await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(nowIso(), existing.id).run();
    const membership = await env.DB.prepare('SELECT workspace_id FROM memberships WHERE user_id = ? ORDER BY created_at LIMIT 1')
      .bind(existing.id)
      .first<{ workspace_id: string }>();
    return { userId: existing.id, workspaceId: membership?.workspace_id || (await ensureWorkspace(env, existing.id, normalized)) };
  }
  const userId = newId('usr');
  await env.DB.prepare('INSERT INTO users (id, email, name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, normalized, normalized.split('@')[0], nowIso(), nowIso())
    .run();
  const workspaceId = await ensureWorkspace(env, userId, normalized);
  return { userId, workspaceId };
}

async function ensureWorkspace(env: Env, userId: string, name: string): Promise<string> {
  const workspaceId = newId('ws');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO workspaces (id, name, owner_user_id, plan, stripe_status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(workspaceId, `${name}'s workspace`, userId, 'free', 'none', nowIso()),
    env.DB.prepare('INSERT INTO memberships (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)').bind(
      workspaceId,
      userId,
      'owner',
      nowIso()
    ),
  ]);
  return workspaceId;
}

export async function assertProjectAccess(env: Env, user: SessionUser, projectId: string): Promise<ProjectRow | Response> {
  const row = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND workspace_id = ?')
    .bind(projectId, user.workspaceId)
    .first<ProjectRow>();
  if (!row) return json({ error: 'Project not found.' }, 404);
  return row;
}

export type ProjectRow = {
  id: string;
  workspace_id: string;
  name: string;
  site_url: string;
  host: string;
  verified: number;
  gsc_property: string | null;
  github_repo: string | null;
  created_from_share_id: string | null;
  created_at: string;
};

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') || '';
  const parts = header.split(/;\s*/);
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return null;
}

export async function startOAuth(env: Env, request: Request, provider: 'github' | 'google'): Promise<Response> {
  const url = new URL(request.url);
  const next = url.searchParams.get('next') || '/app';
  const state = await randomToken(16);
  const verifier = await randomToken(32);
  await env.DB.prepare('INSERT INTO oauth_states (state, provider, code_verifier, next_path, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(state, provider, verifier, next, nowIso(), new Date(Date.now() + 10 * 60_000).toISOString())
    .run();

  if (provider === 'github') {
    if (!env.GITHUB_CLIENT_ID) return json({ error: 'GitHub OAuth is not configured on this deployment.' }, 503);
    const redirectUri = `${originOf(request, env)}/auth/github/callback`;
    const dest = new URL('https://github.com/login/oauth/authorize');
    dest.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
    dest.searchParams.set('redirect_uri', redirectUri);
    dest.searchParams.set('scope', 'read:user user:email');
    dest.searchParams.set('state', state);
    return redirect(dest.toString());
  }

  if (!env.GOOGLE_CLIENT_ID) return json({ error: 'Google OAuth is not configured on this deployment.' }, 503);
  const redirectUri = `${originOf(request, env)}/auth/google/callback`;
  const dest = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  dest.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  dest.searchParams.set('redirect_uri', redirectUri);
  dest.searchParams.set('response_type', 'code');
  dest.searchParams.set('scope', 'openid email profile https://www.googleapis.com/auth/webmasters.readonly');
  dest.searchParams.set('access_type', 'offline');
  dest.searchParams.set('include_granted_scopes', 'true');
  dest.searchParams.set('prompt', 'consent');
  dest.searchParams.set('state', state);
  return redirect(dest.toString());
}

export async function finishGithub(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const row = await consumeState(env, state, 'github');
  if (!row || !code || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return json({ error: 'Invalid OAuth state.' }, 400);
  }
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${originOf(request, env)}/auth/github/callback`,
    }),
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenJson.access_token) return json({ error: tokenJson.error || 'GitHub token exchange failed.' }, 400);
  const userRes = await fetch('https://api.github.com/user', {
    headers: { authorization: `Bearer ${tokenJson.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'sitemapper' },
  });
  const profile = (await userRes.json()) as { id: number; login: string; email?: string; name?: string };
  let email = profile.email;
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: { authorization: `Bearer ${tokenJson.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'sitemapper' },
    });
    const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
    email = emails.find((row) => row.primary && row.verified)?.email || emails.find((row) => row.verified)?.email;
  }
  const ident = await upsertGithubUser(env, { id: String(profile.id), login: profile.login, email, name: profile.name });
  return finishLogin(env, request, ident.userId, ident.workspaceId, row.next_path || '/app');
}

export async function finishGoogle(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const row = await consumeState(env, state, 'google');
  if (!row || !code || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return json({ error: 'Invalid OAuth state.' }, 400);
  }
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: `${originOf(request, env)}/auth/google/callback`,
    grant_type: 'authorization_code',
  });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; error?: string };
  if (!tokenJson.access_token) return json({ error: tokenJson.error || 'Google token exchange failed.' }, 400);
  const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  const profile = (await userRes.json()) as { sub: string; email: string; name?: string };
  const ident = await upsertGoogleUser(env, { id: profile.sub, email: profile.email, name: profile.name });
  if (tokenJson.refresh_token) {
    await env.DB.prepare(
      'INSERT INTO gsc_connections (id, workspace_id, user_id, refresh_token_enc, properties_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(newId('gsc'), ident.workspaceId, ident.userId, tokenJson.refresh_token, '[]', nowIso())
      .run();
  }
  return finishLogin(env, request, ident.userId, ident.workspaceId, row.next_path || '/app');
}

async function consumeState(env: Env, state: string, provider: string) {
  if (!state) return null;
  const row = await env.DB.prepare('SELECT * FROM oauth_states WHERE state = ? AND provider = ?')
    .bind(state, provider)
    .first<{ state: string; next_path: string; expires_at: string }>();
  if (!row) return null;
  await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
  if (Date.parse(row.expires_at) < Date.now()) return null;
  return row;
}

export async function finishLogin(env: Env, request: Request, userId: string, workspaceId: string, next: string): Promise<Response> {
  const token = await createSession(env, userId, workspaceId, request.headers.get('user-agent'));
  const dest = next.startsWith('/') ? next : '/app';
  const response = redirect(dest);
  response.headers.set('set-cookie', sessionCookie(token, request));
  return response;
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const token = cookieValue(request, COOKIE);
  if (token && env.DB) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run();
  }
  const response = redirect('/');
  response.headers.set('set-cookie', clearSessionCookie(request));
  return response;
}

export { timingSafeEqual };
