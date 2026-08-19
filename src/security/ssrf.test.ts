import { describe, expect, it } from 'vitest';
import { SsrfError, assertPublicHttpUrl, isPrivateOrSpecialIp } from './ssrf.js';

describe('assertPublicHttpUrl', () => {
  it('allows ordinary https URLs', () => {
    expect(assertPublicHttpUrl('https://example.com/sitemap.xml').hostname).toBe('example.com');
  });

  it('rejects non-http schemes', () => {
    expect(() => assertPublicHttpUrl('file:///etc/passwd')).toThrow(SsrfError);
    expect(() => assertPublicHttpUrl('ftp://example.com')).toThrow(SsrfError);
  });

  it('rejects localhost and loopback', () => {
    expect(() => assertPublicHttpUrl('http://localhost/')).toThrow(/Blocked/);
    expect(() => assertPublicHttpUrl('http://127.0.0.1/')).toThrow(/Blocked/);
    expect(() => assertPublicHttpUrl('http://[::1]/')).toThrow(/Blocked/);
  });

  it('rejects private and metadata ranges', () => {
    expect(() => assertPublicHttpUrl('http://10.0.0.4/')).toThrow(/Blocked/);
    expect(() => assertPublicHttpUrl('http://192.168.1.1/')).toThrow(/Blocked/);
    expect(() => assertPublicHttpUrl('http://172.16.0.1/')).toThrow(/Blocked/);
    expect(() => assertPublicHttpUrl('http://169.254.169.254/latest/meta-data')).toThrow(/Blocked/);
    expect(() => assertPublicHttpUrl('http://metadata.google.internal/')).toThrow(/Blocked/);
  });

  it('rejects decimal-encoded loopback', () => {
    expect(() => assertPublicHttpUrl('http://2130706433/')).toThrow(/Blocked/);
  });

  it('rejects IPv4-mapped IPv6 loopback', () => {
    expect(() => assertPublicHttpUrl('http://[::ffff:127.0.0.1]/')).toThrow(/Blocked/);
  });
});

describe('isPrivateOrSpecialIp', () => {
  it('classifies common public vs private v4', () => {
    expect(isPrivateOrSpecialIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrSpecialIp('1.1.1.1')).toBe(false);
    expect(isPrivateOrSpecialIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrSpecialIp('100.64.0.1')).toBe(true);
  });
});
