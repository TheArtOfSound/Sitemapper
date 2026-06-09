import { describe, expect, it } from 'vitest';
import { normalizeSite, pathFromUrl, sectionFromPath } from './url.js';

describe('url utilities', () => {
  it('normalizes a bare domain into an https site origin', () => {
    expect(normalizeSite('Example.com/')).toBe('https://example.com');
  });

  it('extracts paths and sections', () => {
    expect(pathFromUrl('https://example.com/blog/post?x=1')).toBe('/blog/post');
    expect(sectionFromPath('/blog/post')).toBe('blog');
    expect(sectionFromPath('/')).toBe('home');
  });
});
