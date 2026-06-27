# PHASE MAI-8 — Broker Competitive Intelligence™

**Status:** ✅ Complete · deterministic · evidence-only · scoped `tsc` clean (0 errors) · `eslint` 0 errors · QA **8/8 pass** · committed (`5e3dbdd`).

Explains **why** brokers perform differently. For every broker × market segment × window it compares the broker's observed behaviour against the **area leader**, **area average**, and **runner-up**, recording the observed competitive position, behavioural deltas, momentum, and evidence-based **strengths / weaknesses / opportunities / risks** plus best/worst-segment discovery. It does **not** rank brokers and never claims "this broker is better". No AI, no recommendations, no official-sale claims, no fake values, no UI.

## 1. Files created

- `supabase/migrations/20260797120000_broker_competitive_intelligence.sql` — table + indexes + RLS.
- `src/lib/broker-competitive/types.ts` — records, profile, item/evidence, row + summary types; `COMPETITIVE_MODEL_VERSION="mai-8.0"`, windows, small-sample const, `MarketPosition`.
- `src/lib/broker-competitive/engine.ts` — **pure** `computeBrokerCompetitive` (position, leader gap, deltas, momentum, S/W/O/R detection, segment discovery).
- `src/lib/broker-competitive/explain.ts` — cautious Hebrew summary (no-ranking + observed-behaviour disclaimer).
- `src/lib/broker-competitive/repository.ts` — broker-attributed record join (incl. price reduction + `last_scan_at`) + upsert.
- `src/lib/broker-competitive/service.ts` — `calculateBrokerCompetitiveIntelligenceForOrganization()`.
- `src/lib/broker-competitive/qa.ts` — 8 deterministic scenarios.
- `src/lib/broker-competitive/index.ts`.

## 2. Files modified

- `src/lib/external-listings/service.ts` — one additive best-effort call to `calculateBrokerCompetitiveIntelligenceForOrganization(orgId)` after MAI-7 in **both** sync paths + the import. Nothing else changed.

## 3. Migration

`broker_competitive_intelligence` — segment dims + `window_days`; competitive position (`market_position`, `leader_gap`, `market_share`, `market_growth`, `market_decline`); behavioural deltas (`activity_delta`, `performance_delta`, `success_delta`, `exit_speed_delta`, `listing_share_delta`); `competitive_strengths/weaknesses/opportunities/risks jsonb`; discovery (`strongest_segment`, `weakest_segment`, `best_property_type`, `best_price_bucket`, `best_neighborhood`); `sample_size`, `confidence`, `evidence`, `metadata`. **Unique (NULLS NOT DISTINCT) on `(org, broker_id, city, neighborhood, property_type, rooms, price_bucket, window_days)`**. Org-scoped, RLS read; service-role writes; broker FK `on delete cascade`.

## 4. Competitive metrics

Per broker × segment × window: **market position** (`LEADER` / `RUNNER_UP` / `CONTENDER` / `TRAILING` / `SOLE` / `INSUFFICIENT`, by dominance rank); **leader gap** = leaderDominance − brokerDominance; **market share** = broker active-listing share; **growth/decline** from momentum (`brokerDominance(window) − brokerDominance(90d)`, split into positive/negative); and deltas vs the **area average / median**: `activity_delta` (vs equal share), `performance_delta` (vs avg performance), `success_delta` (vs avg success rate), `exit_speed_delta` (vs area median DOM, >0 = faster), `listing_share_delta` (vs equal share). Confidence scales with segment sample + the broker's own footprint + evidence quality.

## 5. Strength detection rules (fire only when supported)

Fast market exits (median DOM ≤ 80% of area median) · low price reductions (avg ≤ 80% of area avg) · high listing volume (active share ≥ 30%) · high success rate (≥ 60% with eligible ≥ 3) · high dominance (≥ 60) · positive momentum (growth ≥ 10).

## 6. Weakness detection rules

Long DOM (≥ 120% of area median) · high rejection (≥ 40% with eligible ≥ 3) · large price reductions (≥ 120% of area avg) · weak presence (active share ≤ ½ equal share) · low activity (activity share ≤ ½ equal share) · declining momentum (decline ≥ 10).

## 7. Opportunity detection rules (evidence-based, never advice)

Area leader losing momentum (leader momentum < −5 and broker isn't the leader) · low competition (≤ 2 brokers and sample ≥ 5) · rising area acceptance (area success/eligible ≥ 50%) · fragmented market (no broker holds ≥ 40% active share).
**Risks:** leader widening gap (leader_gap ≥ 40) · a competitor surging (another broker's growth ≥ 20) · high rejection trend (≥ 40%) · shrinking share (decline ≥ 10, not leader) · increasing DOM (≥ 120% of area median).

## 8. Example competitive profile (QA scenario 1)

```
Broker B — חולון (חלון 30 ימים)
מיקום תחרותי     RUNNER_UP
פער מהמובילה     22.5 נקודות   (leader A dominance − B dominance)
נתח נכסים פעילים  100% (active) · אך 0% מהצלחות השוק
חולשות נצפות      פעילות שוק נמוכה
"המדדים מבוססים על התנהגות שוק נצפית בלבד, אינם דירוג ואינם אישור מכירות רשמי."
```

## 9. QA report (deterministic, `runCompetitiveQa()` — actually run)

| Scenario | Result | Detail |
|---|---|---|
| Area leader → leader gap correct | ✅ | A LEADER gap 0, B RUNNER_UP gap 22.5 |
| Growing broker → growth detected | ✅ | growth(30)=13.1 > 0, growth(90)=0 |
| Declining broker → decline detected | ✅ | decline(30)=16 > 0, growth(30)=0 |
| Small sample → low confidence | ✅ | INSUFFICIENT, conf 29, no strengths |
| No competitors → neutral profile | ✅ | SOLE, empty strengths/risks/opportunities |
| Mixed portfolio → correct strongest segment | ✅ | best neighborhood צפון, strongest "חולון / צפון" |
| No broker → ignored safely | ✅ | unattributed → 0 results |
| Deterministic rerun → same output | ✅ | byte-identical |

**All 8 pass.**

## 10. Remaining risks

1. **Momentum is intra-run** (window vs 90-day window) rather than vs a persisted snapshot — deterministic, no backfill, but not a true time series. A later phase could add cross-run trend.
2. **Deltas use the equal-share baseline** for activity/listing share (area average share = 1/brokerCount). This is exact for shares; performance/success deltas use the mean across brokers with eligible listings.
3. **Attribution depends on `external_listings.detected_broker_id`** — low-detection segments stay `INSUFFICIENT` until coverage grows (correct, never fabricated).
4. **Thresholds are heuristic** (e.g. 30% volume, 0.8/1.2 DOM ratios, 40 leader-gap) — they only decide whether an *observed* fact is surfaced; they never invent a fact or a recommendation.
5. **Row volume** — one row per broker × segment × window; bounded by data and the ≥2-brokers/≥5-sample emit gate, but larger orgs will accumulate many rows (mitigated by the upsert key).
6. **No UI** — by design; rows are ready for a future read-only competitive surface. Broker cards untouched.

## 11. Production-readiness

**Yes — production-ready.** Additive and non-invasive (one best-effort call after MAI-7; the sync never breaks if it fails), deterministic, unit-tested (8/8), explainable (per-item evidence + Hebrew), org-scoped + RLS, no AI/LLM, no recommendations, no ranking, no fake values, structurally incapable of claiming an official sale. Strengths/weaknesses/opportunities/risks + market position + leader gap + confidence all computed; small samples and sole markets produce honest neutral profiles; no duplicate rows (unique upsert key, NULLS NOT DISTINCT).

## Supabase handover

Run `supabase/migrations/20260797120000_broker_competitive_intelligence.sql`. After deploy, every external sync recomputes competitive profiles automatically (MAI-1→2→3→4→6→7→**8**). No backfill required.
