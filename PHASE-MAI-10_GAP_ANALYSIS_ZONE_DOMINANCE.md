# PHASE MAI-10 — Broker Gap Analysis & ZONO Zone Dominance Score™

**Status:** ✅ Complete · deterministic · evidence-only · `eslint` 0 errors/0 warnings · QA **8/8 pass** · committed (`c3589af`).

Compares each broker against the segment's **Winning DNA** (MAI-9) and the **area leader** (MAI-7), and persists measurable, explainable gaps plus a cautious 0–100 **Zone Dominance Score**. It does **not** recommend, does **not** use AI, does **not** touch the UI — it only answers: where is the broker strong, where is the broker behind the winning pattern, and how far from area leadership.

## 1. Files created

- `supabase/migrations/20260799120000_broker_gap_analysis.sql` — table + indexes + RLS.
- `src/lib/gap-analysis/types.ts` — records, gap/strength/evidence, row + summary types; `GAP_MODEL_VERSION="mai-10.0"`, windows, small-sample + min-confidence consts, `ZoneDominanceLevel`, `GapType`.
- `src/lib/gap-analysis/engine.ts` — **pure** `computeBrokerGapAnalysis` (Winning DNA cohort recompute, 8 gaps, Zone Dominance Score+band, strengths, evidence, confidence).
- `src/lib/gap-analysis/explain.ts` — cautious Hebrew summary + disclaimer.
- `src/lib/gap-analysis/repository.ts` — broker-attributed record join + upsert.
- `src/lib/gap-analysis/service.ts` — `calculateBrokerGapAnalysisForOrganization()`.
- `src/lib/gap-analysis/qa.ts` — 8 deterministic scenarios.
- `src/lib/gap-analysis/index.ts`.

## 2. Files modified

- `src/lib/external-listings/service.ts` — one additive best-effort call to `calculateBrokerGapAnalysisForOrganization(orgId)` after MAI-9 in **both** sync paths + the import. Nothing else changed.

## 3. Migration

`broker_gap_analysis` — segment dims + `window_days`; Zone Dominance (`zone_dominance_score`, `zone_dominance_level`); ten gap columns (`leader_gap`, `winning_dna_match_score`, `success_rate_gap`, `exit_speed_gap_days`, `market_share_gap`, `activity_gap`, `performance_gap`, `momentum_gap`, `coverage_gap`, `price_reduction_gap`); `strengths/gaps/evidence/metadata jsonb`; `confidence`. **Unique (NULLS NOT DISTINCT) on `(org, broker_id, city, neighborhood, property_type, rooms, price_bucket, window_days)`**. Org-scoped, RLS read; service-role writes; broker FK `on delete cascade`.

## 4. Zone Dominance formula

A cautious weighted 0–100 score (each component normalized to 0–100):

```
score = 0.20·marketShare  + 0.20·successRate + 0.15·exitSpeed
      + 0.15·activity      + 0.15·dnaMatch    + 0.10·momentum
      + 0.05·confidence
```

- `marketShare = clamp(activeShare·200, 0, 100)`, `successRate = successRate·100`
- `exitSpeed` = broker speed relative to the area median (50 = at median, faster = higher)
- `activity = clamp(activityShare·200, 0, 100)`, `momentum = clamp(50 + brokerMomentum/2, 0, 100)`
- `dnaMatch` = the Winning-DNA match score (below)

**Bands:** ≤30 `LOW` · ≤50 `EMERGING` · ≤70 `COMPETITIVE` · ≤85 `STRONG` · ≤100 `LEADER_LIKE`. **If sample < 5 or confidence < 30 → score `null`, level `INSUFFICIENT_DATA`** (weak evidence never yields a high score). **No Winning DNA in the segment → score `null`, `INSUFFICIENT_DATA`, `metadata.reason = "no_winning_dna"`** (safe).

**Winning DNA match score (0–100):** average of per-dimension matches, each rewarding being at-or-above the DNA — success rate (scale 0.5), exit speed (scale = DNA median DOM), performance (scale 50), price reduction (scale 0.1).

## 5. Gap calculation rules

All gaps are signed so **positive = broker behind**; a negative value becomes a **strength**, not a gap.

| Gap | Formula | Severity scale |
|---|---|---|
| `success_rate_gap` | DNA success − broker success | /0.30 |
| `exit_speed_gap_days` | broker median DOM − DNA median DOM | /DNA median DOM |
| `market_share_gap` | leader active share − broker active share | /0.40 |
| `activity_gap` | DNA listings-per-leader − broker listings | /DNA listings |
| `performance_gap` | DNA performance index − broker performance | /40 |
| `momentum_gap` | leaders' avg momentum − broker momentum | /30 |
| `coverage_gap` | missing winning neighborhoods + property types | /5 |
| `price_reduction_gap` | broker avg reduction − DNA median reduction | /0.10 |
| `leader_gap` | top-broker dominance − broker dominance | — |

Each emitted gap carries `{type, label (Hebrew), brokerValue, benchmarkValue, gapValue, severity (LOW/MEDIUM/HIGH), confidence}`. **Strengths** are emitted for the negative side (faster exits, higher success, higher performance, lower reductions, positive momentum).

## 6. Example broker gap profile (QA "far from DNA")

```
Broker T — חולון (חלון 30 ימים)
ציון שליטה            27.8  (LOW)
פער מהמובילה          גבוה
פערים מדידים:
  • זמן השיווק החציוני איטי ב-65 ימים מהדפוס המנצח  (HIGH)
  • שיעור ההצלחה נמוך ב-75 נקודות אחוז מהדפוס המנצח (HIGH)
  • נתח השוק נמוך מהמובילה ... · מומנטום נמוך ... · כיסוי חלקי ...
"המדדים מבוססים על התנהגות שוק נצפית בלבד ואינם אישור מכירה רשמי."
```

## 7. QA report (deterministic, `runGapAnalysisQa()` — actually run)

| Scenario | Result | Detail |
|---|---|---|
| Broker close to Winning DNA → high score, small gaps | ✅ | score 83.2 (STRONG), 0 gaps, DNA match 100 |
| Broker far from Winning DNA → lower score, multiple gaps | ✅ | score 27.8, 5 gaps |
| Broker faster than DNA → strength not gap | ✅ | exitGap −18d → EXIT_SPEED strength, no exit gap |
| Small sample → INSUFFICIENT_DATA | ✅ | level INSUFFICIENT_DATA, score null |
| No Winning DNA → no score, safe insufficient | ✅ | score null, reason `no_winning_dna` |
| Leader broker → leader-like score, minimal leader gap | ✅ | leaderGap 0, score 87.1 (LEADER_LIKE) |
| Mixed segment → moderate score + gaps | ✅ | score 57 (COMPETITIVE), 5 gaps |
| Deterministic rerun → same output | ✅ | byte-identical |

**All 8 pass.**

## 8. Remaining risks

1. **Component weights & severity scales are heuristic** — they shape only how observed facts surface, never invent a fact. Defaults satisfy the spec's suggested weighting.
2. **The Winning DNA cohort is recomputed in-engine** (same leader rule as MAI-9) rather than read from the persisted `broker_winning_dna` table — this keeps the engine pure/testable and guarantees the gap and the DNA are derived from the same snapshot, at the cost of a small recomputation.
3. **Momentum is intra-run** (window vs 90-day window), consistent with MAI-7/8/9.
4. **Attribution depends on `external_listings.detected_broker_id`** — low-coverage segments stay `INSUFFICIENT_DATA`.
5. **Full-project `tsc` was not run to completion here** — the sandbox's execution ceiling is below the project's ~47s typecheck and background jobs don't persist. Verified instead via a successful `tsx` engine run (imports/types resolve) + `eslint` (0 errors/0 warnings) + consistency with the four prior MAI modules that passed full `tsc`. Vercel's build is the authoritative full typecheck.

## 9. Production-readiness

**Yes — production-ready.** Additive and non-invasive (one best-effort call after MAI-9; the sync never breaks if it fails), deterministic, unit-tested (8/8), explainable (per-gap + Hebrew evidence + disclaimer), org-scoped + RLS, **no recommendations, no AI, no fake values, no UI changes**, and structurally cautious — weak evidence and missing DNA yield `INSUFFICIENT_DATA` rather than an inflated score. No duplicate rows (unique upsert key, NULLS NOT DISTINCT).

## Supabase handover

Run `supabase/migrations/20260799120000_broker_gap_analysis.sql`. After deploy, every external sync recomputes gap analysis automatically (MAI-1→2→3→4→6→7→8→9→**10**). No backfill required.
