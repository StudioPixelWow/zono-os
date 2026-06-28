# PHASE MAI-13 — Self-Learning & Model Calibration™

**Status:** ✅ Complete · deterministic · measure-only · no model changes · no LLM · `eslint` 0 errors · scoped `tsc` clean · QA **9/9 pass** · committed (`287afca`).

The final observability layer of Market Acceptance Intelligence™. It continuously **measures** the accuracy, calibration and stability of every MAI model by comparing historical predictions against later observed evidence, then persists measurable calibration reports. It **never** modifies a model, weight or threshold — it may *recommend* calibration, but every recommendation is advisory and human-controlled. No automatic learning, no hidden tuning, no fake values, no UI.

---

## 1. Files created

| File | Purpose |
|------|---------|
| `supabase/migrations/20260802120000_mai_model_calibration.sql` | `mai_model_calibration` table — org-scoped, RLS read, service-role writes |
| `src/lib/mai-calibration/types.ts` | Pure types, thresholds, model/action enums |
| `src/lib/mai-calibration/engine.ts` | Pure deterministic evaluation engine (metrics + recommendation) |
| `src/lib/mai-calibration/explain.ts` | Deterministic Hebrew headline for each calibration record |
| `src/lib/mai-calibration/repository.ts` | Server-only data access: assembles inputs from sources + upsert |
| `src/lib/mai-calibration/service.ts` | `evaluateMAIModelsForOrganization()` across weekly/monthly/quarterly windows |
| `src/lib/mai-calibration/qa.ts` | Deterministic QA harness (9 spec scenarios) |
| `src/lib/mai-calibration/index.ts` | Barrel exports |

## 2. Files modified

| File | Change |
|------|--------|
| `src/lib/external-listings/service.ts` | Import + best-effort call to `evaluateMAIModelsForOrganization(orgId)` after MAI-12 in **both** sync paths (`syncOrg`, `finishSyncJob`) |

## 3. Migration

`mai_model_calibration` — one row per `(organization_id, model_name, model_version, evaluation_window_days)` (re-runs upsert). Columns: `sample_size, accuracy, precision, recall, f1_score, calibration_score, confidence_accuracy, false_positive_rate, false_negative_rate, prediction_stability`, advisory `recommended_action / recommended_weight_change / recommended_threshold_change`, plus `evidence`/`metadata` JSONB. RLS: org members **read** their own rows; writes are **service-role only**.

## 4. Evaluation formulas

For binary-validated models (e.g. Market Acceptance) over a confusion matrix of TP/FP/FN/TN:

```
accuracy            = (TP + TN) / N
precision           = TP / (TP + FP)            (null when no positive predictions)
recall              = TP / (TP + FN)            (null when no actual positives)
f1_score            = 2·P·R / (P + R)
false_positive_rate = FP / (FP + TN)
false_negative_rate = FN / (FN + TP)
calibration_score   = 1 − ECE   (Expected Calibration Error, confidence binned into deciles)
confidence_accuracy = 1 − mean| confidence − correct |   (Brier-like)
prediction_stability= 1 − mean( normalised consecutive drift across snapshot series )
```

`ECE = Σ_bins (binCount/N)·| meanConfidence_bin − accuracy_bin |`.
Stability per series = `1 − meanStep / scale`, `scale = max(1, mean|values|)`.

## 5. Calibration metrics

`accuracy`, `precision`, `recall`, `f1_score`, `calibration_score`, `confidence_accuracy`, `false_positive_rate`, `false_negative_rate`, `prediction_stability` — each `null` when there isn't enough evidence (never faked). Over/under-confidence is flagged by comparing mean stated confidence vs accuracy (`confidenceFlag ∈ OVERCONFIDENT | UNDERCONFIDENT | STABLE`).

**Validation mapping (Market Acceptance):** prediction comes from `market_acceptance_scores` (`LIKELY_ACCEPTED / LIKELY_MARKET_EXIT / OFFICIAL_TRANSACTION_FOUND` ⇒ positive), the later outcome from `market_listing_lifecycle.current_state` (`LIKELY_SOLD / LIKELY_REMOVED / DISAPPEARED` ⇒ left market). Only predictions older than the window count, and only those with an observable lifecycle row. `UNCERTAIN` abstentions are excluded.

**Recommendations (advisory only — NEVER applied):** `INCREASE_THRESHOLD` (high FPR) · `LOWER_THRESHOLD` (high FNR) · `COLLECT_MORE_EVIDENCE` (sample < 20) · `INCREASE_SAMPLE` (sample < 50) · `REVIEW_WEIGHT_PROFILE` (low calibration/stability) · `NONE`.

## 6. Example calibration report

```
Market Acceptance · window 30 days · sample 412
  accuracy 0.91 · FPR 0.04 · FNR 0.07
  calibration 0.93 · confidence-accuracy 0.90
  recommendation: NONE (within tolerances) — measure only, model unchanged.

Zone Dominance · window 30 days · sample 0
  prediction_stability —  (only single snapshots available)
  recommendation: COLLECT_MORE_EVIDENCE — not enough evidence yet.
```

(Headline rendered in Hebrew in `metadata.headline`; figures shown are illustrative of the output shape, computed only from real evidence.)

## 7. QA report

`npx tsx -e "import {runCalibrationQa} from './src/lib/mai-calibration/qa'…"` → **9/9 PASS**:

1. Perfect predictions → accuracy high (1.0, FPR/FNR 0, NONE) ✅
2. False positives → detected (FPR 0.6 ⇒ INCREASE_THRESHOLD, +Δthr) ✅
3. False negatives → detected (FNR 0.8 ⇒ LOWER_THRESHOLD, −Δthr) ✅
4. Weak sample → low confidence + COLLECT_MORE_EVIDENCE ✅
5. Calibration drift → detected (cal 0.55, OVERCONFIDENT, non-NONE) ✅
6. Instability → low stability from drifting series (0.0) ✅
7. Every model evaluated (7 in → 7 out, name-sorted) ✅
8. Deterministic rerun → byte-identical ✅
9. No automatic model update (advisory only, no apply hooks) ✅

Gates: `eslint` 0 errors · scoped `tsc` clean.

## 8. Remaining risks

- **History depth:** stability for snapshot models (Gap/Winning DNA/Coach/Zone/Valuation) needs ≥2 time-ordered snapshots per entity. Because those tables upsert one current row per entity, stability is usually reported as *not enough evidence* until a calibration history accumulates — honest, not faked. A dedicated snapshot-history table would deepen these metrics later.
- **Outcome attribution:** Market Acceptance validation infers "left market" from lifecycle state, not a confirmed sale; `OFFICIAL_TRANSACTION_FOUND` is the strongest signal. Treated as observational.
- **Strategy validation:** reported as an observed improvement rate only — never as causation, per spec.

## 9. Production readiness

Migration is additive and idempotent (org-scoped, RLS read, service-role writes). The engine is pure/deterministic and runs best-effort after MAI-12 in both sync paths, failure-isolated (a calibration error never breaks a sync). No env, no UI, no model mutation. **Ready** — apply `20260802120000_mai_model_calibration.sql` in Supabase; calibration rows populate on the next sync.
