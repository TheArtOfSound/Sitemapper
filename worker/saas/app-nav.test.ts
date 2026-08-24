import { describe, expect, it } from 'vitest';
import { entitlementsFor } from '../../src/plans.js';
import type { SessionUser } from './auth.js';
import {
  billingPageBody,
  matchLoggedInAppRoute,
  planLimitBillingPath,
  wantsJson,
  workspaceSettingsBody,
} from './app.js';

function user(plan: 'free' | 'pro' = 'free'): SessionUser {
  return {
    userId: 'usr_demo',
    workspaceId: 'wsp_demo',
    email: 'operator@example.com',
    name: 'Demo',
    brandName: null,
    plan,
    stripeStatus: plan === 'free' ? 'none' : 'active',
    entitlements: entitlementsFor(plan, plan === 'free' ? 'none' : 'active'),
  };
}

describe('logged-in app route table', () => {
  it('lists sites on GET /app/sites without requiring ?site=', () => {
    expect(matchLoggedInAppRoute('GET', '/app/sites')).toBe('sites-list');
    expect(matchLoggedInAppRoute('GET', '/app/sites', new URLSearchParams('site=https://example.com'))).toBe(
      'sites-list'
    );
  });

  it('renders the add-site form when GET /app/sites/new has no site/url/share', () => {
    expect(matchLoggedInAppRoute('GET', '/app/sites/new')).toBe('sites-new-form');
  });

  it('keeps Monitor-this-site auto-create on GET /app/sites/new with site, url, or share', () => {
    expect(matchLoggedInAppRoute('GET', '/app/sites/new', new URLSearchParams('site=https://example.com'))).toBe(
      'sites-new-autocreate'
    );
    expect(matchLoggedInAppRoute('GET', '/app/sites/new', new URLSearchParams('url=https://example.com'))).toBe(
      'sites-new-autocreate'
    );
    expect(matchLoggedInAppRoute('GET', '/app/sites/new', new URLSearchParams('share=abc'))).toBe('sites-new-autocreate');
  });

  it('does not treat "new" as a project id', () => {
    expect(matchLoggedInAppRoute('GET', '/app/sites/new')).not.toMatch(/^site:/);
    expect(matchLoggedInAppRoute('GET', '/app/sites/prj_demo')).toBe('site:prj_demo:overview');
    expect(matchLoggedInAppRoute('GET', '/app/sites/prj_demo/changes')).toBe('site:prj_demo:changes');
  });

  it('maps POST /app/sites, billing, settings, and alerts', () => {
    expect(matchLoggedInAppRoute('POST', '/app/sites')).toBe('sites-create');
    expect(matchLoggedInAppRoute('GET', '/app/billing')).toBe('billing');
    expect(matchLoggedInAppRoute('GET', '/app/settings')).toBe('settings');
    expect(matchLoggedInAppRoute('GET', '/app/alerts')).toBe('alerts-redirect');
  });
});

describe('plan-limit 402 wiring', () => {
  it('sends plan limits to in-app billing, not public pricing', () => {
    const path = planLimitBillingPath('Plan free allows 1 monitored site(s). Upgrade to add more.');
    expect(path).toBe(
      '/app/billing?reason=Plan%20free%20allows%201%20monitored%20site(s).%20Upgrade%20to%20add%20more.'
    );
    expect(path).not.toContain('/pricing');
  });

  it('uses JSON only when Accept is application/json without HTML', () => {
    expect(wantsJson(new Request('https://example.com/app/sites', { headers: { accept: 'application/json' } }))).toBe(
      true
    );
    expect(
      wantsJson(
        new Request('https://example.com/app/sites', {
          headers: { accept: 'text/html,application/xhtml+xml', 'content-type': 'application/x-www-form-urlencoded' },
        })
      )
    ).toBe(false);
    expect(
      wantsJson(new Request('https://example.com/app/sites', { headers: { accept: 'text/html, application/json' } }))
    ).toBe(false);
  });
});

describe('settings and billing chrome', () => {
  it('puts Add site, Billing, Sign out, and #alerts on settings', () => {
    const markup = workspaceSettingsBody(user('free'), []);
    expect(markup).toContain('href="/app/sites/new">Add site</a>');
    expect(markup).toContain('href="/app/billing">Billing</a>');
    expect(markup).toContain('href="/logout">Sign out</a>');
    expect(markup).toContain('id="alerts"');
    expect(markup).toContain('Email alerts start on Builder. <a href="/app/billing">Billing</a>');
    expect(markup).toContain('Webhooks are on Pro and Agency. <a href="/app/billing">Billing</a>');
  });

  it('shows billing actions, escaped reason, and checkout success', () => {
    const markup = billingPageBody(user('free'), {
      stripeConfigured: false,
      reason: 'Plan free allows 1 site. <script>alert(1)</script>',
      checkout: 'success',
    });
    expect(markup).toContain('href="/app/sites/new">Add site</a>');
    expect(markup).toContain('href="/app/settings">Settings</a>');
    expect(markup).toContain('Open billing portal');
    expect(markup).toContain('href="/pricing">Change plan</a>');
    expect(markup).toContain('Plan free allows 1 site. &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(markup).not.toContain('<script>alert(1)</script>');
    expect(markup).toContain('Checkout completed');
    expect(markup).toContain('Checkout is disabled rather than faked.');
  });
});
