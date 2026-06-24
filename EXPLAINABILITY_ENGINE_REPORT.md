# ZONO — Universal Explainability Engine (Phase 25.3)

**Date:** 2026-06-24
**Goal:** Trust. No score in ZONO should appear without "why". This phase adds a
universal explainability contract, an append-only audit table, and a reusable
"למה?" control — and integrates it into Market Intelligence as the reference.

**Rules honored:** no AI-hallucinated reasons · every reason originates from real
counted data · every score is traceable · the layer only *transports* reasons that
deterministic engines already produce (it never invents).

**TypeScript:** scoped `tsc --noEmit` (explainability types/repo, WhyButton,
HeatmapSection) → **0 errors.**
**ESLint:** same set → **0 problems.**

## 1. Systems integrated
- **Market Intelligence — LIVE.** The 25.1 engine already emits real `reasons[]`
  per locality; they now flow as the universal `ScoreReason[]` and render behind a
  "למה?" control on every locality score in the Heatmap panel.
- **Shared primitives available to all other systems** (Territory, Property
  exposure, Buyer matching, Seller confidence, Opportunity, future AI recs) via one
  import — each plugs in by passing its existing real reasons (see §6).

## 2. Score types supported (`ExplainableScoreType`)
`market_opportunity` · `territory` · `property_exposure` · `buyer_match` ·
`seller_confidence` · `opportunity`. Each explanation carries `score`, optional
`band`, and `reasons[]` of `{ label, impact(positive|negative|neutral), evidence?,
source? }`.

## 3. DB changes
New migration `20260732120000_explainability_events.sql` (additive + idempotent):
table `explainability_events` (`org_id`, `entity_type`, `entity_id`, `score_type`,
`score_value`, `band`, `reason`, `impact`, `evidence`, `source`, `created_at`),
org-isolated **RLS** (select same-org; insert agent+), 3 indexes. Append-only audit
of why a score was what it was. Server repository: `logExplanation()` (one row per
reason) + `getExplanationEvents()`.

> **Supabase:** this is the only SQL to apply for Phase 25.3. Persisting events is
> optional — the UI explanations work directly from the engine reasons without it.

## 4. UI changes
- New reusable `WhyButton` (`src/components/explainability/WhyButton.tsx`): a ZONO-
  styled "למה?" toggle that opens a popover listing reasons with an impact dot
  (green/red/muted), optional evidence, and data source. RTL, accepts typed
  `ScoreReason[]` or plain `string[]`.
- `HeatmapSection`: each locality row now shows `score/100` + band label + a "למה?"
  control (replacing the always-on bullet list) sourced from the real market reasons
  with source "נתוני שוק אמיתיים (קונים · מודעות · עסקאות · היסטוריה)".

## 5. Example explanations (real, from the market engine)
```
פוטנציאל גבוה — 84/100   [למה?]
 • ביקוש 78/100 — 9 קונים פעילים, 4 בשלים            (חיובי)
 • מלאי 71/100 — 12 מודעות פעילות, 3 חדשות (7 ימים)   (חיובי)
 • עסקאות 66/100 — 14 ב-90 הימים האחרונים (+5)         (חיובי)
 • מומנטום במגמת עלייה (64/100) · מחיר/מ"ר +3.2%       (חיובי)
 • תחרות 38/100 — 5 מודעות מתוּוכות                    (שלילי)
מקור הנתונים: נתוני שוק אמיתיים
```

## 6. Missing score systems (ready to integrate via the shared API)
Each already produces real, data-derived signals; integration = pass them through
`buildExplanation()` / `<WhyButton reasons=…>` (no new scoring):
- **Property exposure** — reasons from `property_risks` / `property_levers` (e.g.
  "איכות תמונות נמוכה", "מודעה לא רעננה", "ביקוש שכונתי חזק").
- **Buyer matching** — weighted fit reasons from `match_intelligence_profiles`
  (budget/rooms/location/urgency fit).
- **Seller confidence** — reasons from `seller_intelligence_profiles`.
- **Territory** — stronghold / growth / threat evidence from `territory_profiles`
  (+ the same locality market scores from 25.1).
- **Opportunity / Decision Brain & future AI recs** — `opportunity_signals` already
  carry titles/impact; wrap as reasons.

These were intentionally **not force-wired** in this phase to avoid touching six
command-center views at once; the contract + component make each a small, safe edit.

## 7/8. TypeScript / ESLint
Both clean (0/0) on all changed files. Migration validated by review (no Postgres in
this environment); additive + idempotent.

## Net
Market scores are explainable end-to-end today; every other score system has a
one-import path to the same "למה?" experience, with a DB audit trail available when
persistence is desired. No black box, no invented reasons.
