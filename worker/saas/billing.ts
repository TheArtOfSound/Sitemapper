import { PLAN_PRICES_USD, type PlanId } from '../../src/plans.js';
import type { SessionUser } from './auth.js';
import { json, nowIso, originOf, redirect, timingSafeEqual, type Env } from './env.js';

const PLAN_BY_LOOKUP: Record<string, PlanId> = {};

export function priceIdFor(env: Env, plan: PlanId, interval: 'month' | 'year'): string | null {
  const key = {
    builder: { month: env.STRIPE_PRICE_BUILDER_MONTHLY, year: env.STRIPE_PRICE_BUILDER_ANNUAL },
    pro: { month: env.STRIPE_PRICE_PRO_MONTHLY, year: env.STRIPE_PRICE_PRO_ANNUAL },
    agency: { month: env.STRIPE_PRICE_AGENCY_MONTHLY, year: env.STRIPE_PRICE_AGENCY_ANNUAL },
  } as const;
  if (plan === 'free') return null;
  return key[plan][interval] || null;
}

export async function startCheckout(env: Env, request: Request, user: SessionUser, plan: PlanId, interval: 'month' | 'year'): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) {
    return json(
      {
        error: 'Stripe is not configured on this deployment.',
        blocker: 'Set STRIPE_SECRET_KEY and STRIPE_PRICE_* secrets, then retry.',
        requested: { plan, interval, usd: PLAN_PRICES_USD[plan] },
      },
      503
    );
  }
  const price = priceIdFor(env, plan, interval);
  if (!price) {
    return json({ error: `No Stripe price id configured for ${plan} ${interval}.` }, 503);
  }
  const ws = await env.DB.prepare('SELECT stripe_customer_id FROM workspaces WHERE id = ?')
    .bind(user.workspaceId)
    .first<{ stripe_customer_id: string | null }>();
  const params = new URLSearchParams({
    mode: 'subscription',
    success_url: `${originOf(request, env)}/app/billing?checkout=success`,
    cancel_url: `${originOf(request, env)}/pricing?checkout=cancel`,
    client_reference_id: user.workspaceId,
    'metadata[workspace_id]': user.workspaceId,
    'metadata[plan]': plan,
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    allow_promotion_codes: 'true',
  });
  if (user.email) params.set('customer_email', user.email);
  if (ws?.stripe_customer_id) params.set('customer', ws.stripe_customer_id);
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: stripeHeaders(env),
    body: params,
  });
  const body = (await res.json()) as { url?: string; error?: { message: string } };
  if (!body.url) return json({ error: body.error?.message || 'Stripe Checkout failed.' }, 502);
  return redirect(body.url);
}

export async function billingPortal(env: Env, request: Request, user: SessionUser): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Stripe is not configured.' }, 503);
  const ws = await env.DB.prepare('SELECT stripe_customer_id FROM workspaces WHERE id = ?')
    .bind(user.workspaceId)
    .first<{ stripe_customer_id: string | null }>();
  if (!ws?.stripe_customer_id) return json({ error: 'No Stripe customer on this workspace yet.' }, 400);
  const params = new URLSearchParams({
    customer: ws.stripe_customer_id,
    return_url: `${originOf(request, env)}/app/billing`,
  });
  const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: stripeHeaders(env),
    body: params,
  });
  const body = (await res.json()) as { url?: string; error?: { message: string } };
  if (!body.url) return json({ error: body.error?.message || 'Stripe portal failed.' }, 502);
  return redirect(body.url);
}

export async function handleStripeWebhook(env: Env, request: Request): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'STRIPE_WEBHOOK_SECRET missing.' }, 503);
  const payload = await request.text();
  const header = request.headers.get('stripe-signature') || '';
  if (!(await verifyStripeSignature(payload, header, env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: 'Invalid Stripe signature.' }, 400);
  }
  const event = JSON.parse(payload) as {
    type: string;
    data: { object: Record<string, unknown> };
  };
  if (event.type === 'checkout.session.completed') {
    const obj = event.data.object;
    const workspaceId = String((obj.metadata as { workspace_id?: string } | undefined)?.workspace_id || obj.client_reference_id || '');
    const customer = String(obj.customer || '');
    const subscription = String(obj.subscription || '');
    if (workspaceId) {
      const plan = String((obj.metadata as { plan?: string } | undefined)?.plan || '');
      await env.DB.prepare(
        'UPDATE workspaces SET stripe_customer_id = ?, stripe_subscription_id = ?, stripe_status = ?, plan = CASE WHEN ? IN (\'builder\', \'pro\', \'agency\') THEN ? ELSE plan END WHERE id = ?'
      )
        .bind(customer || null, subscription || null, 'active', plan, plan, workspaceId)
        .run();
    }
  }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const obj = event.data.object;
    const subscriptionId = String(obj.id || '');
    const status = String(obj.status || 'canceled');
    const priceId = String(((obj.items as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data || [])[0]?.price?.id || '');
    const plan = planFromPrice(env, priceId);
    await env.DB.prepare(
      'UPDATE workspaces SET stripe_status = ?, stripe_price_id = ?, plan = CASE WHEN ? != \'\' THEN ? ELSE plan END WHERE stripe_subscription_id = ?'
    )
      .bind(status, priceId || null, plan, plan || 'free', subscriptionId)
      .run();
    if (status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired') {
      await env.DB.prepare('UPDATE workspaces SET plan = ? WHERE stripe_subscription_id = ?').bind('free', subscriptionId).run();
    }
  }
  if (event.type === 'invoice.payment_failed') {
    const obj = event.data.object;
    const customer = String(obj.customer || '');
    if (customer) {
      await env.DB.prepare('UPDATE workspaces SET stripe_status = ? WHERE stripe_customer_id = ?').bind('past_due', customer).run();
    }
  }
  return json({ received: true, at: nowIso() });
}

export async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map((part) => part.split('=')));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (age > 300) return false;
  const signed = `${t}.${payload}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(hex, v1);
}

function planFromPrice(env: Env, priceId: string): PlanId | '' {
  if (!priceId) return '';
  if (priceId === env.STRIPE_PRICE_BUILDER_MONTHLY || priceId === env.STRIPE_PRICE_BUILDER_ANNUAL) return 'builder';
  if (priceId === env.STRIPE_PRICE_PRO_MONTHLY || priceId === env.STRIPE_PRICE_PRO_ANNUAL) return 'pro';
  if (priceId === env.STRIPE_PRICE_AGENCY_MONTHLY || priceId === env.STRIPE_PRICE_AGENCY_ANNUAL) return 'agency';
  void PLAN_BY_LOOKUP;
  return '';
}

function stripeHeaders(env: Env): HeadersInit {
  return {
    authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    'content-type': 'application/x-www-form-urlencoded',
  };
}
