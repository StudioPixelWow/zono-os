# PHASE MAI-1 — Market Acceptance Intelligence™ Foundation

**Status:** ✅ Complete · foundation only · scoped `tsc` clean · `eslint` 0 errors · committed (`511ffc6`).

This phase builds the evidence-capture layer for Market Acceptance Intelligence. It **observes** the lifecycle of every external listing and records history. It makes **no** market inference — no Likely-Sold, no Acceptance Score, no confidence model, no valuation/AI/heatmap/decision-brain/recommendation wiring. Those are later phases. Everything here is evidence, never assumption.

## Core principle

A listing that vanishes from a scan is **never** marked "sold". It is marked `DISAPPEARED` (an observation), with a timestamped event. If it comes back, a `RETURNED` event is appended and `times_returned` increments. History is append-only and is never overwritten.

## 1. Files created

- `supabase/migrations/20260790120000_market_listing_lifecycle.sql` — the two tables + indexes + RLS.
- `src/lib/market-acceptance/types.ts` — pure, client-safe types: `ListingLifecycleState` (`ACTIVE | DISAPPEARED | RETURNED | LIKELY_SOLD | LIKELY_REMOVED | UNKNOWN`), `ListingEventType` (10 types), row interfaces, reconcile-result.
- `src/lib/market-acceptance/service.ts` — server-only `reconcileListingLifecycle(orgId, opts)`, the evidence reconciler.
- `src/lib/market-acceptance/index.ts` — re-exports.

## 2. Files modified

- `src/lib/external-listings/service.ts` — imports `reconcileListingLifecycle` and calls it best-effort at the end of **both** sync paths: `syncOrg` (cron / monolithic, passing `seenSince = syncStart` and the completed cities) and `finishSyncJob` (chunked "סנכרן עכשיו", passing the job's `started_at` and scanned cities). Wrapped in try/catch — it can never break a sync.

## 3. Migration added

`market_listing_lifecycle` — one row per `(organization_id, provider, external_id)` (unique). Holds current observed state, last-known snapshot (price, status, images, coordinates, address, city, neighborhood), `first_seen_at` / `last_seen_at` / `last_scan_at`, `days_on_market` (observed elapsed days — not a sale claim), and `times_seen` / `times_disappeared` / `times_returned`.

`market_listing_events` — append-only timeline. Each row: `organization_id`, `provider`, `external_id`, `lifecycle_id`, `event_type`, `previous_value`, `new_value`, `confidence` (1.0 = directly observed), `metadata`, `created_at`.

Both org-scoped with RLS: org members can `SELECT` their own rows; all writes go through the service-role reconciler (RLS-bypassing but explicitly org-filtered, matching the orchestrator pattern). **No new TypeScript Database type needed** — access uses `as never` casts (consistent with `orchestrator/events.ts`).

## 4. Lifecycle diagram

```
                       first observed in a scan
                                 │
                                 ▼
   ┌───────────────────────── ACTIVE ─────────────────────────┐
   │  (seen again → update snapshot; PRICE / IMAGE /           │
   │   DESCRIPTION / STATUS_CHANGED events as applicable)      │
   │                                                           │
   │  city re-scanned but listing NOT returned                 │
   │                                 │                         │
   │                                 ▼                         │
   │                           DISAPPEARED ───── seen again ───┘
   │                          (times_disappeared++)   │
   │                                                  ▼
   │                                              RETURNED ──► settles to
   │                                          (times_returned++)   ACTIVE
   │                                                              on next scan
   └───────────────────────────────────────────────────────────┘

   LIKELY_SOLD · LIKELY_REMOVED · UNKNOWN  →  reserved for later inference
                                              phases; NEVER set in MAI-1.
```

Evidence rule: `DISAPPEARED` is asserted **only** for a listing whose city was actually re-scanned this run and which was not returned — so listings in cities not covered by a given sync are never falsely marked missing.

## 5. Timeline example

A 3-room flat in קריית ביאליק, first scraped on day 0, price drops on day 9, disappears on day 21, returns on day 30:

```
day 0   FIRST_SEEN            new={price: 1,650,000, status: active, city: קריית ביאליק}   conf 1.0
day 9   PRICE_CHANGED         prev={price: 1,650,000}  new={price: 1,590,000}              conf 1.0
day 21  DISAPPEARED           prev={state: ACTIVE}     new={state: DISAPPEARED}            conf 1.0
day 30  RETURNED              prev={state: DISAPPEARED} new={state: ACTIVE, price: 1,590,000} conf 1.0
```

Lifecycle row after day 30: `current_state=ACTIVE`, `times_seen` incremented each scan it appeared, `times_disappeared=1`, `times_returned=1`, `days_on_market≈30`, last-known snapshot = the day-30 values. The four event rows above are immutable and never rewritten — the full history is preserved.

## 6. QA report

| Check | Result | How it's satisfied |
|---|---|---|
| New listing creates a lifecycle row | ✅ | unseen `(org, provider, external_id)` → INSERT + `FIRST_SEEN` |
| Existing listing updates | ✅ | seen again → snapshot refresh, `last_seen_at`/`last_scan_at`/`days_on_market`/`times_seen` updated |
| Missing listing becomes DISAPPEARED | ✅ | ACTIVE row in a scanned city, not seen → `DISAPPEARED` event + state + `times_disappeared++` |
| Returned listing becomes RETURNED | ✅ | gone-state row seen again → `RETURNED` event + `times_returned++`, settles to ACTIVE |
| Timeline preserved / immutable | ✅ | events are INSERT-only; the reconciler never updates or deletes event rows |
| No duplicate lifecycle rows | ✅ | `unique (organization_id, provider, external_id)` + conflict-keyed upsert |
| Events append correctly | ✅ | batched inserts; `lifecycle_id` back-filled for brand-new rows |
| No fake data | ✅ | only real provider fields are recorded; coordinates only when real; nulls stay null; no sale inference |
| Idempotent | ✅ | re-running with no real change appends no events (already-ACTIVE seen rows and already-DISAPPEARED rows produce nothing) |
| scoped tsc | ✅ | 0 errors |
| eslint | ✅ | 0 errors |

## Acceptance criteria

✅ Every imported listing has a lifecycle · ✅ Every scan extends history · ✅ Every disappearance recorded · ✅ Every return recorded · ✅ Timeline immutable · ✅ No assumptions made · ✅ scoped tsc passes · ✅ eslint 0 errors.

## Supabase handover

Run `supabase/migrations/20260790120000_market_listing_lifecycle.sql` (creates the two tables + indexes + read RLS). No data backfill is required — the first sync after deploy begins recording `FIRST_SEEN` for the org's current active listings, and history accrues from there. Nothing else is wired yet by design.

## What is intentionally NOT here (future phases)

Likely-Sold inference, Acceptance Score, confidence modeling, `REAPPEARED_WITH_NEW_ID` / `LIKELY_DUPLICATE` / `MANUAL_OVERRIDE` event production, and any connection to Valuation, AI, Heatmap, Decision Brain, or Recommendations. The schema reserves the states/columns those will use; this phase only fills the evidence they will read.
