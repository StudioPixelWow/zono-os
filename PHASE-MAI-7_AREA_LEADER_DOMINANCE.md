# PHASE MAI-7 — Area Leader & Market Dominance Engine™

**Status:** ✅ Complete · deterministic · evidence-only · scoped `tsc` clean (0 errors) · `eslint` 0 errors · QA **8/8 pass** · committed (`b11f127`).

Transforms Broker Market Intelligence (MAI-6) into **area** intelligence: for each market segment (city → neighborhood → property_type → rooms → price_bucket) and time window (7/14/30/60/90), it determines who currently **dominates** the segment from observed market behaviour. It **never** claims "broker sold the most" — only Observed Market Leadership / Dominance / Momentum / Presence. No official-sale count, commission, revenue, or manual ranking. No AI, no UI — persist only.

## 1. Files created

- `supabase/migrations/20260796120000_market_area_leaders.sql` — results table + indexes + RLS.
- `src/lib/area-leaders/types.ts` — records, result, row + summary types; `AREA_LEADER_MODEL_VERSION="mai-7.0"`, windows, small-sample & tie constants, dominance weights.
- `src/lib/area-leaders/engine.ts` — **pure** `computeAreaLeaders` (segment enumeration, per-broker shares, dominance, momentum, leader/runner-up/gap, small-sample + tie rules).
- `src/lib/area-leaders/explain.ts` — cautious Hebrew explanation (observed-behaviour disclaimer).
- `src/lib/area-leaders/repository.ts` — broker-attributed record join (with `last_scan_at` window anchor) + upsert.
- `src/lib/area-leaders/service.ts` — `calculateAreaLeaderEngineForOrganization()`.
- `src/lib/area-leaders/qa.ts` — 8 deterministic scenarios.
- `src/lib/area-leaders/index.ts`.

## 2. Files modified

- `src/lib/external-listings/service.ts` — one additive best-effort call to `calculateAreaLeaderEngineForOrganization(orgId)` after MAI-6 in **both** sync paths (`syncOrg` + `finishSyncJob`), plus the import. Nothing else changed.

## 3. Migration

`market_area_leaders` — segment dims (`city`, `neighborhood`, `property_type`, `rooms`, `price_bucket`) + `window_days`; leader (`leader_broker_id`, `leader_confidence`); leader metrics (`active_listing_share`, `market_success_share`, `market_activity_share`, `market_exit_speed`, `market_presence_score`, `market_performance_index`, `market_dominance_index`, `market_momentum_index`); `sample_size`, `confidence`; runner-up (`runner_up_broker_id`, `runner_up_gap`); `evidence jsonb`, `metadata jsonb`. **Unique (NULLS NOT DISTINCT) on `(org, city, neighborhood, property_type, rooms, price_bucket, window_days)`** so coarse segments dedupe on upsert. Org-scoped, RLS read via `current_org_id()`; service-role writes; broker FKs `on delete set null`.

## 4. Dominance formula

For each (segment, window), every broker's area shares are computed, then:

```
dominance = 100 × ( 0.35·activeListingShare
                  + 0.30·marketSuccessShare
                  + 0.20·marketActivityShare
                  + 0.15·performanceFactor )
```

- `activeListingShare = brokerActive / areaActive`
- `marketSuccessShare = brokerLikelySuccess / areaLikelySuccess`
- `marketActivityShare = brokerMovements / areaMovements` (movements = success+exit+rejected+returned)
- `performanceFactor = performanceIndex/100` (0.5 when no resolved listings), `performanceIndex = 50 + 45·successRate − 25·rejectionRate ± domBonus`
- `marketExitSpeed = clamp(50 + (areaMedianDOM − brokerMedianDOM)/areaMedianDOM·50, 0, 100)` (faster than area = higher)

**Leader** = highest dominance (tie-break broker_id asc). **Runner-up** = 2nd; **gap** = leader − runner-up. **Small sample (<5)** ⇒ no leader, evidence "מדגם קטן מדי", low confidence. **Tie** (gap < 2.0) ⇒ no leader (no unstable ranking), tie flagged in metadata.
`leader_confidence = clamp(40 + min(25,gap) + min(20, sample·2) + leaderEvidenceQuality·15, 0, 99)`.

## 5. Momentum formula

Recent-vs-long-run dominance for the same leader, fully deterministic from one run (no persisted history needed):

```
momentum(window) = clamp( leaderDominance(window) − leaderDominance(90d), −100, 100 )
momentum(90d)    = 0
```

A broker surging in the recent window but thin over 90 days shows **positive** momentum; a fading leader shows **negative**. Tracks the *window's* leader, not the 90-day leader.

## 6. Example area leader (from QA scenario 1)

```
אזור            חולון (חלון 30 ימים)
מוביל           Broker A
נתח נכסים פעילים  ~ (active listing share)
נתח הצלחת שוק    גבוה
מדד דומיננטיות    85.5
מתחרה (runner-up) Broker B
פער               66.3 נקודות
רמת ביטחון        גבוהה
"המדד מבוסס על התנהגות שוק נצפית בלבד ואינו אישור מכירות רשמי."
```

## 7. QA report (deterministic, `runAreaLeaderQa()` — actually run)

| Scenario | Result | Detail |
|---|---|---|
| Strong leader → leader detected | ✅ | leader A, dominance 85.5, runner-up B, gap 66.3 |
| Tie → no unstable ranking | ✅ | leader null, `metadata.tie=true`, sample 6 |
| Small sample → no leader | ✅ | leader null, sample 3, conf 28.5, "מדגם קטן מדי" |
| Broker disappears → leader recalculated | ✅ | before A → after B (A's listings exited) |
| Momentum increase → momentum updated | ✅ | mom(30)=20 > 0, mom(90)=0 |
| Neighborhood split → independent leaders | ✅ | צפון→A, דרום→B |
| No broker → ignored safely | ✅ | unattributed records → 0 results |
| Deterministic rerun → same output | ✅ | byte-identical |

**All 8 pass.**

## 8. Remaining risks

1. **Window inclusion uses `last_scan_at`** as the recency anchor (same as MAI-4). A listing with a null `last_scan_at` (rare — lifecycle always sets it) is treated as present in all windows.
2. **Momentum is intra-run** (recent window vs 90-day window in the same computation) rather than vs a historical snapshot. This is deterministic and needs no backfill; a later phase could add cross-run trend if desired.
3. **Attribution depends on `external_listings.detected_broker_id`** — areas with low detection coverage yield smaller samples (and therefore "no leader" until coverage grows). Correct and safe, never fabricated.
4. **Tie threshold (2.0 dominance points)** is a heuristic; it only affects whether a near-dead-heat is declared a leader. It can never invent a leader where none exists.
5. **No UI** — by design; rows are ready for a future read-only area-leadership surface. Broker cards untouched.

## 9. Production-readiness

**Yes — production-ready.** Additive and non-invasive (one best-effort call after MAI-6; the sync never breaks if it fails), deterministic, unit-tested (8/8), explainable (per-segment evidence + Hebrew), org-scoped + RLS, no AI/LLM, no fake values, structurally incapable of claiming an official sale or producing an unstable ranking (small-sample + tie guards), with runner-up + gap + momentum + confidence all stored. No duplicate rows (unique upsert key, NULLS NOT DISTINCT).

## Supabase handover

Run `supabase/migrations/20260796120000_market_area_leaders.sql`. After deploy, every external sync recomputes area leaders per segment × window automatically (MAI-1→2→3→4→6→**7**). No backfill required.
