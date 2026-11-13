import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleStripeWebhook, startCheckout, verifyStripeSignature } from './billing.js';
import type { Env } from './env.js';
import type { SessionUser } from './auth.js';

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

afterEach(() => vi.unstubAllGlobals());

function fixture(status = 'active', priceId = 'price_builder', current?: { stripe_subscription_id: string; plan: string; stripe_status: string }) {
  const writes: Array<{ sql: string; values: unknown[] }> = [];
  const env = {
    STRIPE_SECRET_KEY: 'sk_test_example_not_real',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_PRICE_BUILDER_MONTHLY: 'price_builder',
    STRIPE_PRICE_PRO_MONTHLY: 'price_pro',
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async run() {
                writes.push({ sql, values });
                return { success: true };
              },
              async first() {
                return current || { stripe_customer_id: 'cus_existing' };
              },
            };
          },
        };
      },
    },
  } as unknown as Env;
  const fetchMock = vi.fn(async (url: string) => {
    expect(url).toBe('https://api.stripe.com/v1/subscriptions/sub_one');
    return Response.json({
      id: 'sub_one',
      status,
      customer: 'cus_existing',
      items: { data: [{ price: { id: priceId } }] },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { env, writes, fetchMock };
}

async function webhook(env: Env, type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({ type, data: { object } });
  return handleStripeWebhook(env, new Request('https://sitemapper.oortstack.com/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': await sign(payload, 'whsec_test', Math.floor(Date.now() / 1000)) },
    body: payload,
  }));
}

describe('Subscription reconciliation', () => {
  it('does not unlock a paid tier for an incomplete Checkout subscription', async () => {
    const { env, writes } = fixture('incomplete');
    const response = await webhook(env, 'checkout.session.completed', {
      mode: 'subscription',
      payment_status: 'unpaid',
      client_reference_id: 'ws_one',
      metadata: { workspace_id: 'ws_one', plan: 'agency' },
      subscription: 'sub_one',
    });
    expect(response.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0].values).toEqual(['cus_existing', 'sub_one', 'incomplete', 'price_builder', 'free', 'ws_one']);
  });

  it('preserves an existing paid subscription when a replacement Checkout has not been paid', async () => {
    const { env, writes } = fixture('incomplete', 'price_builder', {
      stripe_subscription_id: 'sub_paid_old', plan: 'pro', stripe_status: 'active',
    });
    const response = await webhook(env, 'checkout.session.completed', {
      mode: 'subscription',
      payment_status: 'unpaid',
      metadata: { workspace_id: 'ws_one', plan: 'agency' },
      subscription: 'sub_one',
    });
    expect(response.status).toBe(200);
    expect(writes).toHaveLength(0);
  });

  it('derives the paid tier from the authoritative Stripe price, not Checkout metadata', async () => {
    const { env, writes } = fixture('active', 'price_pro');
    const response = await webhook(env, 'checkout.session.completed', {
      mode: 'subscription',
      payment_status: 'paid',
      metadata: { workspace_id: 'ws_one', plan: 'agency' },
      subscription: 'sub_one',
    });
    expect(response.status).toBe(200);
    expect(writes[0].values).toEqual(['cus_existing', 'sub_one', 'active', 'price_pro', 'pro', 'ws_one']);
  });

  it('accepts trialing subscriptions without a collected initial payment', async () => {
    const { env, writes } = fixture('trialing');
    const response = await webhook(env, 'checkout.session.completed', {
      mode: 'subscription',
      payment_status: 'no_payment_required',
      client_reference_id: 'ws_one',
      subscription: 'sub_one',
    });
    expect(response.status).toBe(200);
    expect(writes[0].values[4]).toBe('builder');
  });

  it('handles delayed payment success by reconciling the current subscription', async () => {
    const { env, writes } = fixture('active');
    const response = await webhook(env, 'checkout.session.async_payment_succeeded', {
      mode: 'subscription',
      metadata: { workspace_id: 'ws_one' },
      subscription: 'sub_one',
    });
    expect(response.status).toBe(200);
    expect(writes[0].values[4]).toBe('builder');
  });

  it('revokes access on canceled subscriptions without overwriting a replacement subscription', async () => {
    const { env, writes } = fixture('canceled');
    const response = await webhook(env, 'customer.subscription.deleted', { id: 'sub_one' });
    expect(response.status).toBe(200);
    expect(writes[0].values).toEqual(['canceled', 'price_builder', 'free', 'sub_one']);
    expect(writes[0].sql).toContain('WHERE stripe_subscription_id = ?');
  });

  it('accepts modern invoice subscription references for renewal reconciliation', async () => {
    const { env, writes } = fixture('active');
    const response = await webhook(env, 'invoice.paid', {
      parent: { subscription_details: { subscription: 'sub_one' } },
    });
    expect(response.status).toBe(200);
    expect(writes[0].values).toEqual(['active', 'price_builder', 'builder', 'sub_one']);
  });

  it('returns retryable failure without writing entitlement changes when Stripe is unavailable', async () => {
    const { env, writes } = fixture();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));
    const response = await webhook(env, 'checkout.session.completed', {
      mode: 'subscription',
      client_reference_id: 'ws_one',
      subscription: 'sub_one',
    });
    expect(response.status).toBe(503);
    expect(writes).toHaveLength(0);
  });

  it('ignores non-subscription Checkout events', async () => {
    const { env, writes, fetchMock } = fixture();
    const response = await webhook(env, 'checkout.session.completed', { mode: 'payment', subscription: 'sub_one' });
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });
});

describe('Checkout safety', () => {
  const user = { workspaceId: 'ws_one', email: 'customer@example.com' } as SessionUser;
  it('rejects invalid plan identifiers before making a Stripe request', async () => {
    const { env, fetchMock } = fixture();
    const response = await startCheckout(env, new Request('https://sitemapper.oortstack.com/'), user, 'unexpected' as never, 'month');
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send customer_email alongside an existing Stripe customer', async () => {
    const { env } = fixture();
    const fetchMock = vi.fn(async (_url: string, opts: RequestInit) => {
      const params = new URLSearchParams(String(opts.body));
      expect(params.get('customer')).toBe('cus_existing');
      expect(params.has('customer_email')).toBe(false);
      return Response.json({ url: 'https://checkout.stripe.com/test-session' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const response = await startCheckout(env, new Request('https://sitemapper.oortstack.com/'), user, 'builder', 'month');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://checkout.stripe.com/test-session');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
