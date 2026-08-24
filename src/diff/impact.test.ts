import { describe, expect, it } from 'vitest';
import { impactFor, isHighValue, siteHealth } from './impact.js';

describe('business impact', () => {
  it('labels checkout 500 as revenue risk', () => {
    const impact = impactFor({
      code: 'HTTP_STATUS_CHANGED',
      class: 'critical',
      url: 'https://example.com/checkout',
      before: 200,
      after: 500,
      summary: 'checkout 200 → 500',
    });
    expect(impact.journey).toBe('Checkout');
    expect(impact.risk).toBe('revenue');
    expect(impact.label).toBe('Revenue risk');
    expect(impact.headline).toContain('ERROR');
  });

  it('labels sitemap collapse as search visibility risk', () => {
    const impact = impactFor({
      code: 'SITEMAP_URL_COUNT_DROP',
      class: 'critical',
      before: 1361,
      after: 0,
      summary: 'Sitemap URL count fell',
    });
    expect(impact.risk).toBe('search');
    expect(impact.headline).toBe('Sitemap URLs 1,361 → 0');
  });

  it('treats pricing and contact as high-value', () => {
    expect(isHighValue('https://example.com/pricing')).toBe(true);
    expect(isHighValue('https://example.com/contact')).toBe(true);
    expect(isHighValue('https://example.com/checkout/pay')).toBe(true);
  });

  it('maps monitor status to portfolio health', () => {
    expect(siteHealth({ last_status: 'ok', critical: 0, errors: 0 })).toBe('healthy');
    expect(siteHealth({ last_status: 'regression', critical: 1, errors: 0 })).toBe('critical');
    expect(siteHealth({ last_status: 'ok', critical: 0, errors: 3 })).toBe('warning');
    expect(siteHealth({ last_status: 'pending', critical: 0, errors: 0 })).toBe('pending');
  });

  it('keeps recovered current health separate from historical critical events', () => {
    expect(siteHealth({ last_status: 'ok', critical: 4, errors: 0 })).toBe('healthy');
  });
});
