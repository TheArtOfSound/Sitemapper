export type Env = {
  DB: D1Database;
  SNAPSHOTS: R2Bucket;
  SITEMAPPER_STATS?: KVNamespace;
  SITEMAPPER_RATE?: KVNamespace;
  CRAWLS?: Queue<CrawlMessage>;
  AUTH_SECRET?: string;
  AUTH_DEV_LOGIN?: string;
  APP_ORIGIN?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_BUILDER_MONTHLY?: string;
  STRIPE_PRICE_BUILDER_ANNUAL?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  STRIPE_PRICE_PRO_ANNUAL?: string;
  STRIPE_PRICE_AGENCY_MONTHLY?: string;
  STRIPE_PRICE_AGENCY_ANNUAL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  OORT_SSO_SECRET?: string;
  FLOWS_SSO_SECRET?: string;
};

export type CrawlMessage = {
  jobId: string;
  projectId: string;
  workspaceId: string;
  kind: 'manual' | 'scheduled' | 'ci';
  siteUrl: string;
};

export function originOf(request: Request, env: Env): string {
  return env.APP_ORIGIN || new URL(request.url).origin;
}

export function newId(prefix = ''): string {
  const id = crypto.randomUUID().replace(/-/g, '');
  return prefix ? `${prefix}_${id}` : id;
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function randomToken(bytes = 32): Promise<string> {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}

export function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location, 'cache-control': 'no-store' } });
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function periodMonth(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let out = 0;
  for (let i = 0; i < left.length; i++) out |= left[i] ^ right[i];
  return out === 0;
}

export async function track(env: Env, name: string, props: Record<string, unknown> = {}, userId?: string, workspaceId?: string): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(
    'INSERT INTO analytics_events (id, name, props_json, user_id, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(newId('evt'), name, JSON.stringify(props), userId || null, workspaceId || null, nowIso())
    .run();
}
