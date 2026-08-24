import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAgentPack } from './agent-pack.js';
import { analyze } from './index.js';

type Route = { status?: number; body?: string } | 'abort' | 'hang';

function installFetch(routes: Record<string, Route>, options: { dnsFails?: boolean } = {}) {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    calls.push(url);
    if (url.startsWith('https://cloudflare-dns.com/dns-query')) {
      if (options.dnsFails) throw new TypeError('DNS resolver unavailable');
      return new Response(JSON.stringify({ Answer: [{ type: 1, data: '203.0.113.10' }] }), {
        headers: { 'content-type': 'application/dns-json' },
      });
    }

    const route = routes[url] ?? { status: 404, body: 'Not found' };
    if (route === 'abort') {
      const error = new Error('The operation was aborted.');
      error.name = 'AbortError';
      throw error;
    }
    if (route === 'hang') {
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () => {
          const error = new Error('The operation was aborted.');
          error.name = 'AbortError';
          reject(error);
        };
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
      });
    }
    return new Response(route.body ?? '', {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/xml; charset=utf-8' },
    });
  });
  vi.stubGlobal('fetch', fetcher);
  return { calls, fetcher };
}

function urlset(...urls: string[]): string {
  return `<urlset>${urls.map((url) => `<url><loc>${url}</loc></url>`).join('')}</urlset>`;
}

function networkCalls(calls: string[]): string[] {
  return calls.filter((url) => !url.startsWith('https://cloudflare-dns.com/dns-query'));
}

afterEach(() => vi.unstubAllGlobals());

describe('anonymous scanner discovery', () => {
  it('does not fetch alternate-origin robots after the primary candidate succeeds', async () => {
    const test = installFetch({
      'https://example.com/robots.txt': {
        body: 'User-agent: *\nSitemap: https://example.com/sitemap.xml\n',
      },
      'https://example.com/sitemap.xml': {
        body: urlset('https://example.com/a', 'https://example.com/b'),
      },
    });

    const result = await analyze('https://example.com', {
      maxUrls: 100,
      maxDeep: 0,
      discoveryBudgetMs: 1_000,
    });

    expect(result.source.discoveredUrlCount).toBe(2);
    expect(networkCalls(test.calls).some((url) => url.startsWith('https://www.example.com/'))).toBe(false);
  });

  it('stops probing speculative root paths once a fallback sitemap is usable', async () => {
    const test = installFetch({
      'https://example.com/robots.txt': { body: 'User-agent: *\nAllow: /\n' },
      'https://example.com/sitemap.xml': { body: urlset('https://example.com/only') },
    });

    const result = await analyze('https://example.com', {
      maxUrls: 100,
      maxDeep: 0,
      discoveryBudgetMs: 1_000,
    });
    const calls = networkCalls(test.calls);

    expect(result.source.discoveredUrlCount).toBe(1);
    expect(calls).not.toContain('https://example.com/sitemap_index.xml');
    expect(calls).not.toContain('https://example.com/wp-sitemap.xml');
    expect(calls.some((url) => url.startsWith('https://www.example.com/'))).toBe(false);
  });

  it('only reaches the alternate origin after the primary candidate yields no entries', async () => {
    const test = installFetch({
      'https://example.com/robots.txt': { body: 'User-agent: *\nAllow: /\n' },
      'https://www.example.com/robots.txt': {
        body: 'User-agent: *\nSitemap: https://www.example.com/sitemap.xml\n',
      },
      'https://www.example.com/sitemap.xml': { body: urlset('https://www.example.com/recovered') },
    });

    const result = await analyze('https://example.com', {
      maxUrls: 100,
      maxDeep: 0,
      discoveryBudgetMs: 1_000,
    });
    const calls = networkCalls(test.calls);
    const alternateRobots = calls.indexOf('https://www.example.com/robots.txt');
    const lastPrimaryFallback = calls.indexOf('https://example.com/sitemap/sitemap.xml');

    expect(result.source.discoveredUrlCount).toBe(1);
    expect(alternateRobots).toBeGreaterThan(lastPrimaryFallback);
  });

  it('treats non-2xx sitemap responses as failed rather than loaded', async () => {
    installFetch({
      'https://example.com/sitemap.xml': { status: 503, body: 'Unavailable' },
    });

    const result = await analyze('https://example.com/sitemap.xml', {
      maxUrls: 100,
      maxDeep: 0,
      discoveryBudgetMs: 1_000,
    });
    const codes = result.issues.map((issue) => issue.code);

    expect(codes).toContain('NO_ACCESSIBLE_SITEMAP');
    expect(codes).toContain('SITEMAP_FETCH_FAILED');
    expect(codes).not.toContain('SITEMAPS_FOUND_BUT_UNUSABLE');
    expect(result.source.failures).toContain('https://example.com/sitemap.xml returned HTTP 503.');
  });

  it('keeps scores unavailable and does not guess journey URLs when sitemap inventory is empty', async () => {
    const journeyHtml = '<html><title>Example journey page</title><meta name="description" content="A responding journey page used only as diagnostic evidence for this scan."></html>';
    const test = installFetch({
      'https://example.com/sitemap.xml': { status: 404, body: 'Not found' },
      'https://example.com/': { status: 200, body: journeyHtml },
      'https://example.com/pricing': { status: 200, body: journeyHtml },
      'https://example.com/checkout': { status: 200, body: journeyHtml },
      'https://example.com/cart': { status: 200, body: journeyHtml },
      'https://example.com/contact': { status: 200, body: journeyHtml },
      'https://example.com/contact-us': { status: 200, body: journeyHtml },
      'https://example.com/login': { status: 200, body: journeyHtml },
    });

    const result = await analyze('https://example.com/sitemap.xml', {
      maxUrls: 100,
      maxDeep: 0,
      discoveryBudgetMs: 1_000,
    });

    expect(result.source.discoveredUrlCount).toBe(0);
    expect(result.pages).toEqual([]);
    expect(networkCalls(test.calls)).not.toContain('https://example.com/checkout');
    expect(result.issues.some((issue) => issue.code === 'NO_ACCESSIBLE_SITEMAP')).toBe(true);
    expect(result.scores).toEqual({ index: 0, seo: 0, sitemap: 0, available: false });
  });

  it('prioritizes only critical journeys declared by the sitemap', async () => {
    const healthy = '<html><title>Healthy example page</title><meta name="description" content="A sufficiently descriptive example page for scanner regression coverage."></html>';
    const test = installFetch({
      'https://example.com/sitemap.xml': {
        body: urlset('https://example.com/a', 'https://example.com/checkout'),
      },
      'https://example.com/a': { status: 200, body: healthy },
      'https://example.com/checkout': {
        status: 404,
        body: '<html><title>Missing checkout</title><meta name="robots" content="noindex"></html>',
      },
      'https://example.com/cart': { status: 404, body: 'An undeclared guessed journey must not be requested.' },
    });

    const result = await analyze('https://example.com/sitemap.xml', {
      maxUrls: 100,
      maxDeep: 1,
      discoveryBudgetMs: 1_000,
    });
    const checkout = result.pages.find((page) => page.url === 'https://example.com/checkout');
    const inventory = JSON.parse(
      buildAgentPack(result).files.find((file) => file.path === 'sitemapper/inventory.json')!.content
    ) as { count: number; pages: Array<{ url: string }> };

    expect(result.source.discoveredUrlCount).toBe(2);
    expect(result.source.deepCheckedCount).toBe(2);
    expect(result.stats.pages).toBe(2);
    expect(checkout?.sitemapListed).toBe(true);
    expect(checkout?.issues.map((issue) => issue.code)).toContain('BAD_STATUS');
    expect(checkout?.issues.map((issue) => issue.code)).toContain('NOINDEX_IN_SITEMAP');
    expect(networkCalls(test.calls)).not.toContain('https://example.com/cart');
    expect(result.pages.some((page) => page.url === 'https://example.com/cart')).toBe(false);
    expect(inventory.count).toBe(2);
    expect(inventory.pages.map((page) => page.url)).toEqual([
      'https://example.com/a',
      'https://example.com/checkout',
    ]);
  });

  it('classifies a blocked sitemap response as inconclusive and unscored', async () => {
    installFetch({
      'https://example.com/sitemap.xml': { status: 403, body: 'Forbidden' },
    });

    const result = await analyze('https://example.com/sitemap.xml', {
      maxUrls: 100,
      maxDeep: 0,
      discoveryBudgetMs: 1_000,
    });
    const codes = result.issues.map((issue) => issue.code);

    expect(codes).toContain('SCAN_INCONCLUSIVE');
    expect(codes).not.toContain('NO_ACCESSIBLE_SITEMAP');
    expect(result.stats.errors).toBe(0);
    expect(result.scores).toEqual({ index: 0, seo: 0, sitemap: 0, available: false });
    expect(result.source.failures).toContain(
      'https://example.com/sitemap.xml looks blocked or challenged by bot protection.'
    );
  });

  it('classifies a 200 bot-challenge document with no inventory as inconclusive', async () => {
    installFetch({
      'https://example.com/sitemap.xml': {
        status: 200,
        body: '<html><title>Access challenge</title><p>Verify you are human</p></html>',
      },
    });

    const result = await analyze('https://example.com/sitemap.xml', {
      maxUrls: 100,
      maxDeep: 0,
      discoveryBudgetMs: 1_000,
    });
    const codes = result.issues.map((issue) => issue.code);

    expect(codes).toContain('SCAN_INCONCLUSIVE');
    expect(codes).not.toContain('SITEMAPS_FOUND_BUT_UNUSABLE');
    expect(result.source.discoveredUrlCount).toBe(0);
    expect(result.scores.available).toBe(false);
  });

  it('keeps a successfully fetched empty XML sitemap conclusive', async () => {
    installFetch({
      'https://example.com/sitemap.xml': { status: 200, body: '<urlset></urlset>' },
    });

    const result = await analyze('https://example.com/sitemap.xml', {
      maxUrls: 100,
      maxDeep: 0,
      discoveryBudgetMs: 1_000,
    });
    const codes = result.issues.map((issue) => issue.code);

    expect(codes).toContain('SITEMAPS_FOUND_BUT_UNUSABLE');
    expect(codes).not.toContain('SCAN_INCONCLUSIVE');
  });

  it('reports an all-abort discovery as unscored and inconclusive, after emitting an attempt event', async () => {
    installFetch({ 'https://example.com/sitemap.xml': 'abort' });
    const events: Array<{ label: string; detail?: string }> = [];

    const result = await analyze('https://example.com/sitemap.xml', {
      maxUrls: 100,
      maxDeep: 0,
      discoveryBudgetMs: 1_000,
      onProgress: (event) => events.push(event),
    });
    const codes = result.issues.map((issue) => issue.code);

    expect(events.some((event) => event.label === 'Checking sitemap 1 of 1' && event.detail === 'https://example.com/sitemap.xml')).toBe(true);
    expect(codes).toContain('SCAN_INCONCLUSIVE');
    expect(codes).not.toContain('NO_ACCESSIBLE_SITEMAP');
    expect(result.stats.errors).toBe(0);
    expect(result.pages).toEqual([]);
    expect(result.scores).toEqual({ index: 0, seo: 0, sitemap: 0, available: false });
  });

  it('turns a discovery-budget abort into an inconclusive result', async () => {
    installFetch({ 'https://example.com/sitemap.xml': 'hang' });
    const started = Date.now();

    const result = await analyze('https://example.com/sitemap.xml', {
      maxUrls: 100,
      maxDeep: 0,
      discoveryBudgetMs: 20,
    });

    expect(Date.now() - started).toBeLessThan(500);
    expect(result.issues.some((issue) => issue.code === 'SCAN_INCONCLUSIVE')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'NO_ACCESSIBLE_SITEMAP')).toBe(false);
  });

  it('preserves the existing fallback when DNS validation has a non-Ssrf network failure', async () => {
    const test = installFetch(
      {
        'https://example.com/robots.txt': {
          body: 'User-agent: *\nSitemap: https://example.com/sitemap.xml\n',
        },
        'https://example.com/sitemap.xml': { body: urlset('https://example.com/page') },
      },
      { dnsFails: true }
    );

    const result = await analyze('https://example.com', {
      maxUrls: 100,
      maxDeep: 0,
      discoveryBudgetMs: 1_000,
    });

    expect(result.source.discoveredUrlCount).toBe(1);
    expect(test.fetcher).toHaveBeenCalled();
  });
});
