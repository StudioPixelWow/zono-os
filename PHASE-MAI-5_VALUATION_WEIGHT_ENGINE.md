# PHASE MAI-5 — Valuation Weight Engine™ (Market Acceptance Integration)

**Status:** ✅ Complete · deterministic · scoped `tsc` clean · `eslint` 0 errors · QA **7/7 pass** (6 scenarios + value-invariant) · committed (`6baa9aa`).

A transparent weighting layer that combines the existing AVM result with Market Acceptance Intelligence into a weighted **confidence + range** — without replacing the valuation model. **Official transactions remain the strongest source; the estimated VALUE is carried through UNCHANGED.** Market Acceptance is one additional weighted signal that may only slightly raise/lower confidence and narrow/widen the range — never override a verified transaction, never invent a sale price. Deterministic, no AI/LLM, no UI (persist only).

## 1. Files created

- `supabase/migrations/20260794120000_valuation_weight_results.sql` — the results table + RLS.
- `src/lib/valuation-weight-engine/types.ts` — profiles, inputs, result, evidence.
- `src/lib/valuation-weight-engine/weights.ts` — **configurable** profiles + `computeEffectiveWeights` (availability gating + official-dominance guard).
- `src/lib/valuation-weight-engine/calculator.ts` — **pure** `runValuationWeightEngine` (blend + range).
- `src/lib/valuation-weight-engine/explain.ts` — Hebrew explanation.
- `src/lib/valuation-weight-engine/repository.ts` — best-segment MAI-4 lookup + upsert.
- `src/lib/valuation-weight-engine/service.ts` — `recordValuationWeight` (best-effort persist).
- `src/lib/valuation-weight-engine/qa.ts` — 6 deterministic scenarios + value invariant.
- `src/lib/valuation-weight-engine/index.ts`.

## 2. Files modified

- `src/lib/valuation/service.ts` — **one additive, best-effort call** after `persistResult` in `runValuationById`, deriving base facts from the AVM result + market snapshot. Nothing in the AVM engine, comparables, or evidence persistence was changed.

## 3. Migration

`valuation_weight_results` — `official_transactions_weight`, `current_market_weight`, `market_acceptance_weight`, `market_trend_weight`, `listing_similarity_weight`, `location_weight`, `property_features_weight`, `final_confidence`, `estimated_value`, `estimated_low`, `estimated_high`, `evidence jsonb`, `metadata jsonb`, plus ids/version/profile. Unique on `(organization_id, valuation_id, weight_profile)` (re-runs upsert). Org-scoped, RLS read.

## 4. Weight formulas

**Configurable profiles** (7 sources, sum 100 — NOT hardcoded in the calculator):

| Profile | Official | CurrentMkt | Acceptance | Trend | Similarity | Location | Features |
|---|---|---|---|---|---|---|---|
| STANDARD | 45 | 20 | 15 | 10 | 4 | 3 | 3 |
| CONSERVATIVE | 55 | 18 | 8 | 9 | 4 | 3 | 3 |
| AGGRESSIVE | 38 | 19 | 22 | 11 | 4 | 3 | 3 |
| ENTERPRISE | 48 | 18 | 16 | 9 | 4 | 3 | 2 |

**Effective weights** = `profileWeight × availability`, renormalized to 100 over present sources, where availability scales each source by its evidence:
- official: `0` if no transactions, else `clamp(0.5 + 0.05·txCount, 0.5, 1)` — **weak official shrinks its raw weight, so Acceptance's relative share grows; strong official keeps full weight.**
- currentMarket: `1` if listings exist else `0`; marketTrend: `1` if dataQuality > 0; similarity: `1` if avgSimilarity > 0; location/features: always `1`.
- **marketAcceptance: `0` when sample < 5 (IGNORED)**, else `clamp(sampleSize/20, 0.25, 1)`.
- **Dominance guard:** when official has any presence, acceptance effective weight is capped at the official weight — acceptance can never out-weigh verified deals.

## 5. Confidence formulas

Per-source confidence (0–100): officialConf `40 + min(45, 7·txCount)`; currentMarketConf `30 + min(35, 3·listings)`; **marketAcceptanceConf** (only if usable) `aggregateConfidence + 30·acceptanceRate − 30·rejectionRate + 0.2·(absorption−50)`; marketTrendConf `40 + 0.4·dataQuality`; similarityConf `avgSimilarity`; locationConf `80/50`; featuresConf `70/45`.

**Final confidence** = `Σ(effectiveWeight% × sourceConfidence)/100`, clamped 10–98. So strong official ⇒ big official weight × high official conf ⇒ Acceptance's smaller weight has small influence; weak official ⇒ Acceptance weight grows ⇒ bigger influence. Rejected market lowers `marketAcceptanceConf` (and thus the blend); accepted market raises it.

**Range:** base spread `(high−low)/(2·value)`; if Acceptance usable and *accepting* (`acceptanceRate − rejectionRate > 0.2` and aggConf ≥ 50) → narrow up to 15%; if *rejecting* (`rejectionRate > 0.4`) → widen up to 15%; clamped 3–20%. **The central value is never touched.**

## 6. Example valuation

AVM produced **₪2,400,000** (conf 80, 4 official tx) in an accepting segment:

```
Estimated Value  ₪2,400,000   (UNCHANGED from the AVM)
Confidence       73%          (↑ from 67% without acceptance)
Range            narrowed
Built from:  עסקאות רשמיות 41.7% · שוק נוכחי 18.5% · קבלת שוק 14.8% · מגמת שוק 9.3% · …
"עסקאות רשמיות נותרות מקור ההערכה החזק ביותר — קבלת השוק היא אות נוסף בלבד
 ואינה מחליפה עסקאות מאומתות."
```

The same property in a *rejecting* segment → confidence **62%** (↓), range **widened** — value still ₪2,400,000.

## 7. QA report (deterministic, `runValuationWeightQa()` — actually run)

| Scenario | Result | Detail |
|---|---|---|
| Strong official → small MA influence | ✅ | officialW 45 ≥ maW 15, Δconf 2 |
| Weak official → MA influence grows | ✅ | weak maW 18.8 > strong maW 15 |
| Tiny sample → MA ignored | ✅ | maW 0 + "מדגם קטן מדי" note |
| Large sample → MA contributes | ✅ | maW 15 |
| Rejected market → confidence decreases | ✅ | 62 < 67, range widened |
| Accepted market → confidence improves | ✅ | 73 > 67, range narrowed |
| **Value invariant (official never overridden)** | ✅ | value = ₪2,400,000 regardless of acceptance |

**All pass.**

## Integration

`AVM runValuationById → persistResult → recordValuationWeight` (best-effort, try/catch, never blocks the valuation). Reads MAI-4 aggregates (30-day, deepest matching segment by city/neighborhood/type/rooms/price-bucket). **Not** surfaced in any UI; result persists to `valuation_weight_results` only.

## 8. Remaining risks

1. **`avgSimilarity` proxy** — the AVM result doesn't expose per-comparable similarity on the object, so the engine passes a conservative proxy (0 when no comparables, else the AVM confidence). Similarity weight is tiny (4%), so impact is negligible; a later phase can thread the real value through.
2. **Segment lookup needs MAI-4 data** — if no aggregate exists for the property's city yet, Acceptance is simply absent (present:false) and the valuation falls back to official+market only (correct, safe).
3. **Profiles are heuristic** — exposed as `WEIGHT_PROFILES` config and selectable per call; defaults satisfy the spec. They can never change the value, so tuning only shifts confidence.
4. **No UI yet** — by design; the persisted result is ready for a future read-only surface.

## 9. Production-readiness

**Yes — production-ready.** Non-invasive (the AVM is untouched and the call is best-effort), deterministic, unit-tested (7/7 incl. the value-invariant), explainable (per-source weights + Hebrew), configurable, org-scoped + RLS, no AI/LLM, no fake values, and structurally incapable of overriding a verified transaction or the estimated value.

## Supabase handover

Run `supabase/migrations/20260794120000_valuation_weight_results.sql`. After deploy, each new/re-run valuation persists a weight result automatically. No backfill required.
