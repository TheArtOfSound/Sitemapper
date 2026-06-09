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

export function sameHost(url: string, site: string): boolean {
  return new URL(url).hostname === new URL(site).hostname;
}

export function pathFromUrl(url: string): string {
  const path = new URL(url).pathname || '/';
  return path === '' ? '/' : path;
}

export function sectionFromPath(path: string): string {
  const clean = path.replace(/^\/+/, '');
  if (!clean) return 'home';
  return clean.split('/')[0] || 'home';
}

export function dedupeUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.map(normalizePageUrl))).sort();
}
