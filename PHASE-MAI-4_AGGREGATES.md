# PHASE MAI-4 — Market Acceptance Aggregates Engine

**Status:** ✅ Complete · deterministic · scoped `tsc` clean · `eslint` 0 errors · QA **8/8 pass** · committed (`c0531fc`).

Rolls the listing-level Market Acceptance Intelligence (MAI-1 lifecycle, MAI-2 signals, MAI-3 confidence) up into **market-level** metrics by organization / city / neighborhood / property_type / rooms / price-bucket, across 7/14/30/60/90-day windows. Cautious and evidence-based: small samples are flagged, never overstated. It **never** claims an official sale — `LIKELY_ACCEPTED ≠ sold`, and it uses "likely market exit / likely accepted / likely rejected / market absorption" language only. No valuation / heatmap / decision-brain / AI / UI wiring.

## 1. Files created

- `supabase/migrations/20260793120000_market_acceptance_aggregates.sql` — the table + a **NULLS NOT DISTINCT** segment/window unique index + read RLS.
- `src/lib/market-acceptance/aggregates.ts` — **pure** `computeMarketAcceptanceAggregates(records, now)` + `priceBucket()` + types.

## 2. Files modified

- `src/lib/market-acceptance/types.ts` — added `AggregateRecomputeSummary`.
- `src/lib/market-acceptance/repository.ts` — added `gatherAggregateData(orgId)` (joins scores + lifecycle + signals + external_listings) + `upsertAggregateRows`.
- `src/lib/market-acceptance/service.ts` — added `calculateMarketAcceptanceAggregatesForOrganization(orgId)`.
- `src/lib/market-acceptance/qa.ts` — added `runAggregateQa()` (the 8 spec scenarios).
- `src/lib/market-acceptance/index.ts` — exports the new surface.
- `src/lib/external-listings/service.ts` — calls the aggregator **after** MAI-3 in both sync paths.

## 3. Migration

`market_acceptance_aggregates` — every column from the spec (counts, medians/averages, exit/acceptance/rejection rates, `absorption_speed_score`, `sample_size`, `confidence`, `evidence jsonb`, window fields, dims). **Unique index** on `(organization_id, city, neighborhood, property_type, rooms, price_bucket, window_days, window_end)` declared `NULLS NOT DISTINCT` (PG15+) so coarse segments (NULL neighborhood/type/rooms/bucket) dedupe correctly on upsert — otherwise every sync would duplicate them. `window_end` is anchored to the current UTC day, so repeated syncs the same day upsert one row per segment/window (daily history snapshots). Org-scoped, RLS read.

## 4. Aggregate metrics (all 18)

Counts: `active_count`, `disappeared_count`, `likely_exit_count`, `likely_accepted_count`, `likely_rejected_count`, `uncertain_count`, `returned_count`. Distributions: `median/avg_days_on_market`, `avg/median_last_known_price`, `avg/median_price_reduction_pct`. Rates: `market_exit_rate`, `market_acceptance_rate`, `market_rejection_rate` (count ÷ sample). Plus `absorption_speed_score` (0–100, cautious), `sample_size`, `confidence` (0–100), and Hebrew `evidence`.

**Absorption speed** (only when sample ≥ 5, else null): `acceptanceRate×50 + 30×(1 − min(medianDOM,180)/180) + (1−rejectionRate)×20`, clamped 0–100. **Confidence**: `100 × (0.4·sampleFactor + 0.3·avgScoreConfidence + 0.3·completeness)`, capped at 25 when sample < 5 and at 65 when 5–15.

## 5. Segment strategy

5 windows × 5 nested segment levels per window:

1. `city`
2. `city + neighborhood`
3. `city + neighborhood + property_type`
4. `city + neighborhood + property_type + rooms`
5. `city + neighborhood + property_type + rooms + price_bucket`

A listing only contributes to a deeper level when that dimension is non-null (city is required). A listing belongs to a window when its lifecycle `last_scan_at` falls within `[today − N days, today)`, so the windows are cumulative. Price buckets (ILS): `under_1_5m`, `1_5m_2m`, `2m_2_5m`, `2_5m_3m`, `3m_4m`, `4m_plus`.

## 6. Example aggregate output (real QA run)

A strong accepted city segment (18 listings, all disappeared after ~20 days):

```
city=קריית ביאליק  window_days=30
likely_accepted_count=18  sample_size=18  market_acceptance_rate=1.0
absorption_speed_score=97  confidence≈high
evidence:
  • "0 מתוך 18 נכסים יצאו מהשוק ככל הנראה"   (LIKELY_MARKET_EXIT count — distinct from accepted)
  • "זמן חציוני על המדף: 20 ימים"
  • "שיעור דחיית שוק: 0%"
  • "18 נכסים התקבלו ככל הנראה על ידי השוק"
```

A small sample (3 listings): `absorption_speed_score=null`, `confidence=25`, evidence includes "מדגם קטן מדי למסקנה יציבה".

## 7. QA report (deterministic, no DB — `runAggregateQa()`)

| # | Scenario | Result | Detail |
|---|---|---|---|
| 1 | Empty organization | ✅ | rows=0, no crash |
| 2 | Small sample <5 | ✅ | confidence=25, absorption=null |
| 3 | Strong accepted segment | ✅ | acceptanceRate=1.0, absorption=97, positive evidence |
| 4 | Rejected segment | ✅ | rejectionRate=1.0 |
| 5 | Mixed segment | ✅ | confidence capped 65, sample=12 |
| 6 | Multiple windows | ✅ | 7,14,30,60,90 all present |
| 7 | Price buckets | ✅ | every band maps correctly, null→null |
| 8 | Null fields | ✅ | null-safe medians/averages, no fabricated values |

**All 8 pass.** Re-runnable any time via `runAggregateQa()`.

## Integration

`external sync → MAI-1 lifecycle → MAI-2 signals → MAI-3 scores → MAI-4 aggregates`, best-effort, in both `syncOrg` (cron) and `finishSyncJob` (chunked). Service returns `{ totalAggregates, windowsCalculated, segmentsCalculated, lowConfidenceSegments, skippedSmallSamples }`. **Not** wired to valuation, heatmap, decision-brain, AI, or any UI — by design.

## 8. Remaining risks

1. **Segment explosion** — 5 levels × 5 windows can produce many rows for orgs with dense, varied inventory. Upserts are batched (500) and the `NULLS NOT DISTINCT` index keeps them deduped per day; revisit with a row cap or coarser deep levels if a very large org strains write time.
2. **`price_reduction_pct` is approximate** — derived as `AveragePriceReduction / (LastKnownPrice + AveragePriceReduction)` (≈ fraction off original) since MAI keeps average, not cumulative, reductions. Directionally correct; a later phase can refine with full price history.
3. **Window membership is scan-anchored** — a listing must have been re-scanned within the window to count, which correctly excludes long-stale rows but means a city not scanned recently produces no fresh aggregate (inherited, intentional MAI-1 caveat).
4. **Absorption/confidence thresholds are heuristic** — tuned to the 8 spec cases, exposed as named constants; they never assert a sale, so mis-tuning only shifts confidence, never correctness of the no-sale guarantee.

## 9. Production-readiness

**Yes — production-ready.** Pure, deterministic, unit-tested (8/8), cautious with small samples, null-safe, org-scoped + RLS, idempotent (daily upsert, NULLS-NOT-DISTINCT key), and structurally incapable of declaring an official sale. It's intentionally isolated (no downstream consumers), so enabling it only writes the new aggregates table — zero blast radius.

## Supabase handover

Run `supabase/migrations/20260793120000_market_acceptance_aggregates.sql`. Requires PG15+ (for `NULLS NOT DISTINCT`) — Supabase is PG15+. After deploy the next sync computes aggregates automatically (right after MAI-3). No backfill required.
