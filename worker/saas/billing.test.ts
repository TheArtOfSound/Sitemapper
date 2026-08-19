import { describe, expect, it } from 'vitest';
import { verifyStripeSignature } from './billing.js';

async function sign(payload: string, secret: string, t: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${hex}`;
}

describe('Stripe webhook signatures', () => {
  it('accepts a valid v1 signature within tolerance', async () => {
    const payload = '{"type":"checkout.session.completed"}';
    const secret = 'whsec_test';
    const t = Math.floor(Date.now() / 1000);
    expect(await verifyStripeSignature(payload, await sign(payload, secret, t), secret)).toBe(true);
  });

  it('rejects a tampered payload', async () => {
    const payload = '{"type":"checkout.session.completed"}';
    const secret = 'whsec_test';
    const t = Math.floor(Date.now() / 1000);
    const header = await sign(payload, secret, t);
    expect(await verifyStripeSignature(`${payload}x`, header, secret)).toBe(false);
  });
});
