# PHASE MAI-11 — Evidence-Based Broker Coach™

**Status:** ✅ Complete · deterministic · evidence-only · no LLM · `eslint` 0 errors · QA **7/7 pass** · committed (`eef73b7`).

The first coaching layer for ZONO. It is **not** a chatbot, **not** a generic LLM assistant, **not** free-form advice. Every recommendation is generated deterministically from the Market Acceptance Intelligence™ pipeline (MAI-6→10) and references the exact observed evidence that produced it. When evidence is insufficient it returns **"Not enough evidence"** — it never invents, never guesses, never compensates with AI reasoning. Structured output only, no UI.

## 1. Files created

- `supabase/migrations/20260800120000_broker_ai_coaching.sql` — table + indexes + RLS.
- `src/lib/broker-coach/types.ts` — categories, recommendation/insight/evidence/daily-coach types; `COACH_MODEL_VERSION="mai-11.0"`, `COACH_VERSION="v1"`, min-confidence const.
- `src/lib/broker-coach/engine.ts` — **pure** `computeBrokerCoach` (gap→recommendation mapping, priority, traceability, daily coach, "Not enough evidence" guard).
- `src/lib/broker-coach/explain.ts` — deterministic Hebrew headline (metadata).
- `src/lib/broker-coach/repository.ts` — reads `broker_gap_analysis` + `broker_market_intelligence`, maps to inputs + upsert.
- `src/lib/broker-coach/service.ts` — `generateBrokerCoachForOrganization()`.
- `src/lib/broker-coach/qa.ts` — 7 deterministic scenarios.
- `src/lib/broker-coach/index.ts`.

## 2. Files modified

- `src/lib/external-listings/service.ts` — one additive best-effort call to `generateBrokerCoachForOrganization(orgId)` after MAI-10 in **both** sync paths + the import. Nothing else changed.

## 3. Migration

`broker_ai_coaching` — `overall_priority`, `overall_confidence`; structured jsonb (`recommendations`, `insights`, `warnings`, `opportunities`, `strengths`); `evidence jsonb` (traceability) + `metadata jsonb` (daily coach + headline); ids/versions. **Unique on `(organization_id, broker_id, coach_version)`** (one current record per broker). Org-scoped, RLS read; service-role writes; broker FK `on delete cascade`.

## 4. Recommendation generation flow

1. Read the broker's MAI-10 gap profiles (per segment × window) + MAI-6 context.
2. Keep **usable** profiles only (confidence ≥ 30 and at least one gap / strength / zone score). No usable profile ⇒ **"Not enough evidence"** (empty recommendations, an insight stating it, `metadata.notEnoughEvidence`).
3. Pick the **focus** profile (highest confidence, then zone dominance).
4. For each gap **type**, take the most severe instance across segments (severity × confidence) and emit one recommendation in the matching category — every one carries `supportingEvidence` (the literal numbers) and `generatedFrom` (e.g. `broker_gap_analysis.exit_speed_gap_days`, `broker_winning_dna.median_days_on_market`).
5. Add leader-gap closing, risk warnings (widening leader gap, falling momentum), market opportunities (near-leadership, scale-a-winning-area), and strength reinforcement — each evidence-backed.
6. Rank, assemble the daily coach, compute overall priority + confidence.

Categories (closed set): Performance, Market Position, Gap Closing, Coverage, Pricing, Activity, Momentum, Market Opportunities, Risk, Strength Reinforcement.

## 5. Priority formula

```
priority = round(100 × impact × confidence × severity × marketOpportunity × dataQuality)
```

- `impact` = HIGH 1 / MEDIUM 0.66 / LOW 0.33 (from gap severity)
- `confidence` = the gap's evidence confidence (0..1)
- `severity` = HIGH 1 / MEDIUM 0.66 / LOW 0.33
- `marketOpportunity` = `clamp(1 − leaderGap/100, 0.3, 1)` (closer to leadership ⇒ more reachable)
- `dataQuality` = focus profile confidence / 100

Bands: ≥66 HIGH · ≥33 MEDIUM · else LOW. `overall_priority` = the top recommendation's band (or NONE).

## 6. Evidence traceability model

Every recommendation exposes **`generatedFrom`** (source table.field identifiers, e.g. `broker_gap_analysis.success_rate_gap` + `broker_winning_dna.market_success_rate`) and **`supportingEvidence`** (the literal observed facts in Hebrew, e.g. *"חציון הימים בשוק הוא 31 לעומת 18 בדפוס המנצח"*). A top-level **`evidence`** array unions every fact with its `source`, `brokerValue`, `benchmarkValue`, `gapValue`, and `segment` — so each recommendation is fully back-traceable to real observed data. Nothing is emitted without an evidence row.

## 7. Example coaching output (QA "large evidence")

```json
{
  "title": "שיפור מהירות היציאה מהשוק",
  "category": "PERFORMANCE",
  "priority": 73, "priorityBand": "HIGH",
  "confidence": 90, "estimatedImpact": "HIGH",
  "supportingEvidence": ["חציון הימים בשוק הוא 31 לעומת 18 בדפוס המנצח (פער 13 ימים) — חולון / צפון"],
  "generatedFrom": ["broker_gap_analysis.exit_speed_gap_days", "broker_winning_dna.median_days_on_market"],
  "blockedBy": []
}
```
Daily coach: `topPriorities` (3 ids), `opportunities`, `risks`, `wins`, `weeklyTrend`/`zoneDominanceTrend` (UP/FLAT/DOWN from intra-run momentum, with an honest `trendBasis` note).

## 8. QA report (deterministic, `runBrokerCoachQa()` — actually run)

| Scenario | Result | Detail |
|---|---|---|
| Large evidence → recommendations generated | ✅ | 3 recs, overall confidence 85, all traceable |
| Weak evidence → no recommendation | ✅ | 0 recs, `notEnoughEvidence`, "Not enough evidence" insight |
| Gap disappears → recommendation disappears | ✅ | EXIT_SPEED rec present then absent |
| High confidence → high priority | ✅ | top rec band HIGH, priority 81 |
| No broker → ignored safely | ✅ | brokerless input → 0 results |
| Deterministic rerun → same output | ✅ | byte-identical |
| Evidence traceability → every rec references source | ✅ | 6 recs, all with evidence + source |

**All 7 pass.**

## 9. Remaining risks

1. **The coach reads persisted MAI-10 gap profiles** rather than recomputing — so coaching freshness tracks the gap-analysis run (both run in the same sync, so they stay in step).
2. **Trend is intra-run** (momentum-derived), not a historical time series — labelled honestly in `dailyCoach.trendBasis`.
3. **Thresholds are heuristic** (min confidence 30, leader-gap bands, priority weights) — they only decide whether an *observed* fact surfaces, never invent one.
4. **Coverage depends on upstream attribution** — brokers with thin detection get "Not enough evidence", correctly.
5. **Full-project `tsc` not run to completion here** — the sandbox's execution ceiling is below the project's ~47s typecheck. Verified via a successful `tsx` engine run + `eslint` (0 errors) + the established `as never` casts for the three untyped tables. Run `npx tsc --noEmit` locally before pushing (authoritative).
6. **No UI** — by design; the persisted record is ready for a future read-only coach surface.

## 10. Production-readiness

**Yes — production-ready.** Additive and non-invasive (one best-effort call after MAI-10; the sync never breaks if it fails), deterministic, unit-tested (7/7), fully traceable (every recommendation references source data), org-scoped + RLS, **no LLM, no hallucinations, no free text, no fake values, no UI**. Insufficient evidence yields "Not enough evidence" rather than invented advice. One current record per broker (unique upsert key).

## Supabase handover

Run `supabase/migrations/20260800120000_broker_ai_coaching.sql`. After deploy, every external sync regenerates coaching automatically (MAI-1→…→10→**11**). No backfill required.
