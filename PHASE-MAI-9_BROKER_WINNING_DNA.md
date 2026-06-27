# PHASE MAI-9 — Broker Winning DNA™

**Status:** ✅ Complete · deterministic · evidence-only · scoped `tsc` clean (0 errors) · `eslint` 0 errors · QA **8/8 pass** · committed (`1cc17ea`).

Discovers **repeatable behavioural patterns shared by the most successful brokers** (the observed leaders) inside every market segment × window. It does **not** generate recommendations, never tells a user what to do, and never compares to a specific broker — it only describes Observed Winning Behaviour / Patterns / Market DNA. Segment-level, deterministic, evidence-based, no AI/LLM, no fake values, no UI.

## 1. Files created

- `supabase/migrations/20260798120000_broker_winning_dna.sql` — segment-level table + indexes + RLS.
- `src/lib/winning-dna/types.ts` — records, profile, pattern groups, row + summary types; `WINNING_DNA_MODEL_VERSION="mai-9.0"`, windows, leader/weak floors, small-sample const.
- `src/lib/winning-dna/engine.ts` — **pure** `computeBrokerWinningDNA` (leader selection, pattern aggregation, confidence, weak/no-DNA rules).
- `src/lib/winning-dna/explain.ts` — cautious Hebrew description (no-advice + observed-behaviour disclaimer).
- `src/lib/winning-dna/repository.ts` — broker-attributed record join + upsert.
- `src/lib/winning-dna/service.ts` — `calculateBrokerWinningDNAForOrganization()`.
- `src/lib/winning-dna/qa.ts` — 8 deterministic scenarios.
- `src/lib/winning-dna/index.ts`.

## 2. Files modified

- `src/lib/external-listings/service.ts` — one additive best-effort call to `calculateBrokerWinningDNAForOrganization(orgId)` after MAI-8 in **both** sync paths + the import. Nothing else changed.

## 3. Migration

`broker_winning_dna` — segment dims (`city`, `neighborhood`, `property_type`, `rooms`, `price_bucket`) + `window_days`; `sample_size`, `confidence`; pattern jsonb groups (`winning_profile`, `behaviour_patterns`, `pricing_patterns`, `activity_patterns`, `listing_patterns`, `market_patterns`); headline metrics (`median_days_on_market`, `median_price_reduction_pct`, `market_success_rate`, `market_dominance`, `market_share`); `evidence`, `metadata`. **Unique (NULLS NOT DISTINCT) on `(org, city, neighborhood, property_type, rooms, price_bucket, window_days)`** — no `broker_id` (segment-level). Org-scoped, RLS read; service-role writes.

## 4. DNA structure

`winning_profile`: `{ leaderCount, medianDaysOnMarket, medianPriceReductionPct, marketSuccessRate, rejectionRate, acceptanceRate, exitRate, marketDominance, marketShare, activityLevel, momentum, weak }`. `pricing_patterns`: `{ medianReductionPct, avgReductionPct, priceDiscipline, dominantPriceBucket }`. `activity_patterns`: `{ activityLevel, momentum, avgMomentum, medianListingsPerLeader }`. `listing_patterns`: `{ dominantPropertyType, dominantRoomCount, medianListingsPerLeader, coverageShare }`. `market_patterns`: `{ acceptanceRate, rejectionRate, exitRate, dominantNeighborhood, leaderShare }`. `behaviour_patterns`: array of observed facts.

## 5. Pattern extraction rules

**Leader selection (the winning cohort):** brokers whose dominance ≥ `LEADER_FLOOR` (40), capped at 3. If none clear the floor but the top broker is ≥ `WEAK_DNA_FLOOR` (25) → **weak DNA** (fragmented market, built from the top broker). If the top broker is below 25 → **no DNA** (segment skipped).

**Behaviour patterns** (fire only when supported): fast market exits (median DOM ≤ 30) · shorter-than-area DOM · high success rate (≥ 60%) · low rejection (≤ 20%) · high price discipline (median reduction ≤ 3%) · high activity (≥ 8 listings/leader) · positive momentum (avg > 5) · high dominance (avg ≥ 60).
**Pricing discipline** is `HIGH`/`MEDIUM`/`LOW` from median reduction (≤3% / ≤7% / else). **Activity level** `HIGH`/`MEDIUM`/`LOW` from listings-per-leader (≥8 / ≥4 / else). **Momentum** `POSITIVE`/`STABLE`/`NEGATIVE` from the leaders' avg dominance vs the 90-day window. **Dominant** property type / rooms / neighborhood / price bucket are the mode across the leaders' listings.

**Confidence** = sample component + leader strength (avg dominance) + evidence quality + stability (inverse dominance spread across leaders), clamped 0–99; capped at 35 for weak DNA or small samples.

## 6. Example Winning DNA (QA scenario, strong market)

```
DNA מנצח — חולון (חלון 30 ימים), מבוסס על מובילים נצפים
חציון ימים בשוק          18
שיעור הצלחת שוק          100%
משמעת מחיר               גבוהה
רמת פעילות               גבוהה
מומנטום                  יציב/חיובי
רמת ביטחון               67%
"התיאור מבוסס על התנהגות נצפית של המובילים באזור בלבד, אינו המלצה ואינו אישור מכירות רשמי."
```

## 7. QA report (deterministic, `runWinningDNAQa()` — actually run)

| Scenario | Result | Detail |
|---|---|---|
| Strong market → DNA extracted | ✅ | weak=false, leaders≥1, success rate + median DOM present, conf 67 |
| Small sample → low confidence | ✅ | conf 35 (capped), `small_sample` evidence present |
| Fragmented market → weak DNA | ✅ | weak=true, top dominance 30.8, conf 35 |
| Multiple leaders → shared DNA | ✅ | leaderCount 2, leaders A+B aggregated |
| Different neighborhoods → independent DNA | ✅ | צפון→A, דרום→B (separate rows) |
| No leaders → no DNA | ✅ | city row absent (top dominance below weak floor) |
| No broker → ignored safely | ✅ | unattributed → 0 results |
| Deterministic rerun → same output | ✅ | byte-identical |

**All 8 pass.**

## 8. Remaining risks

1. **Leader floors are heuristic** (40 leader / 25 weak). Because dominance is share-based, two co-leaders peak around ~53 and a lone leader higher; the floors are tuned so a genuine winning cohort qualifies while a fragmented field yields weak DNA. They only decide *which observed facts surface*, never invent one.
2. **Momentum is intra-run** (leaders' dominance vs the 90-day window), not a persisted time series — deterministic, no backfill.
3. **Attribution depends on `external_listings.detected_broker_id`** — thin-coverage segments yield small samples / no DNA until detection grows.
4. **Categorical "dominant" patterns** use the leaders' listing modes; for coarse (city-level) segments these are derived from the underlying records, for fine segments they equal the segment dimension.
5. **No UI** — by design; rows are ready for a future read-only DNA surface. No broker cards or dashboards touched.

## 9. Production-readiness

**Yes — production-ready.** Additive and non-invasive (one best-effort call after MAI-8; the sync never breaks if it fails), deterministic, unit-tested (8/8), explainable (per-pattern evidence + Hebrew), org-scoped + RLS, no AI/LLM, **no recommendations, no per-broker comparison**, no fake values. Behaviour / pricing / activity / listing / market patterns + confidence + evidence all stored; fragmented markets yield weak DNA and leaderless markets yield none; no duplicate rows (unique upsert key, NULLS NOT DISTINCT).

## Supabase handover

Run `supabase/migrations/20260798120000_broker_winning_dna.sql`. After deploy, every external sync recomputes winning DNA per segment × window automatically (MAI-1→2→3→4→6→7→8→**9**). No backfill required.
