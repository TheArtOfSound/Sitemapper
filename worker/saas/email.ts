import type { Env } from './env.js';

const RESEND_API = 'https://api.resend.com/emails';

export function emailConfigured(env: Env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim());
}

export async function sendEmail(
  env: Env,
  args: { to: string; subject: string; html: string; text: string }
): Promise<{ ok: boolean; error?: string }> {
  const key = env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: 'RESEND_API_KEY missing' };
  const from = env.RESEND_FROM?.trim() || 'Sitemapper <hello@oortstack.com>';
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: args.to, subject: args.subject, html: args.html, text: args.text }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    return { ok: false, error: `Resend HTTP ${res.status}: ${detail}` };
  }
  return { ok: true };
}
