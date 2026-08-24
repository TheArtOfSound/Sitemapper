/**
 * SSRF defenses for user-supplied URLs.
 *
 * Hosted scans must never follow a user URL (or redirect) into loopback,
 * private, link-local, or cloud-metadata address space.
 */

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.invalid', '.lan', '.home', '.corp'];

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

export function assertPublicHttpUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SsrfError('URL is not valid.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfError(`Unsupported URL scheme: ${url.protocol}`);
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) throw new SsrfError('URL is missing a hostname.');
  if (host.endsWith('.')) {
    return assertPublicHttpUrl(url.toString().replace(url.hostname, host.replace(/\.+$/, '')));
  }

  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new SsrfError(`Blocked host: ${host}`);
  }

  if (host === '0' || host === '0.0.0.0') {
    throw new SsrfError(`Blocked host: ${host}`);
  }

  if (isIpLiteral(host) && isPrivateOrSpecialIp(host)) {
    throw new SsrfError(`Blocked private or special-use address: ${host}`);
  }

  // Decimal / octal / hex IPv4 tricks: 2130706433 == 127.0.0.1
  if (/^\d+$/.test(host)) {
    const n = Number(host);
    if (Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff) {
      const dotted = intToIpv4(n);
      if (isPrivateOrSpecialIp(dotted)) {
        throw new SsrfError(`Blocked encoded IPv4 address: ${host} (${dotted})`);
      }
    }
  }

  return url;
}

export function isIpLiteral(host: string): boolean {
  return isIpv4(host) || isIpv6(host);
}

export function isPrivateOrSpecialIp(host: string): boolean {
  if (isIpv4(host)) return isPrivateIpv4(host);
  if (isIpv6(host)) return isPrivateIpv6(host);
  return false;
}

export function isIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
}

export function isIpv6(host: string): boolean {
  return host.includes(':') && /^[0-9a-f:]+$/i.test(host);
}

function isPrivateIpv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = expandIpv6(ip).toLowerCase();
  if (normalized === '0000:0000:0000:0000:0000:0000:0000:0001') return true; // ::1
  if (normalized === '0000:0000:0000:0000:0000:0000:0000:0000') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local
  if (normalized.startsWith('fe80')) return true; // link local
  if (normalized.startsWith('ff')) return true; // multicast
  // IPv4-mapped IPv6
  if (normalized.startsWith('0000:0000:0000:0000:0000:ffff:')) {
    const hi = parseInt(normalized.slice(30, 34), 16);
    const lo = parseInt(normalized.slice(35, 39), 16);
    const v4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
    return isPrivateIpv4(v4);
  }
  return false;
}

function expandIpv6(ip: string): string {
  const halves = ip.split('::');
  let groups: string[];
  if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const fill = 8 - left.length - right.length;
    groups = [...left, ...Array(Math.max(fill, 0)).fill('0'), ...right];
  } else {
    groups = ip.split(':');
  }
  while (groups.length < 8) groups.push('0');
  return groups
    .slice(0, 8)
    .map((g) => g.padStart(4, '0'))
    .join(':');
}

function intToIpv4(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

const DNS_VALIDATION_TIMEOUT_MS = 1_500;

/**
 * Resolve a hostname through DNS-over-HTTPS and reject private/special answers.
 *
 * DNS is a safety signal, but the resolver is still an external dependency. A
 * slow resolver must not leave a crawl hanging indefinitely. Callers retain the
 * existing behavior of treating non-SsrfError lookup failures as inconclusive
 * DNS validation while explicit private hosts and private DNS answers remain
 * hard failures.
 */
export async function resolveAndAssertPublic(
  hostname: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = DNS_VALIDATION_TIMEOUT_MS
): Promise<void> {
  if (isIpLiteral(hostname)) {
    if (isPrivateOrSpecialIp(hostname.replace(/^\[|\]$/g, ''))) {
      throw new SsrfError(`Blocked private or special-use address: ${hostname}`);
    }
    return;
  }

  const query = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
  const aaaa = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=AAAA`;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      const error = new Error(`DNS validation timed out after ${timeoutMs}ms.`);
      error.name = 'AbortError';
      reject(error);
    }, Math.max(1, timeoutMs));
  });

  try {
    const lookup = Promise.all([
      validateDnsResponse(hostname, fetcher(query, { headers: { accept: 'application/dns-json' }, signal: controller.signal })),
      validateDnsResponse(hostname, fetcher(aaaa, { headers: { accept: 'application/dns-json' }, signal: controller.signal })),
    ]);
    await Promise.race([lookup, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function validateDnsResponse(hostname: string, response: Promise<Response>): Promise<void> {
  for (const answer of await dnsAnswers(await response)) {
    if (isPrivateOrSpecialIp(answer)) {
      throw new SsrfError(`DNS for ${hostname} resolved to a blocked address (${answer}).`);
    }
  }
}

async function dnsAnswers(response: Response): Promise<string[]> {
  if (!response.ok) return [];
  try {
    const body = (await response.json()) as { Answer?: Array<{ type: number; data: string }> };
    return (body.Answer || [])
      .filter((row) => row.type === 1 || row.type === 28)
      .map((row) => row.data.replace(/\.$/, ''));
  } catch {
    return [];
  }
}

export const MAX_RESPONSE_BYTES = 2_000_000;

export async function readLimitedBody(response: Response, maxBytes = MAX_RESPONSE_BYTES): Promise<string> {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) {
    throw new SsrfError(`Response too large (${declared} bytes).`);
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > maxBytes) {
      throw new SsrfError(`Response exceeded ${maxBytes} bytes.`);
    }
    return text;
  }
  const reader = response.body.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      size += value.byteLength;
      if (size > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        throw new SsrfError(`Response exceeded ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
  }
  let offset = 0;
  const merged = new Uint8Array(size);
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}
