# Sitemapper Demo QA Log

Audit started: 2026-08-22 (America/Phoenix)

Production URL: https://sitemapper.oortstack.com

Authoritative repository: `/Users/bry/Projects/01 Active Apps/sitemap`

Starting branch: `main`

Starting commit: `ce994bb031bbc3c5e7e5daf3ffc1a7463fc26c22`

Starting deployment: `d4ce9290-f5b3-4086-908f-2d290d74c477`

Current QA deployment: `735fae44-4e9a-4ebb-8698-df9517a001ce`

Current automated verification: typecheck passed; 120 tests passed; 1 opt-in live test skipped; `git diff --check` passed.

Current public production proof: report `/r/65rygf9nbd` completed with 1,200 sitemap URLs inventoried, 40 live pages checked, and 0 errors. Legacy report `/r/yzf8ad6pz7` now renders as `Inconclusive` and `Not scored`, with no monitor-baseline CTA or false publish-sitemap recommendation.

Current scheduled production proof: the 15:15 UTC cron created `job_f704...` exactly once; it completed with `error = NULL` and wrote exactly one 1,361-URL snapshot, `snap_3bef...`. Issue lifecycle and terminal monitor bookkeeping completed. That run also exposed the separate false-recovery regression in QA-027, so the monitor remains `regression` pending the next real clean crawl.

Repository note: The authoritative checkout was already five commits ahead of `origin/main` and substantially dirty when this QA session began. Existing work is being preserved and reviewed before any overlapping edit.

## QA-001

Status:
DEPLOYED / VERIFIED IN PRODUCTION

Screen:
Background monitoring / Portfolio

Issue:
Scheduled crawls fail when a previously resolved issue appears again.

Type:
Functional

Severity:
CRITICAL

User impact:
Monitoring performs the expensive scan, writes duplicate snapshots, then reports the job as failed. A user can receive stale status, repeated change noise, and unnecessary quota usage instead of one trustworthy result.

Observed:
Production job `job_818ad9643a7a4200b4585b5e055b1394` wrote four snapshots between 12:46:03Z and 12:46:53Z, then failed with `UNIQUE constraint failed: issues.project_id, issues.code`. The same one-job/four-snapshot pattern recurs across scheduled jobs.

Expected:
One scheduled job should produce one snapshot, reconcile recurring issues, finish once, and acknowledge the queue message.

Root cause:
`upsertIssues` looks up only unresolved issue rows. The schema permits only one row per `(project_id, code)`, so reappearance after resolution attempts a duplicate insert and fails. Queue retry then re-runs the full scan because completed work is not yet acknowledged.

Action:
Deployed an issue upsert that reopens the existing `(project_id, code)` row, preserves its identity and first-seen time, increments occurrence count, and still resolves issues absent from the next conclusive snapshot.

Files changed:
`worker/saas/persist.ts`, `worker/saas/persist.test.ts`

Verification:
SQLite-backed recurrence and mixed-lifecycle tests pass. The 15:15 UTC cron created `job_f704...` exactly once; it reached `complete` with `error = NULL` and wrote exactly one snapshot, `snap_3bef...`, with 1,361 declared URLs. No recurrence collision or queue retry occurred.

Video impact:
This lifecycle blocker is closed. Authenticated monitoring footage remains blocked by the visual gate and QA-027's current false `regression` state.

## QA-002

Status:
DEPLOYED / VERIFIED IN PRODUCTION

Screen:
Site Overview / Issues

Issue:
Recovered sitemap issues remain visibly open after the sitemap returns.

Type:
Functional / State consistency

Severity:
HIGH

User impact:
The application can tell a user that an old sitemap outage is still active even after later snapshots again contain 1,361 URLs.

Observed:
The production issue rows `SITEMAPS_FOUND_BUT_UNUSABLE`, `ROBOTS_NO_USABLE_SITEMAP_REFERENCE`, and `DISCOVERY_NOTE` remained unresolved with last-seen times from the zero-URL period, while later snapshots returned to 1,361 declared URLs.

Expected:
Issues absent from a successful later snapshot should resolve; if they recur, the existing issue should reopen without breaking the crawl.

Root cause:
Same reconciliation failure as QA-001 prevents the issue lifecycle update from completing after recovery.

Action:
Deployed with QA-001: a conclusive snapshot now reopens present issues and resolves absent issues in the same reconciliation.

Files changed:
`worker/saas/persist.ts`, `worker/saas/persist.test.ts`

Verification:
Mixed reopen/preserve/resolve lifecycle coverage passes. The 15:15 UTC crawl completed issue reconciliation against the 1,361-URL result without a uniqueness failure; production issue lifecycle state is current. No manual database mutation was used.

Video impact:
The issue-lifecycle gate is closed; the incident/recovery shot still requires authenticated visual review and QA-027 cleanup.

## QA-003

Status:
DEPLOYED / VERIFIED

Screen:
Public Home

Issue:
The homepage labels processed sitemap inventory as “URLs indexed.”

Type:
Copy / Credibility

Severity:
HIGH

User impact:
“Indexed” can be read as Google index coverage, contradicting the product’s truthful rule that Google index state is unknown until Search Console is connected.

Observed:
The live homepage reported `79,132 URLs indexed` while the same product states that HTTP 200 and sitemap presence do not prove indexing.

Expected:
Use an evidence-bound label such as `URLs inventoried` or `URLs mapped`.

Action:
Replaced index-state language with sitemap-inventory language throughout the public results and export surfaces.

Files changed:
`worker/render.ts`, `worker/agent-pack.ts`, `worker/insights.ts`

Verification:
Production report `/r/65rygf9nbd` says `1,200 sitemap URLs found` and distinguishes the 40 live checks. The deployed copy does not claim Google indexing.

Video impact:
The verified public result is safe to record on this point.

## QA-004

Status:
DEPLOYED / VERIFIED IN PRODUCTION

Screen:
Public Home hero

Issue:
The live homepage embeds the previous rejected demo above the new product promise.

Type:
Visual / Product positioning

Severity:
MEDIUM

User impact:
The first visual impression is a 42.8-second silent WeSearch crawl in the old dark interface, which weakens the current change-intelligence positioning and looks like a raw browser walkthrough.

Observed:
`/brand/hero.mp4` is 1920×1080, 60 fps, 42.83 seconds, video-only, and tells a free-scan/WeSearch story rather than the real oortstack incident.

Expected:
The live hero should use the final verified professional edit or a restrained still derived from it.

Action:
Replaced the old free-scan walkthrough with the final edited oortstack incident story after the demo path and exports passed QA.

Files changed:
None in the live product for this QA item. Final original cards and overlays are staged under `video-project/assets` and `video-project/overlays`; the production hero is intentionally unchanged until the master passes final QA.

Verification:
The master, web, and short exports decode cleanly at 1920×1080/60 fps. The web export is deployed as `/brand/hero.mp4`; the production homepage references it and the local and live asset hashes match.

Video impact:
Existing hero footage will not be reused as the main story.

## QA-005

Status:
DEPLOYED / VERIFIED

Screen:
Public Home

Issue:
“The subscription is the incident” is confusing and does not describe the product behavior.

Type:
Copy

Severity:
LOW

User impact:
The phrase makes the paid plan sound like the problem instead of explaining that monitoring turns changes into actionable incidents.

Observed:
The heading appears immediately above copy describing recurring monitoring and grouped alerts.

Expected:
A direct operational heading that explains continuous monitoring or actionable alerts.

Action:
Replaced the phrase with direct monitoring and incident language tied to consecutive crawl evidence.

Files changed:
`worker/render.ts`

Verification:
Deployed production copy reviewed on version `551abf40-078e-4713-92e3-760c6ddadec0`; the confusing phrase is absent.

Video impact:
No remaining blocker for this copy.

## QA-006

Status:
DEPLOYED / VERIFIED

Screen:
Pricing

Issue:
The Free plan’s daily-check/history language conflicts with surrounding copy that says paid monitoring begins on Builder.

Type:
Copy / Plan boundary

Severity:
MEDIUM

User impact:
A prospective customer cannot confidently tell whether Free includes recurring production monitoring and retained history.

Observed:
Pricing says Free includes daily checks and 14-day history, while homepage language says Builder and up re-run monitoring without the user’s laptop.

Expected:
One consistent, entitlement-backed plan description.

Action:
Confirmed the server-backed plan limits and aligned public and authenticated plan copy: Free is one site, 2,000 monitored URLs, daily checks, 14-day history, no alerts or CI; Builder is five sites, 10,000 monitored URLs, daily checks, 90-day history, email alerts, and CI.

Files changed:
`worker/render.ts`, `worker/saas/html.ts`

Verification:
Typecheck and the full test suite pass; the production pricing/about copy now states the same boundary as the authenticated product copy.

Video impact:
Pricing is not part of the primary incident edit.

## QA-007

Status:
DEFERRED

Screen:
Incident evidence for oortstack.com

Issue:
The monitored site’s public `robots.txt` points its Host and Sitemap directives to `http://127.0.0.1:4101`.

Type:
External production configuration

Severity:
HIGH

User impact:
Crawlers and monitoring can receive an unusable sitemap reference, which is consistent with the real outage evidence.

Observed:
The live public file at `https://oortstack.com/robots.txt` contains localhost directives; the live sitemap itself currently returns 1,361 URLs.

Expected:
Production crawler directives should use the public origin.

Action:
DEFERRED. This belongs to the monitored Oortstack application, not the Sitemapper repository, and changing its production routing/DNS configuration during video work would exceed the safe scope.

Files changed:
None

Verification:
Public read-only check only

Video impact:
Do not imply Sitemapper fixed the monitored site. Present only what Sitemapper detected and the real later state.

## QA-008

Status:
DEPLOYED / VERIFIED IN PRODUCTION

Screen:
Portfolio / Site Overview incident rows

Issue:
Incident cards do not pass the persisted before/after evidence into the business-impact formatter.

Type:
Functional / Copy

Severity:
HIGH

User impact:
A critical sitemap collapse can be summarized as `Sitemap URLs ? → ?` on the product’s highest-level incident surfaces even though the database contains the exact 1,361 and 0 values.

Observed:
Dashboard and site-overview queries omit `before_json` and `after_json`; the shared impact formatter therefore receives no values for `SITEMAP_URL_COUNT_DROP`.

Expected:
The incident card should visibly and truthfully say `Sitemap URLs 1,361 → 0`.

Action:
Deployed event evidence fields through the read model and impact formatter so the historical incident can render the persisted 1,361 → 0 values.

Files changed:
`worker/saas/app.ts`, `worker/saas/html.ts`, `src/diff/impact.ts`, `src/diff/impact.test.ts`, `worker/saas/html.test.ts`

Verification:
Formatting and incident-detail tests pass, including comma-formatted 1,361 → 0 evidence. Authenticated production navigation verified the exact `Sitemap URLs 1,361 → 0` headline on the overview and detail route with no sensitive material exposed.

Video impact:
The hero shot remains gated on the authenticated visual check, not on implementation or automated coverage.

## QA-009

Status:
DEPLOYED / VERIFIED IN PRODUCTION

Screen:
Site Overview / Changes

Issue:
The important historical incident is buried beneath routine info events and has no dedicated evidence/action view.

Type:
UX / Information hierarchy

Severity:
HIGH

User impact:
A user must hunt through a long raw change table to answer what changed, why it matters, and what to do next. The overview’s 30-row window can contain only routine lastmod events and omit the critical incident entirely.

Observed:
Both views sort all change events strictly by time. Repeated info-level lastmod rows and high-volume canonical events can displace the critical 1,361 → 0 event. Incident rows link back to the same generic table rather than to preserved evidence.

Expected:
Priority incidents should remain discoverable, and clicking one should show its exact before/after evidence, business-risk label, and a bounded recommended action.

Action:
Deployed separate priority/recent incident lists plus a dedicated persisted-event detail route containing before/after evidence, bounded risk language, recommended investigation, and the later trusted state. No synthetic event data was added.

Files changed:
`worker/saas/app.ts`, `worker/saas/html.ts`, `worker/saas/html.test.ts`, `src/diff/impact.ts`

Verification:
Routing, escaping, prioritization, and incident-detail markup are covered by the passing suite. Natural authenticated navigation passed Portfolio → Sites → oortstack.com → canonical incident → history → Portfolio in production.

Video impact:
The implementation gate is closed; recording remains blocked only on the authenticated Portfolio → Site → Incident visual/navigation check.

## QA-010

Status:
DEPLOYED / VERIFIED IN PRODUCTION

Screen:
Background scheduler

Issue:
The scheduler can enqueue a newly generated job ID even when `INSERT OR IGNORE` did not create that job row.

Type:
Functional / Race safety

Severity:
HIGH

User impact:
Concurrent or repeated scheduler delivery can send an orphan queue message, run work without a matching job record, and produce state that cannot be tracked correctly.

Observed:
`handleScheduled` ignores the insert result, then always updates monitor state and sends the fresh random `jobId`.

Expected:
Only a successfully inserted scheduled job may update the monitor to queued and be sent to the crawl queue.

Action:
Deployed a narrow `meta.changes` guard so only a newly inserted crawl job can advance the monitor and enter the queue. No schedule or customer setting was changed.

Files changed:
`worker/saas/jobs.ts`, `worker/saas/jobs.test.ts`

Verification:
Tests prove an ignored insert sends no message and performs no monitor update, while a successful insert queues exactly once. Production cron at 15:15 UTC created and processed `job_f704...` exactly once, with one terminal job row and one snapshot.

Video impact:
Not directly visible, but required for a trustworthy monitoring claim.

## QA-011

Status:
DEPLOYED / VERIFIED IN PRODUCTION

Screen:
Portfolio

Issue:
Historical critical events force the current overall status to remain `Critical` for seven days after a successful recovery.

Type:
Functional / State consistency

Severity:
HIGH

User impact:
The portfolio can describe a healthy latest crawl as an open critical incident because site health mixes current monitor status with a rolling count of historical events.

Observed:
The dashboard supplies a seven-day critical-event count to `siteHealth`, and `siteHealth` returns `critical` whenever that count is non-zero, even when the monitor's latest status is `ok`.

Expected:
Current site health should follow the latest monitor result. Historical incidents should remain discoverable in the incident timeline without being mislabeled as still open.

Action:
Deployed current-health logic that follows the latest trusted monitor result while retaining historical critical incidents in the incident timeline.

Files changed:
`src/diff/impact.ts`, `src/diff/impact.test.ts`, `worker/saas/app.ts`, `worker/saas/html.ts`

Verification:
Regression tests pass for a recovered monitor with historical critical events. Production SQL and the authenticated Portfolio both report the latest oortstack monitor state as healthy while retaining the recorded historical incident.

Video impact:
The Portfolio opener remains gated on the authenticated visual check and current scheduled state.

## QA-012

Status:
DEPLOYED / VERIFIED

Screen:
Public scanner progress

Issue:
The real production scan can substantially exceed the advertised `Typical time 8–40s`, while its remaining-time estimate moves backward.

Type:
Functional / Progress feedback

Severity:
HIGH

User impact:
A user sees a disabled form and a spinner without a trustworthy completion estimate. The product can appear stalled even while work continues.

Observed:
A production scan of `https://oortstack.com` showed about 43 seconds left after 7 seconds, about 80 seconds left after 13 seconds, and about 149 seconds left after 70 seconds. At 70 seconds it still showed `Walking sitemap index · 0 files · 0 URLs`; the console remained clean.

Expected:
The scan should either complete within the stated range or present a bounded, honest progress message that does not imply a shortening ETA while the estimate grows.

Action:
Removed the growing ETA, added bounded discovery-only work for anonymous scans, made progress name the sitemap being checked, and changed timeout language to an honest inconclusive result.

Files changed:
`worker/index.ts`, `worker/index.test.ts`, `worker/render.ts`, `src/security/ssrf.ts`, `src/security/ssrf.test.ts`

Verification:
Production scan `/r/65rygf9nbd` completed with truthful staged progress, 1,200 sitemap URLs, 40 live checks, and 0 errors. Typecheck and focused/full automated tests pass.

Video impact:
Capture only the short truthful progress state, then cut to the real completed report as planned.

## QA-013

Status:
DEPLOYED / VERIFIED

Screen:
Public scan results

Issue:
The production scanner reported zero accessible sitemap URLs for a sitemap that was publicly available with 1,361 entries at the same time.

Type:
Functional / False negative

Severity:
CRITICAL

User impact:
The scanner can issue a P1 `Publish a fetchable XML sitemap` recommendation against a healthy, fetchable sitemap. This undermines the product's core evidence contract and can send users toward the wrong fix.

Observed:
Production report `/r/yzf8ad6pz7` recorded `The operation was aborted` for robots.txt and every sitemap candidate, then concluded `0 sitemap URLs found`. An immediate independent fetch of `https://oortstack.com/sitemap.xml` returned HTTP 200 XML with 1,361 `<loc>` entries.

Expected:
A fetchable 200 XML sitemap should be inventoried, or any infrastructure timeout should be labeled as an inconclusive scan rather than proof that no sitemap exists.

Action:
Added bounded DNS validation, lazy candidate discovery, and explicit inconclusive classification for timeout-only discovery; also enabled strictly public global fetch routing for Cloudflare same-zone/Tunnel origins.

Files changed:
`src/security/ssrf.ts`, `src/security/ssrf.test.ts`, `worker/index.ts`, `worker/index.test.ts`, `wrangler.jsonc`

Verification:
The production rerun `/r/65rygf9nbd` successfully inventoried 1,200 sitemap URLs and live-checked 40 pages with 0 errors. The former all-abort path is covered by inconclusive-classification tests.

Video impact:
The false report remains excluded as incident evidence. It may be used only to verify the repaired legacy-inconclusive presentation; the successful production report is the valid public-scan footage source.

## QA-014

Status:
DEPLOYED / VERIFIED

Screen:
Public report scores

Issue:
An evidence-empty report can display high numeric scores.

Type:
Functional / Credibility

Severity:
HIGH

User impact:
A report that says no sitemap could be loaded and contains zero pages can simultaneously show Index 90, SEO 83, and Sitemap 90. The scores imply measured quality where the scan collected no page evidence.

Observed:
Blocked report `/r/yzf8ad6pz7` showed 0 sitemap URLs, 0 live checks, a P1 missing-sitemap diagnosis, and 90/83/90 scores.

Expected:
Inconclusive or evidence-empty scans should show `Not scored` rather than derived numeric scores.

Action:
Made score availability explicit and normalized legacy evidence-empty reports so report, metadata, insights, and all agent-pack exports render `Not scored` without leaking stale numeric scores.

Files changed:
`worker/render.ts`, `worker/render.test.ts`, `worker/store.ts`, `worker/store.test.ts`, `worker/agent-pack.ts`, `worker/insights.ts`

Verification:
Legacy production report `/r/yzf8ad6pz7` now renders `Inconclusive` and `Not scored`; report/export tests verify stale 90/83/90 values do not leak.

Video impact:
Public report footage is unblocked on score integrity; the legacy report may be shown only as an inconclusive-state QA example.

## QA-015

Status:
DEPLOYED / VERIFIED IN PRODUCTION

Screen:
Background monitoring / Change detection

Issue:
An all-timeout scan can be persisted as a legitimate zero-URL snapshot and manufacture a critical URL-drop event.

Type:
Functional / Evidence integrity

Severity:
CRITICAL

User impact:
A transient scanner/origin timeout can look identical to a real sitemap collapse, generating false critical incidents, alerts, and stale issue state.

Observed:
The anonymous scanner converts all-abort discovery into a normal zero-URL result. The scheduled path uses the same analyzer and currently persists whatever result it returns. Historical 1,361 → 0 records therefore prove what Sitemapper observed, but do not by themselves prove the site's sitemap content actually became empty.

Expected:
An all-timeout/inconclusive crawl must not become a comparison snapshot. The job should retry or fail without changing the last trusted baseline.

Action:
Deployed explicit inconclusive/unavailable classification plus a hard scheduled-crawl guard before R2 or D1 snapshot persistence. Zero sitemap inventory is rejected even if separately probed pages responded.

Files changed:
`worker/index.ts`, `worker/index.test.ts`, `worker/saas/jobs.ts`, `worker/saas/jobs.test.ts`

Verification:
Tests prove timeout-only and zero-inventory results throw `SCAN_INCONCLUSIVE` before any snapshot write. The 15:15 UTC production crawl persisted one conclusive snapshot with 1,361 declared URLs and no zero-inventory artifact. Its separate false recovery comparison is tracked in QA-027.

Video impact:
The final narration/text must say `Sitemapper observed 1,361 → 0` or `lost access to 1,361 sitemap URLs`, not claim a verified site-side deletion or traffic impact.

## QA-016

Status:
DEPLOYED / VERIFIED BY SQL AND TESTS

Screen:
Portfolio / Site Overview / Changes / History

Issue:
Read models include snapshots and change events produced by failed crawl jobs.

Type:
Functional / State consistency

Severity:
HIGH

User impact:
Retry artifacts from a job that never completed can become the latest visible snapshot, duplicate change rows, or displace a trusted completed crawl.

Observed:
Snapshot and change queries select only by project/time and do not join `crawl_jobs.status`. QA-001 proved failed retries had already written snapshots before the lifecycle error.

Expected:
Monitoring views should use anonymous/baseline snapshots with no job ID and snapshots/events whose crawl job reached `complete`; failed or running work should remain operational evidence, not customer-facing state.

Action:
Deployed the trusted-state rule across Portfolio, Site Overview, incident detail, Changes, and History: anonymous/baseline snapshots remain eligible, and job-backed rows require `crawl_jobs.status = 'complete'`.

Files changed:
`worker/saas/app.ts`, `worker/saas/html.ts`, `worker/saas/html.test.ts`

Verification:
Production SQL showed 221 raw versus 17 trusted snapshots and 418 raw versus 9 trusted events for oortstack.com; the completed 1,361 → 0 event remains eligible while failed-job artifacts are excluded. Query review, typecheck, and the current 120-test suite pass.

Video impact:
Functional trust filtering is verified; authenticated history still remains part of the final visual/navigation gate.

## QA-017

Status:
DEPLOYED / VERIFIED IN PRODUCTION

Screen:
Portfolio / Monitor status

Issue:
A failed queue crawl leaves the monitor status stuck at `queued` and does not advance its finished timestamp.

Type:
Functional / State consistency

Severity:
HIGH

User impact:
The product can look indefinitely in progress even after the underlying job exhausted retries and is marked failed.

Observed:
The oortstack.com monitor currently reports `last_status = queued` with a stale `last_finished_at`, while its latest scheduled crawl job is definitively `failed`. The queue catch path updates only `crawl_jobs`.

Expected:
On terminal delivery failure, both the job and monitor should record `failed` and a finished timestamp; a later successful job should replace that status with `ok` or `regression`.

Action:
Deployed terminal failure handling that updates both the job and monitor to `failed` with a finished timestamp before retrying. A later success can replace the monitor status normally.

Files changed:
`worker/saas/jobs.ts`, `worker/saas/jobs.test.ts`

Verification:
Queue tests prove both records are updated and the failed analysis is retried. The 15:15 UTC production run left both job and monitor in fresh terminal states; `job_f704...` is `complete`, and the monitor is `regression` rather than stale `queued`. The regression value is a separate false-recovery defect tracked in QA-027.

Video impact:
The stale-queue blocker is closed. Portfolio recording still waits for QA-027 to return the monitor to a real clean state.

## QA-018

Status:
DEPLOYED / VERIFIED

Screen:
Public report / Monitor this site

Issue:
An inconclusive, evidence-empty report can still be saved as a monitoring baseline.

Type:
Functional / Evidence integrity

Severity:
CRITICAL

User impact:
If a timeout-only zero result becomes the first baseline, later healthy scans can be framed as a massive addition instead of recovery from an invalid measurement.

Observed:
The report always renders `Keep this as a baseline`, and `/app/sites/new` accepts a saved report without checking whether its scores/evidence were marked unavailable.

Expected:
Inconclusive reports should direct the user to retry and must be rejected as baselines on the server.

Action:
Deployed both controls: unavailable reports show retry guidance instead of the monitoring CTA, and the server rejects an attempted baseline save with HTTP 409.

Files changed:
`worker/render.ts`, `worker/render.test.ts`, `worker/store.ts`, `worker/store.test.ts`, `worker/saas/app.ts`

Verification:
Legacy production report `/r/yzf8ad6pz7` shows no monitor CTA and no false baseline invitation. The server guard and legacy normalization pass automated tests.

Video impact:
The successful production report is safe for the final report shot; inconclusive-state footage must show retry guidance only.

## QA-019

Status:
DEPLOYED / VERIFIED

Screen:
Public Home / Alert copy

Issue:
Several marketing lines present an unverified outcome and timing as if they were product evidence.

Type:
Copy / Credibility

Severity:
MEDIUM

User impact:
Claims such as discovering a problem only after `a traffic drop three weeks later` and catching changes before they cost revenue blur deterministic crawl evidence with business outcomes Sitemapper does not measure.

Observed:
The homepage headline/lede/card and webhook footer use traffic/customer/revenue outcomes without connected analytics evidence or a sourced timing basis.

Expected:
Describe what the product actually does: preserve consecutive crawl evidence, group changes, identify likely risk, and show where to investigate.

Action:
Replaced unsupported outcome/timing language with evidence-bound copy about sitemap inventory, live signals, grouped changes, likely risk, and where to investigate.

Files changed:
`worker/render.ts`, `worker/saas/html.ts`, `worker/saas/jobs.ts`

Verification:
Production copy on version `551abf40-078e-4713-92e3-760c6ddadec0` was reviewed; the public scan and report use inventory/check language and make no traffic, ranking, revenue, or causation claim.

Video impact:
The official close remains `See what changed. Keep the evidence.` and all final visible copy must retain the incident checkpoint boundary below.

## QA-020

Status:
DEPLOYED / VERIFIED BY SQL AND TESTS

Screen:
CI guard / Public API

Issue:
The CI guard and API read models still select failed-job snapshots/events even after the primary UI is filtered to trusted state.

Type:
Functional / State consistency

Severity:
HIGH

User impact:
CI can silently compare retry artifacts, while API consumers can receive a latest snapshot or change stream that the dashboard correctly rejects. Different product surfaces can disagree about the same site.

Observed:
Production has 221 raw snapshots but only 17 trusted snapshots, and 418 raw events but only 9 trusted events for oortstack.com. The CI guard selects the latest two raw snapshots; API routes return raw failed events/latest failed snapshot.

Expected:
All decision and read surfaces should use the same trusted-state rule: `job_id IS NULL` or related crawl job status `complete`.

Action:
Deployed the same trusted-snapshot join in the CI guard and public API snapshot/change reads.

Files changed:
`worker/saas/app.ts`, `worker/saas/api.ts`, `worker/saas/api.test.ts`

Verification:
SQL inspection confirms `(s.job_id IS NULL OR j.status = 'complete')` in CI and API decision reads. Focused API assertions, typecheck, and the complete 120-test suite pass.

Video impact:
Not a separate visual shot; the product now uses one trusted-state rule across UI, CI, and API.

## QA-021

Status:
DEPLOYED / VERIFIED BY TESTS

Screen:
Background monitoring / Snapshot persistence

Issue:
Blocked or challenge-like sitemap responses could yield zero inventory without an abort and still be accepted as a trusted scheduled snapshot.

Type:
Functional / Evidence integrity

Severity:
CRITICAL

Action:
The scheduled path now rejects every zero-inventory result before persistence, even when separately probed pages responded or stale numeric scores are present.

Files changed:
`worker/saas/jobs.ts`, `worker/saas/jobs.test.ts`

Verification:
Regression coverage proves zero inventory throws `SCAN_INCONCLUSIVE` before any R2 or D1 snapshot write. The next scheduled production run remains covered by the QA-015 live gate.

Video impact:
The recorded historical incident remains a real Sitemapper observation, not proof of an origin-side deletion.

## QA-022

Status:
DEPLOYED / VERIFIED BY SQL AND TESTS

Screen:
Change detection / Snapshot lineage

Issue:
A new successful crawl could diff against a newer failed-job artifact instead of the latest trusted snapshot.

Type:
Functional / Evidence lineage

Severity:
CRITICAL

Action:
Snapshot persistence now selects its comparison predecessor with the same trusted-state rule used by product reads.

Files changed:
`worker/saas/persist.ts`, `worker/saas/persist.test.ts`

Verification:
The SQLite-backed test places a newer failed snapshot after a completed one, then proves the new event records the completed snapshot as `previous_snapshot_id`. Production SQL separately confirms failed artifacts exist and are excluded.

Video impact:
Future incident comparisons preserve trustworthy lineage instead of inheriting retry noise.

## QA-023

Status:
DEPLOYED / VERIFIED BY TESTS

Screen:
Background queue / Post-commit bookkeeping

Issue:
A notification, usage, or monitor bookkeeping failure after a crawl committed could demote the completed job and retry the entire crawl.

Type:
Functional / Idempotency

Severity:
CRITICAL

Action:
The crawl commit remains authoritative; independent post-commit effects are attempted and logged without demoting the job or retrying persisted work.

Files changed:
`worker/saas/jobs.ts`, `worker/saas/jobs.test.ts`

Verification:
The queue regression test proves one snapshot write, `complete` job status, continued independent side effects, one acknowledgement, zero retries, and structured logging for the failed post-commit step.

Video impact:
Supports the one-crawl/one-result monitoring claim without adding a visible shot.

## QA-024

Status:
DEPLOYED / VERIFIED IN PRODUCTION

Screen:
Public scanner / Cloudflare network path

Issue:
Worker fetches to a same-zone origin behind Cloudflare Tunnel could follow internal routing behavior and abort even though the public sitemap was reachable externally.

Type:
Functional / Production networking

Severity:
CRITICAL

Action:
Enabled Cloudflare's `global_fetch_strictly_public` compatibility flag while retaining SSRF/DNS validation and request time bounds.

Files changed:
`wrangler.jsonc`, `src/security/ssrf.ts`, `src/security/ssrf.test.ts`, `worker/index.ts`

Verification:
Production report `/r/65rygf9nbd` completed through the deployed Worker with 1,200 sitemap URLs inventoried, 40 live pages checked, and 0 errors.

Video impact:
The successful public production report is eligible for final footage.

## QA-025

Status:
DEPLOYED / VERIFIED IN PRODUCTION

Screen:
Legacy public report / Exports

Issue:
Previously stored zero-evidence reports could continue to expose a false missing-sitemap diagnosis, stale scores, monitoring CTA, and diagnosis-bearing exports after scanner logic was fixed.

Type:
Functional / Legacy data normalization

Severity:
HIGH

Action:
Normalize legacy evidence availability on load/save and propagate the unavailable state through report copy, insights, metadata, and agent-pack exports.

Files changed:
`worker/store.ts`, `worker/store.test.ts`, `worker/render.ts`, `worker/render.test.ts`, `worker/agent-pack.ts`, `worker/insights.ts`, `worker/saas/app.ts`

Verification:
Production report `/r/yzf8ad6pz7` now shows `Inconclusive` and `Not scored`, with no monitor CTA and no false publish-sitemap recommendation. Export tests prove stale numeric scores and the false diagnosis do not leak.

Video impact:
Legacy evidence cannot silently contradict the truthful public scan story.

## QA-026

Status:
DEPLOYED / VERIFIED IN PRODUCTION

Screen:
Public scanner / Critical journeys

Issue:
Guessed common paths such as checkout, cart, pricing, or login could be probed even when absent from the sitemap, creating false critical journey issues and contaminating sitemap counts.

Type:
Functional / Evidence scope

Severity:
HIGH

Action:
Prioritize critical journeys only when declared by the sitemap, and keep any explicitly non-sitemap probe out of sitemap source and indexable counts.

Files changed:
`worker/index.ts`, `worker/index.test.ts`, `worker/render.ts`, `worker/saas/persist.ts`, `worker/saas/persist.test.ts`

Verification:
Tests prove an undeclared guessed cart URL is not requested and non-sitemap probes do not alter inventory counts. Final production scan `/r/65rygf9nbd` completed with 0 errors.

Video impact:
Final scan footage reflects only observed sitemap inventory and declared critical journeys.

## QA-027

Status:
DEPLOYED / VERIFIED IN PRODUCTION

Screen:
Background monitoring / Recovery comparison / Alerts

Issue:
The first clean crawl after the legacy zero snapshot was compared to that invalid zero baseline, manufacturing a recovery regression and an operator alert.

Type:
Functional / Evidence lineage / Alert integrity

Severity:
CRITICAL

User impact:
A healthy 1,361-URL crawl can set the monitor to `regression`, show fresh false change events, and send an operator email even though the new crawl itself is clean.

Observed:
The 15:15 UTC job `job_f704...` completed once and persisted `snap_3bef...` with 1,361 declared URLs, but selected legacy zero snapshot `snap_242...` as its predecessor. That comparison generated four false `SITEMAP_DISAPPEARED` events plus `URL_ADDED`, set the monitor to `regression`, and sent one operator email.

Expected:
Only positive-inventory trusted snapshots may be comparison predecessors or current read-model state. Legacy attempted sitemap candidates with recorded unusable evidence must not become `SITEMAP_DISAPPEARED` events, and false legacy-lineage events must not surface in UI, API, or CI decisions.

Root cause:
The earlier trusted-state rule excluded failed jobs but still treated a legacy completed zero-inventory snapshot as a valid predecessor. The legacy snapshot also retained attempted candidate URLs in `sitemapUrls`, so the diff treated their later absence as four sitemap removals.

Action:
Deployed positive-inventory predecessor selection, legacy unusable-candidate filtering in the diff, evidence preservation through guard conversion, and `previous_snapshot.declared_urls > 0` visibility gates across application and API/CI reads. Existing production rows were preserved; the sent email cannot be recalled and the monitor was not manually rewritten.

Files changed:
`worker/saas/persist.ts`, `worker/saas/persist.test.ts`, `src/diff/diff.ts`, `src/diff/diff.test.ts`, `src/guard.ts`, `worker/saas/app.ts`, `worker/saas/api.ts`, `worker/saas/api.test.ts`

Verification:
The correction first shipped in version `735fae44-4e9a-4ebb-8698-df9517a001ce` and is included in current production version `d2080baa-5d4d-4174-bab7-bd765f3124f2`. Subsequent scheduled oortstack crawls repeatedly completed with 1,361 declared URLs and positive 1,361-URL predecessors; the monitor is `ok`; post-fix oortstack events are only informational `LASTMOD_CHANGED`; and post-fix oortstack alert deliveries are zero. Final verification: 139 tests passed, one opt-in live test skipped, TypeScript checks passed, and `git diff --check` passed.

Video impact:
The scheduler gate is clear. The already sent legacy-lineage email remains historical evidence and is not presented as a valid incident alert.

## REAL INCIDENT EVIDENCE CHECKPOINT

Status:
VERIFIED

Site:
oortstack.com

Verified facts:

- Production Sitemapper recorded `SITEMAP_URL_COUNT_DROP` as `critical`.
- Before: `1,361`.
- After: `0`.
- Grouped removed URLs: `1,361`.
- The event belongs to a crawl job that reached `complete`; it is not one of the later failed retry artifacts.
- The zero-URL snapshot recorded sitemap responses that looked blocked or challenged and yielded no usable XML entries. It did not record an all-abort timeout.
- Later production snapshots again recorded `1,361` declared URLs.

Claims intentionally excluded:

- Revenue saved.
- Traffic saved.
- Rankings preserved.
- Exact recovery duration as a product promise.
- Deployment causation.
- Customer damage avoided.
- A verified origin-side deletion of 1,361 URLs; the evidence proves Sitemapper lost access to them during that scan.

## FINAL DEMO PATH VERIFICATION

Functional:
PASS

Console:
PASS — no Sitemapper application errors; only unrelated installed-extension warnings in the operator Chrome profile

Visual:
PASS

Navigation:
PASS

Copy:
PASS

Sensitive data review:
PASS

Ready for final recording:
YES

## QA-028

Status:
DEPLOYED / VERIFIED IN PRODUCTION

Screen:
Portfolio / What changed today

Issue:
One crawl could fill the dashboard timeline with many identical per-URL change rows, hiding other change types from the same day.

Type:
UX / Information hierarchy

Severity:
HIGH

User impact:
The dashboard looked noisy and made the user scan repeated labels instead of understanding the breadth of current changes.

Observed:
The authenticated production dashboard rendered repeated `CANONICAL CHANGED` rows from one wesearch.press crawl.

Expected:
One same-scan row per site and change type, with a short, bounded daily timeline.

Action:
Collapse identical site, change-code, and timestamp rows; cap the dashboard timeline at eight distinct entries while retaining the full changes view.

Files changed:
`worker/saas/html.ts`, `worker/saas/app.ts`, `worker/saas/html.test.ts`

Verification:
139 tests passed with one opt-in live test skipped. The authenticated production Portfolio now renders five distinct current change rows instead of repeated same-scan canonical rows; the full Changes destination remains available.

Video impact:
Keeps the live portfolio understandable without editing around current production data.

## QA-029

Status:
DEPLOYED / VERIFIED IN PRODUCTION

Screen:
Public header / authenticated app chrome / browser and device icons

Issue:
Sitemapper still used a generic letter `S` in product chrome and a mismatched photographic JPEG as its favicon.

Type:
Visual / Brand consistency

Severity:
POLISH

User impact:
The main site and app felt less distinctive and the browser identity did not match the current product UI.

Observed:
Public and app navigation rendered a text `S`; favicon and Apple icon both referenced `/brand/mark.jpg`.

Expected:
A distinctive Sitemapper graph mark and correctly sized PNG platform icons derived from the same brand master.

Action:
Generate a new five-node S-shaped sitemap mark, clean disconnected raster artifacts, derive production icon sizes, and wire the generated mark into public and authenticated chrome.

Files changed:
`worker/render.ts`, `worker/render.test.ts`, `public/brand/logo-mark.png`, `public/brand/favicon-32.png`, `public/brand/icon-192.png`, `public/brand/icon-512.png`, `public/brand/apple-touch-icon.png`, `brand-kit/logos/sitemapper-imagegen-master.png`, `brand-kit/logos/sitemapper-generated-mark-master.png`

Verification:
The generated master was inspected at full resolution, disconnected specks were removed, and transparent and device-icon derivatives were visually checked. Production serves all PNGs with HTTP 200 and the correct MIME type; public and app chrome each render `/brand/logo-mark.png`; favicon and Apple icon references use the new files.

Video impact:
The landing page, app shell, favicon, and demo identity now share one recognisable symbol.

## QA-030

Status:
DEPLOYED / VERIFIED IN PRODUCTION

Screen:
oortstack.com overview / Priority incidents

Issue:
The site overview did not apply the portfolio's related-incident collapse rule, so three historical sitemap collapses and their matching URL-removal rows appeared as six priority incidents.

Type:
UX / State consistency

Severity:
HIGH

User impact:
One recurring evidence pattern looked like six independent priority problems, weakening comprehension and confidence in incident counts.

Observed:
The production oortstack.com overview rendered six critical rows and described `URL REMOVED` as the last incident even though the canonical evidence is `Sitemap URLs 1,361 → 0`.

Expected:
The overview should show one canonical sitemap-collapse row, link to its evidence, and use the same headline in the page summary.

Action:
Reuse the related-incident collapse rule before rendering the site priority card and selecting its last-incident summary.

Files changed:
`worker/saas/html.ts`, `worker/saas/html.test.ts`

Verification:
The regression test proves a URL-removal companion plus repeated historical sitemap collapses render as one canonical incident. Authenticated production now shows `Priority incidents 1`, zero duplicate `URL REMOVED` rows, one `Sitemap URLs 1,361 → 0` link, and the matching detail evidence.

Video impact:
The oortstack hero screen now presents one clear production incident rather than duplicate historical rows.
