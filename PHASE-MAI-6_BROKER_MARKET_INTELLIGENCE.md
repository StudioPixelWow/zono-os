# PHASE MAI-6 — Broker Market Intelligence™ FOUNDATION

**Status:** ✅ Complete · deterministic · evidence-only · scoped `tsc` clean (0 errors) · `eslint` 0 errors · QA **9/9 pass** · committed (`cc02e97`).

A complete market-**performance** profile for every broker, built ONLY from observed market behaviour (MAI-1 lifecycle → MAI-2 signals → MAI-3 confidence → MAI-4 aggregates → broker attribution on `external_listings`). It **never claims an official sale** — the vocabulary is Likely Market Success / Likely Market Exit / observed market behaviour. No rankings, no AI recommendations, no UI. Persist only.

## 1. Files created

- `supabase/migrations/20260795120000_broker_market_intelligence.sql` — the results table + indexes + RLS.
- `src/lib/broker-market-intelligence/types.ts` — `BrokerListingRecord`, `BrokerMarketProfile`, row + summary types, `BROKER_MARKET_MODEL_VERSION = "mai-6.0"`.
- `src/lib/broker-market-intelligence/engine.ts` — **pure** `computeBrokerMarketProfile` (counts, rates, dominant segment, activity score, performance index, confidence, evidence).
- `src/lib/broker-market-intelligence/explain.ts` — cautious Hebrew summary (observed-behaviour disclaimer, never "מכר/עסקה/סגירה/עמלה").
- `src/lib/broker-market-intelligence/repository.ts` — broker profiles + broker-attributed listing join + upsert (server-only).
- `src/lib/broker-market-intelligence/service.ts` — `calculateBrokerMarketIntelligenceForOrganization()`.
- `src/lib/broker-market-intelligence/qa.ts` — 9 deterministic scenarios.
- `src/lib/broker-market-intelligence/index.ts`.

## 2. Files modified

- `src/lib/external-listings/service.ts` — one additive, best-effort call to `calculateBrokerMarketIntelligenceForOrganization(orgId)` after MAI-4 in **both** sync paths (`syncOrg` + `finishSyncJob`), inside the existing try/catch. Nothing else changed.

## 3. Migration

`broker_market_intelligence` — observed counts (`active_listings`, `likely_market_exit_count`, `likely_market_success_count`, `likely_market_rejected_count`, `returned_listing_count`, `uncertain_listing_count`, `total_observed_listings`, `eligible_listings`); rates (`market_success_rate`, `market_rejection_rate`, `market_exit_rate`); time/price (`median/average_days_on_market`, `median/average_price_reduction_pct`, `average_last_known_price`); dominant segment (`dominant_city/neighborhood/property_type/room_count/price_bucket`); composites (`market_activity_score`, `market_performance_index`, `confidence`); `evidence jsonb`, `metadata jsonb`. **Unique on `(organization_id, broker_id, model_version)`** (re-runs upsert in place). Org-scoped, RLS read via `current_org_id()`; writes are service-role only.

## 4. Calculations (observed evidence only)

- **Counts** are mutually-exclusive by MAI-3 classification: `LIKELY_ACCEPTED → success`, `LIKELY_MARKET_EXIT → exit`, `LIKELY_REJECTED → rejected`, `RETURNED → returned`, `ACTIVE → active`, else `uncertain` (null classification with an ACTIVE lifecycle reads as active).
- **Eligible** = success + exit + rejected (the only listings with an observable market judgment). Rates are `null` when eligible = 0 — never invented.
  - `market_success_rate = success / eligible`, `market_rejection_rate = rejected / eligible`, `market_exit_rate = exit / eligible` (fractions 0..1).
- **Days on market** — median/avg over **resolved** listings (success + exit) when present, else over all listings with an observed DOM.
- **Price reduction** — median/avg over listings that actually reduced (fraction 0..1).
- **Dominant segment** — mode of city / neighborhood / property type / rooms / price-bucket across observed listings (deterministic tie-break: count desc, then key asc). Price bucket reuses MAI-4's `priceBucket()`.
- **Market Activity Score (0..100)** = `min(50, total×5) + min(50, movements×5)`, movements = success+exit+rejected+returned.
- **Market Performance Index (0..100)** — only when eligible > 0: `50 + 45·successRate − 25·rejectionRate ± domBonus` (faster median DOM helps, bounded ±10); `null` otherwise.
- **Confidence (0..100)** = `min(60, total×4)` (sample) + `avgScoreConfidence×30` (evidence quality) + `completeness×10` (share with a classification), clamped 10..99 effectively. Small samples → low confidence by construction.

## 5. Example broker profile (from QA scenario 1)

```
נכסים נצפים                 31
הצלחת שוק אפשרית (נצפתה)     22       ← LIKELY_ACCEPTED observation, NOT a confirmed sale
שיעור הצלחת שוק              71%      (22 / 31 eligible)
חציון ימים בשוק              18
דחיית שוק אפשרית             9
מדד ביצועי שוק               81.7
רמת ביטחון                   97%
"המדדים מבוססים על התנהגות שוק נצפית בלבד ואינם אישור מכירה רשמי."
```

## 6. QA report (deterministic, `runBrokerMarketQa()` — actually run)

| Scenario | Result | Detail |
|---|---|---|
| Broker with many listings → metrics created | ✅ | total 31, success 22, successRate 0.71, conf 97, perf 81.7 |
| Broker with no listings → empty profile | ✅ | total 0, conf 0, all rates/scores null |
| Returned listings → counted correctly | ✅ | returned 2, eligible 1 (returned/active excluded from denominator) |
| Rejected listings → metrics correct | ✅ | rejected 3, rejRate 0.75, avgRed 0.063, perf 45.8 (< 50) |
| Mixed portfolio → dominant neighborhood correct | ✅ | dominant = רחובות צפון (most observed) |
| Low sample → low confidence | ✅ | small 41 < big 97 |
| No broker assigned → ignored safely | ✅ | unattributed listings never reach the engine; empty in → empty profile |
| No fake values (active-only → null) | ✅ | successRate/medRed/avgPrice/perf all null when evidence missing |
| Deterministic (same input → same output) | ✅ | stable |

**All 9 pass.**

## 7. Remaining risks

1. **Broker attribution depends on `external_listings.detected_broker_id`.** Listings the broker-detection layer hasn't matched are ignored safely (not attributed). As detection coverage grows, profiles deepen automatically — no backfill needed.
2. **Reduction% is a proxy** derived from MAI-2's `AveragePriceReduction / (LastKnownPrice + AveragePriceReduction)` — same derivation MAI-4 uses, so it's consistent across the stack but inherits any signal-level noise.
3. **`OFFICIAL_TRANSACTION_FOUND`** is counted as success-leaning evidence but kept out of the "likely" buckets — MAI-3 never produces it yet, so today it contributes nothing. When a real per-listing official match arrives (later phase), success will be evidence-backed; the engine already treats it cautiously.
4. **No UI** — by design. The persisted profile is ready for a future read-only broker surface; this phase does not touch broker cards, widgets, or rankings.

## 8. Production-readiness

**Yes — production-ready.** Additive and non-invasive (one best-effort call after MAI-4; the sync never breaks if it fails), deterministic, unit-tested (9/9), explainable (per-metric evidence + Hebrew), org-scoped + RLS, no AI/LLM, no fake values, and structurally incapable of claiming an official sale. Every broker is profiled (empty profile when no listings), with no duplicate broker rows (unique upsert key).

## Supabase handover

Run `supabase/migrations/20260795120000_broker_market_intelligence.sql`. After deploy, every external sync recomputes a broker market-intelligence profile per broker automatically (MAI-1→2→3→4→**6**). No backfill required.
