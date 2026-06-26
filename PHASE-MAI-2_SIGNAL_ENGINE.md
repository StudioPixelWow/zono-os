# PHASE MAI-2 — Market Acceptance Intelligence™ Signal Engine

**Status:** ✅ Complete · evidence layer only · scoped `tsc` clean · `eslint` 0 errors · committed (`051e9a6`).

The Signal Engine turns each listing's observed lifecycle + event history into independent, explainable **signals**. It computes **no** scores — no Likely-Sold, no Acceptance Score, no probability, no recommendation, no AI/valuation/heatmap impact. Every signal is a fact with provenance and confidence; a missing input is stored as `null` with reduced confidence and is **never** invented.

## 1. Files created

- `supabase/migrations/20260791120000_market_listing_signals.sql` — the `market_listing_signals` table + indexes + read RLS.
- `src/lib/market-acceptance/signals.ts` — **pure** `computeListingSignals(input, now)`: the 27-signal calculator + the `SignalInput` shape.
- `src/lib/market-acceptance/repository.ts` — **server-only** data access: `gatherSignalData(orgId)`, `getPreviousSignals(orgId)`, `upsertSignalRows(rows)`.
- `src/lib/market-acceptance/qa.ts` — **pure** `validateSignalSet(set)` (structure + confidence bounds + no-NaN fabrication guard).

## 2. Files modified

- `src/lib/market-acceptance/types.ts` — added `Signal`, `SignalSet`, `ListingSignalsRow`, `SIGNAL_NAMES`, `SIGNAL_VERSION` (`mai-2.0`), `SignalRecomputeResult`.
- `src/lib/market-acceptance/service.ts` — added the `recalculateListingSignals(orgId)` orchestrator (reads → pure compute → upsert; retains prior snapshot under `metadata.previous`).
- `src/lib/market-acceptance/index.ts` — exports the new engine surface.
- `src/lib/external-listings/service.ts` — calls `recalculateListingSignals(orgId)` right after the lifecycle reconcile in **both** sync paths (`syncOrg` cron + `finishSyncJob` chunked), best-effort.

## 3. Migration

`market_listing_signals` — one row per `(organization_id, provider, external_id)` (unique, no duplicate rows). Columns: `lifecycle_id`, `signal_version`, `last_calculated_at`, `signals jsonb` (name → `{ value, source, lastUpdated, confidence }`), `confidence_inputs jsonb` (explainability), `metadata jsonb` (holds `previous` snapshot for comparison), timestamps. Org-scoped, RLS read for org members, service-role writes. No new TypeScript Database type needed (uses `as never` casts, consistent with the orchestrator).

## 4. Every calculated signal (27)

| # | Signal | What it observes | Source | Confidence rule |
|---|---|---|---|---|
| 1 | DaysOnMarket | observed days since first seen | lifecycle | 1.0 if known |
| 2 | ListingAge | days since first_seen_at | lifecycle | 1.0 if first_seen known |
| 3 | FirstSeenDaysAgo | days since first observation | lifecycle | 1.0 if known |
| 4 | LastSeenDaysAgo | days since last observation | lifecycle | 1.0 if known |
| 5 | TimesSeen | scans that returned it | lifecycle | 1.0 |
| 6 | TimesDisappeared | times it went missing | lifecycle | 1.0 |
| 7 | TimesReturned | times it came back | lifecycle | 1.0 |
| 8 | ReturnedAfterDisappear | boolean: returned ≥ once | lifecycle | 1.0 |
| 9 | StillActive | boolean: state = ACTIVE | lifecycle | 1.0 |
| 10 | CurrentlyMissing | boolean: in a gone state | lifecycle | 1.0 |
| 11 | CurrentState | the observed state string | lifecycle | 1.0 |
| 12 | CurrentPrice | live external_listings price | external_listings | 1.0 if a live row matched, else 0 |
| 13 | LastKnownPrice | last observed price | lifecycle | 1.0 if known |
| 14 | PriceChangesCount | count of PRICE_CHANGED events | events | 1.0 |
| 15 | AveragePriceReduction | mean of observed reductions | events | 1.0 if ≥1 drop, else 0 |
| 16 | LargestPriceReduction | biggest observed reduction | events | 1.0 if ≥1 drop, else 0 |
| 17 | PriceMomentum | net signed change (last − first) | events | 1.0 if ≥2 price points, else 0 |
| 18 | ImageChanges | count of IMAGE_CHANGED events | events | 1.0 |
| 19 | DescriptionChanges | count of DESCRIPTION_CHANGED events | events | 1.0 |
| 20 | StatusChanges | count of STATUS_CHANGED events | events | 1.0 |
| 21 | DuplicateConfidence | max suspected-dup score | external_listing_duplicates | 1.0 if dup data, else 0 |
| 22 | ProviderCount | distinct providers for this property | external_listing_duplicates | 1.0 if dup data, else 0.5 (own provider only) |
| 23 | NeighborhoodActivity | active listings in the neighborhood | external_listings | 1.0 if neighborhood known |
| 24 | AreaSupply | active listings in the city | external_listings | 1.0 if city known |
| 25 | AreaDemand | active buyers for the city | buyers | **0 (null)** — not wired in MAI-2; honest placeholder |
| 26 | RecentOfficialDealsNearby | official deals in city (180d) | property_transactions | 1.0 if transactions read succeeded, else 0 |
| 27 | TransactionNearby | boolean: ≥1 recent official deal | property_transactions | 1.0 if transactions available, else 0 |

Example emitted signal:
```json
{ "name": "DaysOnMarket", "value": 43, "source": "market_listing_lifecycle", "lastUpdated": "2026-06-26T…Z", "confidence": 1.0 }
```

## 5. Signal calculation flow

```
external sync completes
        │
        ▼
reconcileListingLifecycle(org)      (MAI-1 — updates lifecycle + appends events)
        │
        ▼
recalculateListingSignals(org)      (MAI-2)
        │
        ├─ gatherSignalData(org): lifecycle rows · signal events (grouped) ·
        │     live external_listings (current price + id maps + city/neighborhood
        │     active counts) · suspected duplicates (confidence + cross-provider
        │     partners) · official deals per city (180d window, guarded)
        │
        ├─ getPreviousSignals(org): prior snapshot per listing (for comparison)
        │
        ├─ for each lifecycle row:
        │     build SignalInput (lifecycle + per-listing events + live + area + txn)
        │     → computeListingSignals(input)  [PURE]  → SignalSet + confidenceInputs
        │
        └─ upsertSignalRows(...)  → market_listing_signals
              (conflict-keyed; metadata.previous = prior snapshot; signal_version mai-2.0)
```

Transactions/duplicates reads are guarded: a failure degrades the affected signals to `null`/`confidence 0` and never aborts the recompute or the sync.

## 6. QA report

| Check | Result | How |
|---|---|---|
| New listing → signals created | ✅ | first lifecycle row → upsert into market_listing_signals (FIRST_SEEN already exists) |
| Price change → signals updated | ✅ | new PRICE_CHANGED event feeds PriceChangesCount / Avg / Largest / Momentum on next recompute |
| Listing disappeared → signals updated | ✅ | lifecycle state flips → StillActive=false, CurrentlyMissing=true, CurrentState reflects it |
| Listing returned → signals updated | ✅ | RETURNED event + times_returned → ReturnedAfterDisappear=true, StillActive=true |
| Timeline preserved | ✅ | the engine only READS events; MAI-1's append-only timeline is never touched |
| No duplicate signal rows | ✅ | unique `(org, provider, external_id)` + conflict-keyed upsert |
| No fake values | ✅ | missing inputs → `null` + reduced confidence; no NaN (qa.ts fabrication guard); no invented prices/areas/deals |
| Every signal records source | ✅ | each `Signal.source` set (lifecycle / events / external_listings / duplicates / buyers / property_transactions) |
| Every signal records confidence | ✅ | each `Signal.confidence` in [0,1]; 1.0 = directly observed |
| No score / AI / valuation / heatmap | ✅ | engine emits facts only; none of those are computed or imported |
| scoped tsc | ✅ | 0 errors |
| eslint | ✅ | 0 errors |

## Acceptance criteria

✅ Every lifecycle row has calculated signals · ✅ Signals use only real observed data · ✅ Every signal records its source · ✅ Every signal records confidence · ✅ No score yet · ✅ No AI interpretation · ✅ No valuation integration · ✅ No heatmap integration · ✅ No fake data · ✅ scoped tsc passes · ✅ eslint 0 errors.

## Supabase handover

Run `supabase/migrations/20260791120000_market_listing_signals.sql`. After deploy, the next sync recomputes signals for the org's lifecycle rows automatically (it runs right after the MAI-1 lifecycle reconcile). No backfill needed.

## Notes for later phases

`AreaDemand` is the one intentionally-unwired signal (value `null`, confidence `0`, source `buyers`) — wiring a real buyer-demand source is a future task, and the schema already reserves it. `RecentOfficialDealsNearby` / `TransactionNearby` use coarse **city-level** proximity (not geo radius) — accurate as far as it claims, and a later phase can tighten it. The retained `metadata.previous` snapshot gives the eventual Acceptance Score phase a ready before/after to reason over without a separate history table.
