import { vi } from 'vitest';

/**
 * Test helper: replace global fetch with a deterministic router so the
 * network-facing code (discovery, sitemap loading, page inspection) can be
 * exercised without hitting the real internet.
 */
export interface FakeRoute {
  status?: number;
  body?: string;
  finalUrl?: string;
  throws?: boolean;
}

export function installFakeFetch(routes: Record<string, FakeRoute>): void {
  const handler = async (input: unknown): Promise<Response> => {
    const url = typeof input === 'string' ? input : String((input as { url?: string }).url ?? input);
    const route = routes[url];
    if (route?.throws) throw new Error(`fake network error: ${url}`);
    const resolved: FakeRoute = route ?? { status: 404, body: 'Not found' };
    const status = resolved.status ?? 200;
    const fake = {
      url: resolved.finalUrl ?? url,
      status,
      ok: status >= 200 && status < 300,
      text: async () => resolved.body ?? '',
      headers: { get: () => 'text/html; charset=utf-8' }
    };
    return fake as unknown as Response;
  };
  vi.stubGlobal('fetch', vi.fn(handler));
}
