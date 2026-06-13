import type { RedirectHop } from '../types.js';

export interface FetchTextResult {
  url: string;
  status: number;
  ok: boolean;
  text: string;
  finalUrl: string;
}

export interface FetchChainResult {
  status: number;
  finalUrl: string;
  text: string;
  chain: RedirectHop[];
  loop: boolean;
  truncated: boolean;
}

const UA = 'Sitemapper/0.1 (+https://github.com/TheArtOfSound/Sitemapper)';
const ACCEPT = 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8';

/**
 * Follow redirects one hop at a time so the full chain, loops, and the final
 * destination are observable (plain fetch with redirect:'follow' hides them).
 */
export async function fetchWithChain(url: string, timeoutMs: number, maxHops = 10): Promise<FetchChainResult> {
  const chain: RedirectHop[] = [];
  const visited = new Set<string>();
  let current = url;

  for (let hop = 0; hop <= maxHops; hop++) {
    const step = await fetchManual(current, timeoutMs);
    const isRedirect = step.status >= 300 && step.status < 400 && Boolean(step.location);
    if (!isRedirect) {
      return { status: step.status, finalUrl: step.finalUrl, text: step.text, chain, loop: false, truncated: false };
    }
    let next: string;
    try {
      next = new URL(step.location, current).toString();
    } catch {
      next = step.location;
    }
    chain.push({ url: current, status: step.status, location: next });
    if (visited.has(next)) {
      return { status: step.status, finalUrl: next, text: '', chain, loop: true, truncated: false };
    }
    visited.add(current);
    current = next;
  }

  return { status: 310, finalUrl: current, text: '', chain, loop: false, truncated: true };
}

async function fetchManual(
  url: string,
  timeoutMs: number
): Promise<{ status: number; location: string; finalUrl: string; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': UA, accept: ACCEPT }
    });
    const location = response.headers.get('location') ?? '';
    const isRedirect = response.status >= 300 && response.status < 400 && Boolean(location);
    const text = isRedirect ? '' : await response.text();
    return { status: response.status, location, finalUrl: response.url || url, text };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchText(url: string, timeoutMs: number): Promise<FetchTextResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Sitemapper/0.1 (+https://github.com/TheArtOfSound/Sitemapper)',
        accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
      }
    });

    return {
      url,
      status: response.status,
      ok: response.ok,
      text: await response.text(),
      finalUrl: response.url
    };
  } finally {
    clearTimeout(timeout);
  }
}
