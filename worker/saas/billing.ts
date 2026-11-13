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
  if (!['builder', 'pro', 'agency'].includes(plan) || !['month', 'year'].includes(interval)) {
    return json({ error: 'Invalid subscription plan or interval.' }, 400);
  }
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
  // Paid monitoring depends on durable snapshot storage. Do not collect payment if unavailable.
  // This is a read-only R2 check: a missing probe object (null) means the bucket is reachable.
  try {
    if (!env.SNAPSHOTS) throw new Error('R2 binding missing');
    await env.SNAPSHOTS.head('system/checkout-storage-probe');
  } catch {
    return json({ error: 'Monitoring storage is unavailable. New paid checkouts are temporarily paused.' }, 503);
  }
  const ws = await env.DB.prepare('SELECT stripe_customer_id, stripe_subscription_id, stripe_status FROM workspaces WHERE id = ?')
    .bind(user.workspaceId)
    .first<{ stripe_customer_id: string | null; stripe_subscription_id: string | null; stripe_status: string }>();
  if (!ws) return json({ error: 'Workspace not found.' }, 404);
  // Avoid charging an existing or pending subscriber twice. Changes belong in the portal.
  if (ws.stripe_subscription_id && !['canceled', 'incomplete_expired'].includes(ws.stripe_status)) {
    return json({ error: 'A subscription already exists for this workspace. Manage it from Billing instead.' }, 409);
  }
  const params = new URLSearchParams({
    mode: 'subscription',
    success_url: `${originOf(request, env)}/app/billing?checkout=success`,
    cancel_url: `${originOf(request, env)}/pricing?checkout=cancel`,
    client_reference_id: user.workspaceId,
    'metadata[workspace_id]': user.workspaceId,
    'metadata[plan]': plan,
    'subscription_data[metadata][workspace_id]': user.workspaceId,
    'subscription_data[metadata][product]': 'sitemapper',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    allow_promotion_codes: 'true',
  });
  if (ws?.stripe_customer_id) params.set('customer', ws.stripe_customer_id);
  else if (user.email) params.set('customer_email', user.email);
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

type StripeSubscription = {
  id: string;
  status: string;
  customer?: string | { id?: string };
  metadata?: { workspace_id?: string; product?: string };
  items?: { data?: Array<{ price?: { id?: string } }> };
};

function stripeId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') return value.id;
  return '';
}

function invoiceSubscriptionId(invoice: Record<string, unknown>): string {
  const parent = invoice.parent as { subscription_details?: { subscription?: unknown } } | undefined;
  return stripeId(invoice.subscription) || stripeId(parent?.subscription_details?.subscription);
}

async function retrieveSubscription(env: Env, subscriptionId: string): Promise<StripeSubscription> {
  if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe API not configured');
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  if (!res.ok) throw new Error(`Stripe subscription lookup failed with HTTP ${res.status}`);
  const subscription = (await res.json()) as StripeSubscription;
  if (subscription.id !== subscriptionId || typeof subscription.status !== 'string') {
    throw new Error('Stripe returned an invalid subscription');
  }
  return subscription;
}

/**
 * Reconcile from Stripe's current subscription state, not an event's age or user-controlled
 * checkout metadata. Duplicate/out-of-order webhook events therefore cannot re-grant
 * expired subscriptions, and a completed but unpaid Checkout never unlocks paid tiers.
 */
async function reconcileSubscription(env: Env, subscriptionId: string, workspaceId = ''): Promise<void> {
  const subscription = await retrieveSubscription(env, subscriptionId);
  const priceId = subscription.items?.data?.[0]?.price?.id || '';
  const matchedPlan = planFromPrice(env, priceId);
  const entitled = subscription.status === 'active' || subscription.status === 'trialing';
  const plan: PlanId = entitled && matchedPlan ? matchedPlan : 'free';
  const customerId = stripeId(subscription.customer);
  const canonicalWorkspaceId = subscription.metadata?.workspace_id || '';
  const canonicalProduct = subscription.metadata?.product || '';

  if (workspaceId) {
    // Checkout metadata is an event routing hint, not a claim of subscription ownership.
    // The source of truth is metadata on the subscription retrieved from Stripe.
    if (canonicalWorkspaceId !== workspaceId || canonicalProduct !== 'sitemapper') {
      throw new Error('Checkout subscription ownership metadata mismatch');
    }
    // Never bind an unrelated subscription/price to a workspace, even in a shared Stripe account.
    if (!matchedPlan || !customerId) return;
    const current = await env.DB.prepare(
      'SELECT stripe_customer_id, stripe_subscription_id, plan, stripe_status FROM workspaces WHERE id = ?'
    ).bind(workspaceId).first<{
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
      plan: string;
      stripe_status: string;
    }>();
    if (!current) throw new Error('Checkout workspace not found');
    if (current.stripe_customer_id && current.stripe_customer_id !== customerId) {
      throw new Error('Subscription customer does not match workspace');
    }
    // A late event for a second subscription cannot replace an existing live subscription.
    // This applies even when Stripe reports both subscriptions as active.
    if (current.stripe_subscription_id && current.stripe_subscription_id !== subscriptionId &&
        ['active', 'trialing'].includes(current.stripe_status)) {
      return;
    }
    await env.DB.prepare(
      'UPDATE workspaces SET stripe_customer_id = ?, stripe_subscription_id = ?, stripe_status = ?, stripe_price_id = ?, plan = ? WHERE id = ?'
    )
      .bind(customerId || null, subscriptionId, subscription.status, priceId || null, plan, workspaceId)
      .run();
  } else {
    // Events for an older subscription must never replace a newer subscription on a workspace.
    await env.DB.prepare(
      'UPDATE workspaces SET stripe_status = ?, stripe_price_id = ?, plan = ? WHERE stripe_subscription_id = ?'
    )
      .bind(subscription.status, priceId || null, plan, subscriptionId)
      .run();
  }
}

export async function handleStripeWebhook(env: Env, request: Request): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'STRIPE_WEBHOOK_SECRET missing.' }, 503);
  const payload = await request.text();
  const header = request.headers.get('stripe-signature') || '';
  if (!(await verifyStripeSignature(payload, header, env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: 'Invalid Stripe signature.' }, 400);
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(payload) as typeof event;
    if (!event || typeof event.type !== 'string' || !event.data || !event.data.object) {
      return json({ error: 'Malformed Stripe event.' }, 400);
    }
  } catch {
    return json({ error: 'Malformed Stripe event.' }, 400);
  }

  const obj = event.data.object;
  let subscriptionId = '';
  let workspaceId = '';
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.async_payment_failed': {
      if (obj.mode !== 'subscription') break;
      const metadata = obj.metadata as { workspace_id?: string } | undefined;
      workspaceId = String(metadata?.workspace_id || obj.client_reference_id || '');
      subscriptionId = stripeId(obj.subscription);
      // Neither a payment status nor the client's plan claim grants access directly.
      break;
    }
    case 'customer.subscription.created': {
      subscriptionId = stripeId(obj.id);
      // The canonical Stripe subscription, fetched again below, must confirm ownership.
      const metadata = obj.metadata as { workspace_id?: string; product?: string } | undefined;
      if (metadata?.product === 'sitemapper' && typeof metadata.workspace_id === 'string') {
        workspaceId = metadata.workspace_id;
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      subscriptionId = stripeId(obj.id);
      break;
    case 'invoice.paid':
    case 'invoice.payment_failed':
      subscriptionId = invoiceSubscriptionId(obj);
      break;
    default:
      return json({ received: true, at: nowIso() });
  }

  if (!subscriptionId) {
    // Unrelated invoices or Checkout sessions do not belong to this subscription system.
    return json({ received: true, at: nowIso() });
  }
  try {
    await reconcileSubscription(env, subscriptionId, workspaceId);
  } catch {
    // Return a non-2xx response so Stripe retries transient API/database failures.
    // Never disclose Stripe response bodies, API keys, or customer information.
    return json({ error: 'Unable to reconcile Stripe subscription; retry delivery.' }, 503);
  }
  return json({ received: true, at: nowIso() });
}

export async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const pieces = header.split(',').map((part) => part.trim().split('='));
  const timestamp = pieces.find(([key]) => key === 't')?.[1];
  const candidates = pieces.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || !/^\d+$/.test(timestamp) || !candidates.length) return false;
  const time = Number(timestamp);
  if (!Number.isSafeInteger(time) || Math.abs(Date.now() / 1000 - time) > 300) return false;
  const signed = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return candidates.some((value) => /^[a-f0-9]{64}$/i.test(value) && timingSafeEqual(hex, value.toLowerCase()));
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
