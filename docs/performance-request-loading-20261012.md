# Genomic CBH performance: request-scoped auth + Task List data loading

## Scope

- P0: Vercel Function Region adjusted separately by the project owner; this commit does not change it.
- P1: React server-render-request `cache()` deduplicates `getActor()` between the Protected Layout and Page, retaining Supabase `getUser()` and the database role/is_active lookup. Proxy authentication and route-handler authorization are unchanged.
- P2: `getTaskListsWorkspace()` loads the active batch and one sample list concurrently; the batch projection reuses that same sample list and maps slots directly by active `runId`. Other batch APIs continue to fetch their own fresh data; `listSamples()` itself is not cached.
- No database schema changes or business-rule changes. No cross-request or cross-user cache.

## Evidence / baseline (read-only investigation)

- Sample tables are small at measurement: 14 samples, 18 runs, 48 plate slots.
- Simple `nipt_samples` query EXPLAIN ANALYZE: approximately 0.156 ms database execution.
- Supabase edge logs, mixed 24-hour observation: nipt REST requests IAD 1,419 at average 435.4 ms origin; SIN 157 at average 211.4 ms origin. These are request-origin times, **not page-load times**, and do not by themselves confirm Vercel runtime region.
- Vercel runtime and per-route duration could not be read from the currently connected account (team authorization 403).

## After-deployment acceptance

1. Ensure the actual Vercel Production deployment is built from the new main SHA and Function Region is `icn1` as configured by owner.
2. Browser DevTools Network: log in, open Dashboard, Patients, Task Lists and navigate back, collecting Document/RSC request TTFB and fully loaded time over at least three warm and cold repetitions. Do not share cookies, tokens, sample IDs, or HARs containing patient data.
3. In Vercel Functions logs/observability, compare route durations, invocations, failures and cold starts for the same time window and similar activity.
4. In Supabase metrics, compare Auth `/user`, `nipt_samples`, `nipt_batch_slots`, `nipt_users` request counts and origin times for comparable traffic. A reduction in duplicate calls is expected, not guaranteed until measured.
5. Verify Admin / Staff navigation, login expiry redirects, Task Lists slots/queue match registry, finalize/unlock and remove sample permissions, and QR/label unaffected.

## Rollback

Revert this commit if the role/active checks or displayed Task Lists become inconsistent; no database rollback required.
