import { describe, expect, it } from 'vitest';
import { displayPathFromUrl, normalizeSite, pageTypeFromUrl, pathFromUrl, sectionFromPath, sectionFromUrl } from './url.js';

describe('url utilities', () => {
  it('normalizes a bare domain into an https site origin', () => {
    expect(normalizeSite('Example.com/')).toBe('https://example.com');
  });

  it('extracts paths and sections', () => {
    expect(pathFromUrl('https://example.com/blog/post?x=1')).toBe('/blog/post');
    expect(sectionFromPath('/blog/post')).toBe('blog');
    expect(sectionFromPath('/')).toBe('home');
  });

  it('preserves query strings in display paths', () => {
    expect(displayPathFromUrl('https://example.com/c/ai?page=10')).toBe('/c/ai?page=10');
  });

  it('classifies large content-network routes', () => {
    expect(sectionFromUrl('https://example.com/c/ai?page=10')).toBe('c/ai');
    expect(pageTypeFromUrl('https://example.com/c/ai?page=10')).toBe('category_page');
    expect(pageTypeFromUrl('https://example.com/archive/2026-06-09')).toBe('archive');
    expect(pageTypeFromUrl('https://example.com/cluster/_abc')).toBe('cluster');
    expect(pageTypeFromUrl('https://example.com/canvas/archive/2026-06-08')).toBe('canvas');
  });
});
