import { describe, expect, it } from 'vitest';
import { entitlementsFor, canAddSite, canDeepCheck } from './plans.js';

describe('entitlements', () => {
  it('maps known plans', () => {
    expect(entitlementsFor('pro').gsc).toBe(true);
    expect(entitlementsFor('free').webhooks).toBe(false);
    expect(entitlementsFor('builder').sites).toBe(5);
  });

  it('downgrades paid plans when Stripe is past_due or canceled', () => {
    expect(entitlementsFor('agency', 'past_due').plan).toBe('free');
    expect(entitlementsFor('pro', 'canceled').github).toBe(false);
    expect(entitlementsFor('pro', 'active').github).toBe(true);
  });

  it('enforces site and deep-check quotas', () => {
    const free = entitlementsFor('free');
    expect(canAddSite(free, 1)).toBe(false);
    expect(canAddSite(free, 0)).toBe(true);
    expect(canDeepCheck(free, 1999, 2)).toBe(false);
    expect(canDeepCheck(free, 0, 40)).toBe(true);
  });
});
