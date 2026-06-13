import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithChain } from './fetch.js';
import { installFakeFetch } from '../test/fakeFetch.js';

afterEach(() => vi.unstubAllGlobals());

describe('fetchWithChain', () => {
  it('records each hop and returns the final document', async () => {
    installFakeFetch({
      'https://r.test/a': { status: 301, location: 'https://r.test/b' },
      'https://r.test/b': { status: 302, location: 'https://r.test/c' },
      'https://r.test/c': { status: 200, body: '<title>End</title>' }
    });
    const result = await fetchWithChain('https://r.test/a', 5000);
    expect(result.status).toBe(200);
    expect(result.finalUrl).toBe('https://r.test/c');
    expect(result.chain).toHaveLength(2);
    expect(result.loop).toBe(false);
    expect(result.text).toContain('End');
  });

  it('detects a redirect loop instead of looping forever', async () => {
    installFakeFetch({
      'https://loop.test/a': { status: 301, location: 'https://loop.test/b' },
      'https://loop.test/b': { status: 301, location: 'https://loop.test/a' }
    });
    const result = await fetchWithChain('https://loop.test/a', 5000);
    expect(result.loop).toBe(true);
    expect(result.chain.length).toBeGreaterThanOrEqual(2);
  });

  it('returns an empty chain when there is no redirect', async () => {
    installFakeFetch({ 'https://r.test/x': { status: 200, body: 'hi' } });
    const result = await fetchWithChain('https://r.test/x', 5000);
    expect(result.chain).toHaveLength(0);
    expect(result.finalUrl).toBe('https://r.test/x');
  });

  it('resolves relative Location headers against the current URL', async () => {
    installFakeFetch({
      'https://rel.test/start': { status: 302, location: '/landing' },
      'https://rel.test/landing': { status: 200, body: 'ok' }
    });
    const result = await fetchWithChain('https://rel.test/start', 5000);
    expect(result.finalUrl).toBe('https://rel.test/landing');
    expect(result.chain).toHaveLength(1);
  });
});
