# PHASE MAI-12 — Autonomous Growth Strategy™

**Status:** ✅ Complete · deterministic · evidence-only · no LLM · `eslint` 0 errors · QA **7/7 pass** · committed (`060685d`).

Turns the Market Acceptance Intelligence™ pipeline (MAI-6→11) into a **structured execution strategy** that helps a broker improve Zone Dominance over time. It does **not** invent strategy — every action originates from a measurable gap/opportunity already produced upstream and carries its supporting evidence, expected outcome, confidence, and estimated Zone Dominance impact. The Zone Dominance projection is a clearly-marked **SIMULATION** (estimate, never a guarantee). No hallucinations, no generic coaching, no motivational text, no UI.

## 1. Files created

- `supabase/migrations/20260801120000_broker_growth_strategy.sql` — table + indexes + RLS.
- `src/lib/broker-strategy/types.ts` — action/simulation/evidence types; action categories, time buckets, priority bands; `STRATEGY_MODEL_VERSION="mai-12.0"`.
- `src/lib/broker-strategy/engine.ts` — **pure** `computeBrokerStrategy` (action mapping, priority, blockers + conflict resolution, simulation, buckets).
- `src/lib/broker-strategy/explain.ts` — deterministic Hebrew headline (metadata).
- `src/lib/broker-strategy/repository.ts` — reads `broker_ai_coaching` + `broker_gap_analysis`, maps to inputs + upsert.
- `src/lib/broker-strategy/service.ts` — `generateBrokerGrowthStrategy()`.
- `src/lib/broker-strategy/qa.ts` — 7 deterministic scenarios.
- `src/lib/broker-strategy/index.ts`.

## 2. Files modified

- `src/lib/external-listings/service.ts` — one additive best-effort call to `generateBrokerGrowthStrategy(orgId)` after MAI-11 in **both** sync paths + the import. Nothing else changed.

## 3. Migration

`broker_growth_strategy` — `overall_priority`, `overall_confidence`, `expected_zone_score`, `expected_improvement` (both SIMULATION); time-bucketed `daily_actions` / `weekly_actions` / `monthly_actions`; cross-cuts `quick_wins` / `long_term_actions` / `blocked_actions`; `estimated_impact jsonb` (marked SIMULATION) + `evidence` + `metadata`. **Unique on `(org, broker_id, strategy_version)`**. Org-scoped, RLS read; service-role writes; broker FK `on delete cascade`.

## 4. Strategy generation flow

1. Read the broker's MAI-11 coaching record (recommendations + opportunities + warnings, each evidence-backed) + the MAI-10 gap snapshot (current Zone score, leader gap, gap severities, strengths, market-share/success-rate, momentum).
2. Map each coach item → an action: parse its gap **type** → action **category** + **time-to-impact** (daily/weekly/monthly).
3. Compute priority + an estimated Zone score gain; carry `requiredEvidence` + `generatedFrom`.
4. **Block** actions that are low-confidence, missing evidence, or **conflicting** (a gap in a dimension the broker is already strong in) — blocked actions are removed from the active plan.
5. Bucket active actions into daily/weekly/monthly; derive quick-wins (fast + high-confidence + meaningful impact) and long-term.
6. Run the Zone Dominance **simulation** (below). No usable action ⇒ "Not enough evidence" (empty plan).

Action categories (closed set): Listing Acquisition, Pricing, Coverage, Neighborhood Focus, Property Type Focus, Market Presence, Activity, Exit Speed, Competitive Position, Market Opportunity.

Every action: `{ id, title, category, priority, confidence, estimatedImpact, estimatedZoneScoreGain, estimatedTimeToImpact, requiredEvidence[], relatedGap, generatedFrom[], blockedBy[] }`.

## 5. Priority formula

```
priority = round(100 × impact × confidence × gapSeverity × opportunity × marketTiming)
```

- `impact` = HIGH 1 / MEDIUM 0.66 / LOW 0.33
- `confidence` = action confidence / 100
- `gapSeverity` = the related gap's MAI-10 severity (HIGH 1 / MEDIUM 0.66 / LOW 0.33)
- `opportunity` = `clamp(1 − leaderGap/100, 0.3, 1)` (closer to leadership ⇒ bigger reachable gain)
- `marketTiming` = momentum-based (positive 1.0 / flat 0.85 / negative 0.7)

Bands: ≥66 HIGH · ≥33 MEDIUM · else LOW. `overall_priority` = the top active action's band (or NONE).

## 6. Simulation model

Per action: `estimatedZoneScoreGain = round(impact × confidence × 5, 1)`. **Overall (SIMULATION):**

```
expected_zone_score = clamp(currentZone + Σ(top-5 active gains, capped at 15), 0, 95)
expected_improvement = expected_zone_score − currentZone
```

Plus projected market-share (+4%·meanConfidence when a share/acquisition action is active) and success-rate (+5%·meanConfidence when an activity/success action is active). The whole `estimated_impact` object carries `simulation: true` and a disclaimer (*"סימולציה בלבד — הערכה מבוססת ראיות, אינה הבטחה."*). Every figure is `{ current, expected, delta }` — **never presented as certainty**.

## 7. Example strategy (QA "high evidence")

```
Broker A — 3 evidence-based actions (priority MEDIUM)
DAILY:   שיפור מהירות היציאה מהשוק  (Exit Speed, HIGH, conf 90, +Zone gain)
WEEKLY:  הרחבת הכיסוי / הגדלת נתח השוק  (Coverage / Listing Acquisition)
SIMULATION: Zone Dominance 60 → 71 (+11.4)   ⟵ marked simulation, not a guarantee
Each action → requiredEvidence + generatedFrom (e.g. broker_gap_analysis.exit_speed_gap_days,
broker_winning_dna.median_days_on_market)
```

## 8. QA report (deterministic, `runBrokerStrategyQa()` — actually run)

| Scenario | Result | Detail |
|---|---|---|
| High evidence → strategy generated | ✅ | 3 actions, improvement +11.4, all traceable |
| Weak evidence → no strategy | ✅ | active 0, priority NONE, notEnoughEvidence |
| Blocked recommendation → blocked correctly | ✅ | low-confidence action in `blocked_actions`, excluded from plan |
| Simulation → clearly marked | ✅ | `simulation:true`, disclaimer, zone 60→64.3 |
| Conflicting actions → resolved | ✅ | gap-vs-strength conflict blocked, other action active |
| Deterministic rerun → same output | ✅ | byte-identical |
| No broker → ignored safely | ✅ | brokerless input → 0 results |

**All 7 pass.**

## 9. Remaining risks

1. **Strategy reads persisted MAI-11/MAI-10** rather than recomputing — freshness tracks the upstream runs (all in the same sync).
2. **Simulation coefficients are heuristic** (5 pts/action, +4%/+5% metric deltas, caps) and explicitly labelled SIMULATION — they shape an estimate, never a promise, and can never exceed the caps.
3. **Market timing uses intra-run momentum**, consistent with MAI-7..11.
4. **Conflict detection** currently covers gap-vs-own-strength contradictions; broader cross-action conflicts can be added later.
5. **Full-project `tsc` not run to completion here** — the sandbox's execution ceiling is below the project's ~47s typecheck. Verified via a clean `tsx` engine run + `eslint` (0 errors) + the established `as never` casts for the three untyped tables. Run `npx tsc --noEmit` locally before pushing (authoritative).
6. **No UI** — by design; the persisted record is ready for a future read-only strategy surface.

## 10. Production-readiness

**Yes — production-ready.** Additive and non-invasive (one best-effort call after MAI-11; the sync never breaks if it fails), deterministic, unit-tested (7/7), fully traceable (every action references evidence + source), org-scoped + RLS, **no LLM, no hallucinations, no free text, no fake values, no UI**. Weak evidence yields "Not enough evidence"; blocked/conflicting actions are excluded from the active plan; the Zone Dominance projection is a marked simulation. One current strategy per broker (unique upsert key).

## Supabase handover

Run `supabase/migrations/20260801120000_broker_growth_strategy.sql`. After deploy, every external sync regenerates the growth strategy automatically (MAI-1→…→11→**12**). No backfill required.
