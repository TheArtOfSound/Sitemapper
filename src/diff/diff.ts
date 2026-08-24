import { isHighValue } from './impact.js';
import type { CrawlSnapshot, UrlState } from './snapshot.js';
import { urlMap } from './snapshot.js';

export type ChangeClass = 'critical' | 'warning' | 'info' | 'resolved';

export type ChangeEvent = {
  code: string;
  class: ChangeClass;
  url?: string;
  before?: unknown;
  after?: unknown;
  count: number;
  summary: string;
};

export function diffSnapshots(previous: CrawlSnapshot, next: CrawlSnapshot): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  const prevUrls = urlMap(previous);
  const nextUrls = urlMap(next);

  const prevSitemaps = comparableSitemapUrls(previous);
  const nextSitemaps = comparableSitemapUrls(next);

  for (const url of nextSitemaps) {
    if (!prevSitemaps.has(url)) {
      events.push(change('SITEMAP_APPEARED', 'info', { after: url, summary: `Sitemap appeared: ${url}` }));
    }
  }
  for (const url of prevSitemaps) {
    if (!nextSitemaps.has(url)) {
      events.push(change('SITEMAP_DISAPPEARED', 'critical', { before: url, summary: `Sitemap disappeared: ${url}` }));
    }
  }

  const prevCount = previous.declaredCount || previous.urls.length;
  const nextCount = next.declaredCount || next.urls.length;
  if (prevCount > 0) {
    const delta = (nextCount - prevCount) / prevCount;
    if (delta <= -0.2) {
      events.push(
        change('SITEMAP_URL_COUNT_DROP', 'critical', {
          before: prevCount,
          after: nextCount,
          count: prevCount - nextCount,
          summary: `Sitemap URL count fell ${pct(delta)} (${prevCount} → ${nextCount}).`,
        })
      );
    } else if (delta >= 0.2) {
      events.push(
        change('SITEMAP_URL_COUNT_SPIKE', 'warning', {
          before: prevCount,
          after: nextCount,
          count: nextCount - prevCount,
          summary: `Sitemap URL count rose ${pct(delta)} (${prevCount} → ${nextCount}).`,
        })
      );
    }
  }

  const added: string[] = [];
  const removed: string[] = [];
  for (const url of nextUrls.keys()) if (!prevUrls.has(url)) added.push(url);
  for (const url of prevUrls.keys()) if (!nextUrls.has(url)) removed.push(url);

  if (added.length) {
    events.push(
      change('URL_ADDED', 'info', {
        count: added.length,
        after: sample(added),
        summary: `${added.length} URL(s) added to the sitemap.`,
      })
    );
  }
  if (removed.length) {
    const cls: ChangeClass = removed.length / Math.max(prevCount, 1) >= 0.1 || removed.some(isHighValue) ? 'critical' : 'warning';
    events.push(
      change('URL_REMOVED', cls, {
        count: removed.length,
        before: sample(removed),
        summary: `${removed.length} URL(s) removed from the sitemap.`,
      })
    );
  }

  for (const [url, nextRow] of nextUrls) {
    const prevRow = prevUrls.get(url);
    if (!prevRow) continue;
    events.push(...diffUrl(prevRow, nextRow));
  }

  const prevIssue = countBy(previous.issues.map((issue) => issue.code));
  const nextIssue = countBy(next.issues.map((issue) => issue.code));
  for (const [code, count] of nextIssue) {
    const before = prevIssue.get(code) || 0;
    if (code === 'NO_ACCESSIBLE_SITEMAP' && before === 0 && count > 0) {
      events.push(change('XML_PARSER_FAILURE_INTRODUCED', 'critical', { after: count, summary: 'Sitemap became unreachable or unparsable.' }));
    }
  }
  for (const [code, before] of prevIssue) {
    const after = nextIssue.get(code) || 0;
    if (code === 'NO_ACCESSIBLE_SITEMAP' && before > 0 && after === 0) {
      events.push(change('XML_PARSER_FAILURE_RESOLVED', 'resolved', { before, summary: 'Sitemap fetch/parse recovered.' }));
    }
  }

  return collapse(events);
}

function comparableSitemapUrls(snapshot: CrawlSnapshot): Set<string> {
  const unusable = new Set<string>();
  for (const issue of snapshot.issues) {
    const proof = `${issue.message || ''} ${issue.evidence || ''}`;
    const explicitlyUnusable =
      issue.code === 'SITEMAP_FETCH_FAILED' ||
      issue.code === 'DISCOVERY_ATTEMPT_INCONCLUSIVE' ||
      (issue.code === 'DISCOVERY_NOTE' &&
        (proof.includes('loaded but produced 0 same-host sitemap children or URL entries') ||
          proof.includes(' returned HTTP ') ||
          proof.includes(' failed: ')));
    if (!explicitlyUnusable) continue;
    for (const url of snapshot.sitemapUrls) {
      if (proof.includes(url)) unusable.add(url);
    }
  }
  return new Set(snapshot.sitemapUrls.filter((url) => !unusable.has(url)));
}

function diffUrl(prev: UrlState, next: UrlState): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  const url = next.url;
  if (prev.status !== next.status) {
    const cls = isWorseStatus(prev.status, next.status) ? (isHighValue(url) || (next.status || 0) >= 500 ? 'critical' : 'warning') : 'resolved';
    events.push(
      change('HTTP_STATUS_CHANGED', cls, {
        url,
        before: prev.status,
        after: next.status,
        summary: `${url} status ${prev.status ?? '—'} → ${next.status ?? '—'}.`,
      })
    );
  }
  if ((prev.redirectTarget || prev.finalUrl) !== (next.redirectTarget || next.finalUrl)) {
    events.push(
      change('REDIRECT_CHANGED', next.redirectTarget ? 'warning' : 'info', {
        url,
        before: prev.redirectTarget || prev.finalUrl,
        after: next.redirectTarget || next.finalUrl,
        summary: `${url} redirect target changed.`,
      })
    );
  }
  if ((prev.canonical || '') !== (next.canonical || '')) {
    events.push(
      change('CANONICAL_CHANGED', isHighValue(url) ? 'critical' : 'warning', {
        url,
        before: prev.canonical,
        after: next.canonical,
        summary: `${url} canonical changed.`,
      })
    );
  }
  if (prev.noindex !== next.noindex) {
    events.push(
      change('NOINDEX_CHANGED', next.noindex ? 'critical' : 'resolved', {
        url,
        before: prev.noindex,
        after: next.noindex,
        summary: next.noindex ? `${url} became noindex.` : `${url} noindex removed.`,
      })
    );
  }
  if (prev.robotsAllowed !== next.robotsAllowed) {
    events.push(
      change('ROBOTS_ACCESS_CHANGED', next.robotsAllowed ? 'resolved' : 'critical', {
        url,
        before: prev.robotsAllowed,
        after: next.robotsAllowed,
        summary: next.robotsAllowed ? `${url} is allowed by robots.txt again.` : `${url} is now blocked by robots.txt.`,
      })
    );
  }
  if ((prev.title || '') !== (next.title || '')) {
    events.push(change('TITLE_CHANGED', 'info', { url, before: prev.title, after: next.title, summary: `${url} title changed.` }));
  }
  if ((prev.description || '') !== (next.description || '')) {
    events.push(
      change('META_DESCRIPTION_CHANGED', 'info', {
        url,
        before: prev.description,
        after: next.description,
        summary: `${url} meta description changed.`,
      })
    );
  }
  if ((prev.lastmod || '') !== (next.lastmod || '')) {
    events.push(change('LASTMOD_CHANGED', 'info', { url, before: prev.lastmod, after: next.lastmod, summary: `${url} lastmod changed.` }));
  }
  if ((prev.sitemapSource || '') !== (next.sitemapSource || '')) {
    events.push(
      change('SITEMAP_SOURCE_CHANGED', 'info', {
        url,
        before: prev.sitemapSource,
        after: next.sitemapSource,
        summary: `${url} sitemap source changed.`,
      })
    );
  }
  return events;
}

function collapse(events: ChangeEvent[]): ChangeEvent[] {
  const grouped = new Map<string, ChangeEvent>();
  for (const event of events) {
    if (event.url && ['TITLE_CHANGED', 'META_DESCRIPTION_CHANGED', 'LASTMOD_CHANGED'].includes(event.code)) {
      const key = event.code;
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        existing.summary = `${existing.count} ${event.code.replace(/_/g, ' ').toLowerCase()} event(s).`;
        continue;
      }
      grouped.set(key, { ...event, url: undefined, count: 1 });
      continue;
    }
    grouped.set(`${event.code}:${event.url || event.summary}`, event);
  }
  return [...grouped.values()].sort((a, b) => rank(a.class) - rank(b.class) || a.code.localeCompare(b.code));
}

function change(
  code: string,
  cls: ChangeClass,
  extra: Partial<ChangeEvent> & { summary: string }
): ChangeEvent {
  return { code, class: cls, count: extra.count ?? 1, summary: extra.summary, url: extra.url, before: extra.before, after: extra.after };
}

function isWorseStatus(prev?: number, next?: number): boolean {
  const p = prev ?? 0;
  const n = next ?? 0;
  const score = (s: number) => (s >= 500 ? 3 : s >= 400 ? 2 : s >= 300 ? 1 : 0);
  return score(n) > score(p);
}

function pct(delta: number): string {
  return `${Math.round(Math.abs(delta) * 100)}%`;
}

function sample(urls: string[], n = 8): string[] {
  return urls.slice(0, n);
}

function countBy(items: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) map.set(item, (map.get(item) || 0) + 1);
  return map;
}

function rank(cls: ChangeClass): number {
  return { critical: 0, warning: 1, info: 2, resolved: 3 }[cls];
}

export function summarizeChanges(events: ChangeEvent[]): string {
  const critical = events.filter((event) => event.class === 'critical');
  if (!critical.length) {
    const warnings = events.filter((event) => event.class === 'warning');
    if (!warnings.length) return 'No indexability regressions versus the previous snapshot.';
    return warnings.map((event) => event.summary).join(' ');
  }
  return critical.map((event) => event.summary).join(' ');
}
