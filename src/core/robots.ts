// Dependency-free robots.txt parser and path matcher.
// Shared by the CLI core and the Cloudflare Worker so both judge robots.txt
// conflicts identically. Implements the widely-supported Google semantics:
// per-user-agent groups, Allow/Disallow, `*` wildcards, `$` end-anchor, and
// longest-match-wins with Allow breaking ties.

export interface RobotsRule {
  allow: boolean;
  pattern: string;
  length: number;
  regex: RegExp;
}

export interface RobotsRules {
  groups: Record<string, RobotsRule[]>;
  sitemaps: string[];
  hasGroups: boolean;
}

export function parseRobots(text: string): RobotsRules {
  const groups: Record<string, RobotsRule[]> = {};
  const sitemaps: string[] = [];
  let currentAgents: string[] = [];
  let lastLineWasRule = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      // A User-agent line after a rule starts a fresh group; consecutive
      // User-agent lines share the rules that follow them.
      if (lastLineWasRule) {
        currentAgents = [];
        lastLineWasRule = false;
      }
      const ua = value.toLowerCase();
      currentAgents.push(ua);
      groups[ua] ??= [];
      continue;
    }

    if (field === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }

    if (field === 'allow' || field === 'disallow') {
      lastLineWasRule = true;
      if (currentAgents.length === 0) continue;
      // An empty Disallow/Allow value imposes no restriction.
      if (value === '') continue;
      const rule = makeRule(field === 'allow', value);
      for (const ua of currentAgents) {
        (groups[ua] ??= []).push(rule);
      }
    }
    // Other directives (crawl-delay, host, ...) are ignored and do not end a group.
  }

  return { groups, sitemaps, hasGroups: Object.keys(groups).length > 0 };
}

export function isPathAllowed(rules: RobotsRules, path: string, userAgent = '*'): boolean {
  const group = selectGroup(rules, userAgent);
  if (!group || group.length === 0) return true;

  let best: RobotsRule | undefined;
  for (const rule of group) {
    if (!rule.regex.test(path)) continue;
    const moreSpecific = !best || rule.length > best.length;
    const tieBrokenByAllow = best !== undefined && rule.length === best.length && rule.allow && !best.allow;
    if (moreSpecific || tieBrokenByAllow) best = rule;
  }

  return best ? best.allow : true;
}

// The request path robots.txt matches against: path + query string.
export function requestPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname || '/'}${parsed.search}`;
  } catch {
    return '/';
  }
}

function selectGroup(rules: RobotsRules, userAgent: string): RobotsRule[] | undefined {
  const ua = userAgent.toLowerCase();
  return rules.groups[ua] ?? rules.groups['*'];
}

function makeRule(allow: boolean, pattern: string): RobotsRule {
  return { allow, pattern, length: pattern.length, regex: patternToRegex(pattern) };
}

function patternToRegex(pattern: string): RegExp {
  let body = pattern;
  let anchorEnd = false;
  if (body.endsWith('$')) {
    anchorEnd = true;
    body = body.slice(0, -1);
  }
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${anchorEnd ? '$' : ''}`);
}
