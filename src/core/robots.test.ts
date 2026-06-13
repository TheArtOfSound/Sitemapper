import { describe, expect, it } from 'vitest';
import { isPathAllowed, parseRobots, requestPath } from './robots.js';

describe('robots.txt parser and matcher', () => {
  it('allows everything when there are no groups', () => {
    const rules = parseRobots('');
    expect(rules.hasGroups).toBe(false);
    expect(isPathAllowed(rules, '/anything')).toBe(true);
  });

  it('blocks a disallowed prefix and allows everything else', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /private\n');
    expect(isPathAllowed(rules, '/private')).toBe(false);
    expect(isPathAllowed(rules, '/private/page')).toBe(false);
    expect(isPathAllowed(rules, '/public')).toBe(true);
  });

  it('treats an empty Disallow as allow-all', () => {
    const rules = parseRobots('User-agent: *\nDisallow:\n');
    expect(isPathAllowed(rules, '/anything')).toBe(true);
  });

  it('blocks the whole site with Disallow: /', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /\n');
    expect(isPathAllowed(rules, '/')).toBe(false);
    expect(isPathAllowed(rules, '/page')).toBe(false);
  });

  it('lets a more specific Allow override a broader Disallow', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /folder\nAllow: /folder/public\n');
    expect(isPathAllowed(rules, '/folder/secret')).toBe(false);
    expect(isPathAllowed(rules, '/folder/public')).toBe(true);
  });

  it('lets Allow win on an equal-length tie', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a\n');
    expect(isPathAllowed(rules, '/a')).toBe(true);
  });

  it('supports * wildcards and the $ end-anchor', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /*.pdf$\n');
    expect(isPathAllowed(rules, '/docs/report.pdf')).toBe(false);
    expect(isPathAllowed(rules, '/docs/report.pdf?v=2')).toBe(true); // $ anchors the end
    expect(isPathAllowed(rules, '/docs/report.html')).toBe(true);
  });

  it('selects the matching user-agent group, falling back to *', () => {
    const rules = parseRobots('User-agent: badbot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n');
    expect(isPathAllowed(rules, '/admin', 'badbot')).toBe(false);
    expect(isPathAllowed(rules, '/home', 'badbot')).toBe(false); // badbot is fully blocked
    expect(isPathAllowed(rules, '/admin', 'Googlebot')).toBe(false); // falls back to *
    expect(isPathAllowed(rules, '/home', 'Googlebot')).toBe(true);
  });

  it('extracts Sitemap directives', () => {
    const rules = parseRobots('Sitemap: https://example.com/sitemap.xml\nUser-agent: *\nDisallow:\n');
    expect(rules.sitemaps).toEqual(['https://example.com/sitemap.xml']);
  });

  it('derives the request path (path + query) from a URL', () => {
    expect(requestPath('https://example.com/a/b?x=1')).toBe('/a/b?x=1');
    expect(requestPath('https://example.com')).toBe('/');
  });
});
