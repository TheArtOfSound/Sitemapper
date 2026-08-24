/** Unique Sitemapper insight layer — path lattice, freshness decay, structural proof. */

export type Severity = 'error' | 'warning' | 'notice';
export type Issue = { severity: Severity; code: string; message: string; evidence?: string };
export type Scores = {
  index: number;
  seo: number;
  sitemap: number;
  /** Missing/true preserves legacy scored results; false means crawl evidence was insufficient. */
  available?: boolean;
};

export function scoresAvailable(scores: Scores): boolean {
  return scores.available !== false;
}

export type LatticeNode = {
  segment: string;
  path: string;
  count: number;
  depth: number;
  children: LatticeNode[];
};

export type FreshnessBucket = {
  key: string;
  label: string;
  count: number;
};

export type SectionStat = {
  section: string;
  count: number;
  deepChecked: number;
  errors: number;
  warnings: number;
  withLastmod: number;
  share: number;
};

export type TypeStat = {
  type: string;
  count: number;
  share: number;
};

export type Insights = {
  fingerprint: string;
  structuralSignature: string;
  lattice: LatticeNode;
  latticeDepth: number;
  latticeBreadth: number;
  leafPaths: number;
  freshness: FreshnessBucket[];
  freshnessCoverage: number;
  sections: SectionStat[];
  types: TypeStat[];
  imbalance: number;
  orphanRoots: number;
  maxSectionShare: number;
  proof: string[];
};

type PageLike = {
  url: string;
  path: string;
  type: string;
  section: string;
  deepChecked: boolean;
  lastmod?: string;
  issues: Issue[];
};

export function buildInsights(
  site: string,
  pages: PageLike[],
  source: { sitemapUrls: string[]; discoveredUrlCount: number; deepCheckedCount: number; compatibility: string },
  scores: Scores
): Insights {
  const lattice = buildLattice(pages.map((p) => p.path));
  const { depth, breadth, leaves } = measureLattice(lattice);
  const freshness = freshnessBuckets(pages);
  const withLastmod = pages.filter((p) => p.lastmod).length;
  const freshnessCoverage = pages.length ? Math.round((withLastmod / pages.length) * 100) : 0;
  const sections = sectionStats(pages);
  const types = typeStats(pages);
  const maxSectionShare = sections[0]?.share ?? 0;
  const imbalance = Math.round(maxSectionShare * 100);
  const orphanRoots = sections.filter((s) => s.count === 1).length;

  const structuralSignature = [
    `d${depth}`,
    `b${breadth}`,
    `u${pages.length}`,
    `s${sections.length}`,
    `t${types.map((t) => t.type[0] + t.count).join('')}`,
    `f${freshnessCoverage}`,
  ].join('.');

  const scoreFingerprintParts = scoresAvailable(scores)
    ? [scores.index, scores.seo, scores.sitemap]
    : ['not-scored'];
  const fingerprintInput = [
    site,
    structuralSignature,
    ...scoreFingerprintParts,
    source.discoveredUrlCount,
    source.deepCheckedCount,
    source.sitemapUrls.join('|'),
  ].join('::');
  const fingerprint = shortHash(fingerprintInput);

  const proof: string[] = [
    scoresAvailable(scores)
      ? `Run fingerprint ${fingerprint} is derived from host, structural signature, scores, and discovered sitemap set.`
      : `Run fingerprint ${fingerprint} is derived from host, structural signature, a Not scored marker, and discovered sitemap set.`,
    `Path lattice: depth ${depth}, breadth ${breadth}, ${leaves} leaf paths across ${pages.length} inventory URLs.`,
    `Freshness coverage: ${freshnessCoverage}% of inventory URLs carry lastmod (${withLastmod}/${pages.length}).`,
    `Section imbalance: top section holds ${imbalance}% of inventory${sections[0] ? ` (${sections[0].section})` : ''}.`,
    `Compatibility: ${source.compatibility}`,
  ];

  if (orphanRoots > 0) {
    proof.push(`${orphanRoots} single-URL root sections — possible thin clusters or incomplete sitemap coverage.`);
  }

  return {
    fingerprint,
    structuralSignature,
    lattice,
    latticeDepth: depth,
    latticeBreadth: breadth,
    leafPaths: leaves,
    freshness,
    freshnessCoverage,
    sections,
    types,
    imbalance,
    orphanRoots,
    maxSectionShare,
    proof,
  };
}

export function buildLattice(paths: string[]): LatticeNode {
  const root: LatticeNode = { segment: '/', path: '/', count: 0, depth: 0, children: [] };
  for (const raw of paths) {
    const parts = raw.split('/').filter(Boolean);
    let node = root;
    node.count += 1;
    let acc = '';
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      acc += `/${seg}`;
      let child = node.children.find((c) => c.segment === seg);
      if (!child) {
        child = { segment: seg, path: acc, count: 0, depth: i + 1, children: [] };
        node.children.push(child);
      }
      child.count += 1;
      node = child;
    }
  }
  sortLattice(root);
  return root;
}

function sortLattice(node: LatticeNode): void {
  node.children.sort((a, b) => b.count - a.count || a.segment.localeCompare(b.segment));
  for (const child of node.children) sortLattice(child);
}

function measureLattice(root: LatticeNode): { depth: number; breadth: number; leaves: number } {
  let depth = 0;
  let breadth = root.children.length;
  let leaves = 0;
  const walk = (node: LatticeNode) => {
    depth = Math.max(depth, node.depth);
    breadth = Math.max(breadth, node.children.length);
    if (!node.children.length && node.depth > 0) leaves += 1;
    for (const child of node.children) walk(child);
  };
  walk(root);
  if (root.count > 0 && root.children.length === 0) leaves = 1;
  return { depth, breadth, leaves };
}

function freshnessBuckets(pages: PageLike[]): FreshnessBucket[] {
  const now = Date.now();
  const buckets: FreshnessBucket[] = [
    { key: '7d', label: '0–7 days', count: 0 },
    { key: '30d', label: '8–30 days', count: 0 },
    { key: '90d', label: '31–90 days', count: 0 },
    { key: '365d', label: '91–365 days', count: 0 },
    { key: 'stale', label: '> 1 year', count: 0 },
    { key: 'missing', label: 'No lastmod', count: 0 },
    { key: 'invalid', label: 'Invalid lastmod', count: 0 },
  ];
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b])) as Record<string, FreshnessBucket>;

  for (const page of pages) {
    if (!page.lastmod) {
      byKey.missing.count += 1;
      continue;
    }
    const t = Date.parse(page.lastmod);
    if (Number.isNaN(t)) {
      byKey.invalid.count += 1;
      continue;
    }
    const age = now - t;
    const day = 86400000;
    if (age <= 7 * day) byKey['7d'].count += 1;
    else if (age <= 30 * day) byKey['30d'].count += 1;
    else if (age <= 90 * day) byKey['90d'].count += 1;
    else if (age <= 365 * day) byKey['365d'].count += 1;
    else byKey.stale.count += 1;
  }
  return buckets;
}

function sectionStats(pages: PageLike[]): SectionStat[] {
  const map = new Map<string, SectionStat>();
  for (const page of pages) {
    const key = page.section || 'home';
    let row = map.get(key);
    if (!row) {
      row = { section: key, count: 0, deepChecked: 0, errors: 0, warnings: 0, withLastmod: 0, share: 0 };
      map.set(key, row);
    }
    row.count += 1;
    if (page.deepChecked) row.deepChecked += 1;
    if (page.lastmod) row.withLastmod += 1;
    row.errors += page.issues.filter((i) => i.severity === 'error').length;
    row.warnings += page.issues.filter((i) => i.severity === 'warning').length;
  }
  const total = Math.max(pages.length, 1);
  return [...map.values()]
    .map((row) => ({ ...row, share: row.count / total }))
    .sort((a, b) => b.count - a.count || a.section.localeCompare(b.section));
}

function typeStats(pages: PageLike[]): TypeStat[] {
  const map = new Map<string, number>();
  for (const page of pages) map.set(page.type, (map.get(page.type) || 0) + 1);
  const total = Math.max(pages.length, 1);
  return [...map.entries()]
    .map(([type, count]) => ({ type, count, share: count / total }))
    .sort((a, b) => b.count - a.count);
}

/** FNV-1a 32-bit → base36 short fingerprint (no crypto needed in Worker). */
export function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `sp_${(h >>> 0).toString(36)}`;
}

export function flattenLattice(node: LatticeNode, limit = 40): Array<{ path: string; count: number; depth: number }> {
  const out: Array<{ path: string; count: number; depth: number }> = [];
  const walk = (n: LatticeNode) => {
    if (n.depth > 0) out.push({ path: n.path, count: n.count, depth: n.depth });
    for (const c of n.children) walk(c);
  };
  walk(node);
  return out.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)).slice(0, limit);
}

export function recommendations(result: {
  source: { discoveredUrlCount: number; discoveredFromRobots: boolean };
  scores?: Scores;
  stats: { errors: number; warnings: number };
  insights: Insights;
  issues: Issue[];
  pages: PageLike[];
}): Array<{ priority: number; title: string; why: string; proof: string }> {
  const recs: Array<{ priority: number; title: string; why: string; proof: string }> = [];
  const codes = new Map<string, number>();
  for (const issue of [...result.issues, ...result.pages.flatMap((p) => p.issues)]) {
    codes.set(issue.code, (codes.get(issue.code) || 0) + 1);
  }

  if (result.scores && !scoresAvailable(result.scores)) {
    return [
      {
        priority: 3,
        title: 'Retry and verify sitemap availability',
        why: 'This run did not collect enough sitemap inventory evidence to support a scored diagnosis.',
        proof: codes.has('SCAN_INCONCLUSIVE')
          ? 'SCAN_INCONCLUSIVE — no sitemap outage is asserted from this run.'
          : 'No sitemap inventory evidence was collected; scores are Not scored.',
      },
    ];
  }

  if (result.source.discoveredUrlCount === 0) {
    recs.push({
      priority: 1,
      title: 'Publish a fetchable XML sitemap',
      why: 'Crawlers and Sitemapper could not inventory public URLs from robots.txt or common sitemap paths.',
      proof: 'NO_ACCESSIBLE_SITEMAP / empty entry set on this run.',
    });
  }
  if (!result.source.discoveredFromRobots && result.source.discoveredUrlCount > 0) {
    recs.push({
      priority: 2,
      title: 'Add Sitemap: directives to robots.txt',
      why: 'Discovery fell back to guessed paths. Explicit robots Sitemap lines improve crawl reliability.',
      proof: 'discoveredFromRobots = false on this run.',
    });
  }
  if ((codes.get('ROBOTS_DISALLOWED_IN_SITEMAP') || 0) > 0) {
    recs.push({
      priority: 1,
      title: 'Resolve robots ↔ sitemap conflicts',
      why: 'URLs are advertised in the sitemap but blocked by robots.txt — wasted crawl budget and mixed signals.',
      proof: `${codes.get('ROBOTS_DISALLOWED_IN_SITEMAP')} ROBOTS_DISALLOWED_IN_SITEMAP issue(s).`,
    });
  }
  if ((codes.get('NOINDEX_IN_SITEMAP') || 0) > 0) {
    recs.push({
      priority: 1,
      title: 'Remove noindex pages from the sitemap',
      why: 'Sitemap should only list indexable URLs.',
      proof: `${codes.get('NOINDEX_IN_SITEMAP')} NOINDEX_IN_SITEMAP issue(s).`,
    });
  }
  if (result.insights.freshnessCoverage < 40 && result.source.discoveredUrlCount > 5) {
    recs.push({
      priority: 2,
      title: 'Emit lastmod on sitemap entries',
      why: 'Low freshness coverage weakens change signals for crawlers.',
      proof: `Freshness coverage ${result.insights.freshnessCoverage}% (structural signature ${result.insights.structuralSignature}).`,
    });
  }
  if (result.insights.imbalance >= 70 && result.insights.sections.length > 2) {
    recs.push({
      priority: 3,
      title: 'Review section imbalance',
      why: 'One path segment dominates the inventory — either intentional focus or missing clusters elsewhere.',
      proof: `Top section share ${result.insights.imbalance}% · lattice depth ${result.insights.latticeDepth}.`,
    });
  }
  if ((codes.get('MISSING_TITLE') || 0) + (codes.get('MISSING_META_DESCRIPTION') || 0) > 0) {
    recs.push({
      priority: 2,
      title: 'Fill missing titles and meta descriptions on deep-checked pages',
      why: 'Sampled pages show incomplete SERP metadata.',
      proof: `MISSING_TITLE=${codes.get('MISSING_TITLE') || 0}, MISSING_META_DESCRIPTION=${codes.get('MISSING_META_DESCRIPTION') || 0}.`,
    });
  }
  if (result.source.discoveredUrlCount > 0 && result.source.discoveredUrlCount < 5) {
    recs.push({
      priority: 1,
      title: 'Expand thin sitemap inventory',
      why: 'Only a handful of URLs are advertised — confirm this matches the real public site.',
      proof: `discoveredUrlCount = ${result.source.discoveredUrlCount}.`,
    });
  }
  if (!recs.length) {
    recs.push({
      priority: 3,
      title: 'Keep monitoring structural signature',
      why: 'No critical sitemap conflicts in this sample. Re-run after publishes to catch drift.',
      proof: `Fingerprint ${result.insights.fingerprint} · signature ${result.insights.structuralSignature}.`,
    });
  }
  return recs.sort((a, b) => a.priority - b.priority).slice(0, 8);
}
