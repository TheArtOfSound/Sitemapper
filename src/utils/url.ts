import type { PageType } from '../types.js';

export function normalizeSite(input: string): string {
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withProtocol);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

export function normalizePageUrl(input: string): string {
  const url = new URL(input);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }
  if (url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return url.toString();
}

export function canonicalDedupeKey(input: string): string {
  const url = new URL(input);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname === '/index.html' || url.pathname === '/index.htm') {
    url.pathname = '/';
  }
  if (url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}${url.search}`;
}

export function sameHost(url: string, site: string): boolean {
  return new URL(url).hostname === new URL(site).hostname;
}

export function pathFromUrl(url: string): string {
  const path = new URL(url).pathname || '/';
  return path === '' ? '/' : path;
}

export function displayPathFromUrl(url: string): string {
  const parsed = new URL(url);
  const path = parsed.pathname || '/';
  return `${path === '' ? '/' : path}${parsed.search}`;
}

export function pageTypeFromUrl(url: string): PageType {
  const parsed = new URL(url);
  const parts = parsed.pathname.split('/').filter(Boolean);

  if (parts.length === 0) return 'home';
  if (parts[0] === 'archive') return 'archive';
  if (parts[0] === 'cluster') return 'cluster';
  if (parts[0] === 'canvas') return 'canvas';
  if (parts[0] === 'source' || parts[0] === 'sources') return 'source';
  if (parts[0] === 'story' || parts[0] === 'stories') return 'story';
  if (['c', 'category', 'categories', 'tag', 'tags', 'topic', 'topics'].includes(parts[0])) {
    return parsed.search ? 'category_page' : 'category';
  }
  if (parsed.search && /(?:^|[?&])page=\d+/i.test(parsed.search)) return 'category_page';
  if (parts.length === 1) return 'static';
  return 'generated';
}

export function sectionFromUrl(url: string): string {
  const parsed = new URL(url);
  const parts = parsed.pathname.split('/').filter(Boolean);

  if (parts.length === 0) return 'home';
  if (['c', 'category', 'categories', 'tag', 'tags', 'topic', 'topics'].includes(parts[0]) && parts[1]) {
    return `${parts[0]}/${parts[1]}`;
  }
  if (parts[0] === 'archive' && parts[1]) return 'archive';
  if (parts[0] === 'cluster') return 'cluster';
  if (parts[0] === 'canvas') return parts[1] ? 'canvas/archive' : 'canvas';
  return parts[0] || 'home';
}

export function sectionFromPath(path: string): string {
  const clean = path.replace(/^\/+/, '');
  if (!clean) return 'home';
  return clean.split('/')[0] || 'home';
}

export function dedupeUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.map(normalizePageUrl))).sort();
}
