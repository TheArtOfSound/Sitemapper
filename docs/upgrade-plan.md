# Sitemapper Reliability Upgrade Plan

Sitemapper should be positioned as a public sitemap and SEO report generator for accessible websites, not as a universal scraper for protected platforms.

## Immediate upgrade goals

1. Clear compatibility language
   - Works on public sites with accessible robots.txt, sitemap.xml, and fetchable HTML.
   - Large protected platforms may block server-side analysis.

2. Better input handling
   - Accept a normal site URL.
   - Accept a direct sitemap URL.
   - Try `www` and non-`www` alternates when the first host fails.
   - Show which exact URL was tested.

3. Better failure reasons
   - No sitemap found.
   - robots.txt unreachable.
   - sitemap fetch failed.
   - sitemap XML parse failed.
   - bot protection likely detected.
   - page fetch timeout.
   - no HTML returned.
   - too many redirects.
   - wrong subdomain/host mismatch.

4. Better public report
   - Executive summary.
   - Compatibility verdict.
   - Discovered sitemap tree.
   - Page-type breakdown.
   - Issue counts by severity.
   - Priority recommendations.
   - Page-level task table.
   - Print/save-as-PDF layout.

5. Better UI behavior
   - No silent button failure.
   - Form fallback to report URL.
   - Visible loading state.
   - Direct API/report links.
   - Explain that GitHub Pages is docs/demo and Cloudflare Worker is the real app.

## Later upgrade goals

1. KV-backed run counter.
2. Optional D1 database for stored reports.
3. Report share URLs.
4. CSV export from Worker.
5. Robots.txt rule conflict detection.
6. Canonical target validation.
7. Hreflang detection.
8. OpenGraph/Twitter metadata checks.
9. Schema.org detection.
10. Lighthouse/PageSpeed integration only if externally configured.
