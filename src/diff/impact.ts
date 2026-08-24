export type BusinessRisk = 'revenue' | 'conversion' | 'search' | 'leads' | 'experience';

type ImpactEvent = {
  code: string;
  class: string;
  url?: string;
  before?: unknown;
  after?: unknown;
  summary: string;
  count?: number;
};

export type ChangeImpact = {
  journey: string;
  risk: BusinessRisk;
  label: string;
  headline: string;
};

const JOURNEY_PATHS: Array<{ test: (path: string) => boolean; journey: string; risk: BusinessRisk }> = [
  { test: (p) => /^\/(checkout|cart|basket|bag|buy|order|payment|pay|billing)(\/|$)/.test(p), journey: 'Checkout', risk: 'revenue' },
  { test: (p) => /^\/(pricing|plans|price|subscribe)(\/|$)/.test(p), journey: 'Pricing', risk: 'conversion' },
  { test: (p) => /^\/(contact|quote|demo|support|form)(\/|$)/.test(p) || p.includes('contact-us'), journey: 'Contact form', risk: 'leads' },
  { test: (p) => /^\/(signup|sign-up|register|login|account|trial)(\/|$)/.test(p), journey: 'Account', risk: 'conversion' },
  { test: (p) => p === '/' || p === '/index' || p === '/home', journey: 'Homepage', risk: 'experience' },
];

const RISK_LABEL: Record<BusinessRisk, string> = {
  revenue: 'Revenue risk',
  conversion: 'Conversion risk',
  search: 'Search visibility risk',
  leads: 'Lead-generation risk',
  experience: 'Customer experience risk',
};

const SEARCH_CODES = new Set([
  'SITEMAP_DISAPPEARED',
  'SITEMAP_URL_COUNT_DROP',
  'XML_PARSER_FAILURE_INTRODUCED',
  'NOINDEX_CHANGED',
  'ROBOTS_ACCESS_CHANGED',
  'CANONICAL_CHANGED',
  'SITEMAP_SOURCE_CHANGED',
]);

export function pathOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return url;
  }
}

export function isHighValue(url: string): boolean {
  const path = pathOf(url);
  if (JOURNEY_PATHS.some((row) => row.test(path))) return true;
  return ['/docs', '/blog', '/product', '/products', '/shop'].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function journeyFor(url?: string | null): { journey: string; risk: BusinessRisk } | null {
  if (!url) return null;
  const path = pathOf(url);
  return JOURNEY_PATHS.find((row) => row.test(path)) || null;
}

export function impactFor(event: ImpactEvent): ChangeImpact {
  const journeyHit = journeyFor(event.url);
  if (SEARCH_CODES.has(event.code) && !journeyHit) {
    return {
      journey: 'Search visibility',
      risk: 'search',
      label: RISK_LABEL.search,
      headline: journeyHeadline(event, 'Sitemap'),
    };
  }
  if (journeyHit) {
    return {
      journey: journeyHit.journey,
      risk: journeyHit.risk,
      label: RISK_LABEL[journeyHit.risk],
      headline: journeyHeadline(event, journeyHit.journey),
    };
  }
  if (event.code === 'HTTP_STATUS_CHANGED' && Number(event.after) >= 500) {
    return { journey: 'Availability', risk: 'experience', label: RISK_LABEL.experience, headline: event.summary };
  }
  if (event.class === 'critical') {
    return { journey: 'Website', risk: 'search', label: RISK_LABEL.search, headline: event.summary };
  }
  return { journey: 'Website', risk: 'experience', label: RISK_LABEL.experience, headline: event.summary };
}

export function criticalJourneyHrefs(origin: string): string[] {
  const base = origin.replace(/\/+$/, '');
  return ['/', '/pricing', '/checkout', '/cart', '/contact', '/contact-us', '/login'].map((path) => `${base}${path === '/' ? '/' : path}`);
}

export function siteHealth(input: { last_status: string | null; critical: number | null; errors: number | null }): 'critical' | 'warning' | 'healthy' | 'pending' {
  if (!input.last_status || input.last_status === 'pending' || input.last_status === 'queued') return 'pending';
  if (input.last_status === 'regression') return 'critical';
  if (input.last_status === 'failed' || Number(input.errors || 0) > 0) return 'warning';
  return 'healthy';
}

function journeyHeadline(event: Pick<ImpactEvent, 'code' | 'before' | 'after' | 'summary'>, journey: string): string {
  if (event.code === 'HTTP_STATUS_CHANGED') {
    const from = statusWord(event.before);
    const to = statusWord(event.after);
    return `${journey} ${from} → ${to}`;
  }
  if (event.code === 'NOINDEX_CHANGED') return `${journey} became noindex`;
  if (event.code === 'ROBOTS_ACCESS_CHANGED') return `${journey} blocked by robots.txt`;
  if (event.code === 'SITEMAP_URL_COUNT_DROP') {
    return `Sitemap URLs ${formatEvidenceValue(event.before)} → ${formatEvidenceValue(event.after)}`;
  }
  if (event.code === 'SITEMAP_DISAPPEARED') return 'Sitemap disappeared';
  return event.summary;
}

function formatEvidenceValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '?';
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric.toLocaleString('en-US') : String(value);
}

function statusWord(value: unknown): string {
  const n = Number(value);
  if (!n) return 'UNKNOWN';
  if (n >= 500) return 'ERROR';
  if (n >= 400) return String(n);
  return 'Working';
}

export function impactLabel(cls: string): string {
  if (cls === 'critical') return 'CRITICAL';
  if (cls === 'warning') return 'WARNING';
  if (cls === 'resolved') return 'RECOVERED';
  return 'INFO';
}
