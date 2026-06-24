# ZONO Price Intelligence — Build Report (Phase 26)

**Date:** 2026-06-24 · **Commit:** `e2fd29b`
**Goal:** a premium AI property-valuation system for brokers (not a calculator):
valuation flow → AI result → comparables → broker's own sales → pricing strategy →
what-if slider → branded seller PDF → send via WhatsApp/Email. RTL, ZONO design.

**Gates:** scoped `tsc --noEmit` → **0 errors** · ESLint → **0 errors** (3 `<img>`
warnings, consistent with the rest of the app).

## Routes
- `/valuation` — landing (title "הערכת שווי חכמה לנכס", CTAs, recent valuations).
- `/valuation/new` — 5-step RTL wizard (מיקום → פרטי נכס → מאפיינים → סריקת שוק → תוצאה).
- `/valuation/[id]` — premium result screen.
- `/properties/[id]/valuation` — hands off to the wizard pre-filled from the property.
- `/valuation-report/[token]` — public, no-auth, branded seller report (print-to-PDF).

## Files added
**DB:** `supabase/migrations/20260735120000_price_intelligence.sql` (7 tables + RLS + indexes + trigger).
**Engine / lib (`src/lib/valuation/`):**
- `types.ts` — all shared types + Hebrew labels + the indicative disclaimer.
- `valuation-engine.ts` — PURE: normalize/validate, similarity, weighted base ₪/m²,
  explainable adjustments, market snapshot, confidence, demand/liquidity/overpricing,
  pricing strategies, what-if, Hebrew explanation.
- `service.ts` — orchestration: create/update draft, run engine over real evidence,
  persist comparables/adjustments/market/broker-sold, read full record, list,
  save-to-property, seller follow-up task.
- `report.ts` — PURE branded HTML report builder (9 sections + disclaimer).
- `report-service.ts` — generate report (token + html snapshot), record sends
  (wa.me / mailto handoff), public read-by-token (service role).
- `actions.ts` — 12 server actions (the 10 required + create-and-run + latest-report).
- `providers/` — `types.ts`, `index.ts` (registry + `gatherEvidence`), `govmap-provider`,
  `tax-authority-provider`, `yad2-provider`, `madlan-provider`, `portal-listings`,
  `zono-internal-provider`, `broker-sold-provider`.
**UI:** `valuation/page.tsx`, `valuation/new/page.tsx` + `ValuationWizard.tsx`,
`valuation/[id]/page.tsx` + `ValuationResultView.tsx`, `properties/[id]/valuation/page.tsx`,
`valuation-report/[token]/page.tsx`.
**Nav:** added `valuation` module to `src/lib/navigation/registry.ts` (מכירות, icon Calculator).

## Migrations added
`20260735120000_price_intelligence.sql` — `property_valuations`, `valuation_comparables`,
`valuation_broker_sold_properties`, `valuation_adjustments`, `valuation_market_snapshots`,
`valuation_reports`, `valuation_report_sends`. Additive + idempotent, org-isolated RLS
(`current_org_id()` + `has_min_role('agent')`), grants, indexes, `updated_at` trigger.

## Result screen (all spec sections present)
Hero value over the property image with glass overlay + confidence bar → 3 KPI cards
(מחיר מומלץ לפרסום / מחיר יעד לסגירה / ביקוש) → AI Insights (positive/negative factors
with % + tooltip) → what-if price slider (probability, days, negotiation risk, demand,
competition) → comparables **carousel** (image, source badge, sold/listing, ₪, ₪/m²,
rooms/m²/floor/distance, similarity) → "נכסים שמכרתי באזור" (or honest empty state) with
the over-market performance line → 3 pricing strategies (שמרני/מאוזן/אגרסיבי, balanced =
recommended) → market pulse → PDF builder (צור PDF / שלח כ-PDF / וואטסאפ / מייל / פגישת
גיוס / תצוגת דוח) + send modal → disclaimer everywhere.

## What is REAL
- **Valuation math** — deterministic, traceable to inputs + evidence; no fabricated ₪/m².
- **GovMap comparables** — real sold rows from `property_transactions` (org's imported feed).
- **Yad2 / Madlan listings** — real active rows from `external_listings` (imported earlier).
- **ZONO internal comps** — real `properties` (org inventory; sold vs active).
- **Broker sold-nearby** — real won `deals` joined to their property location; performance
  vs the **real** market median ₪/m² (null when unknown — never invented).
- **Market snapshot, confidence, strategies, what-if** — computed from the above.
- **Report + sends** — real rows in `valuation_reports` / `valuation_report_sends`; the
  public report renders the stored branded HTML.

## What is STUB / handoff (honest, no fake data)
- **Tax Authority provider** — `not_connected` (no direct API wired; gov deals already
  arrive via GovMap). Documented connect path in the file.
- **Yad2 / Madlan providers** — read previously-imported rows only; **no live scraping**
  here. Empty area → `not_connected`, never demo unless explicitly flagged `is_demo`.
- **Send** — we do **not** auto-send on the broker's behalf. "שלח כ-PDF" prepares the
  report, logs the send event, and returns a `wa.me` / `mailto` deep link the broker
  confirms + sends. PDF generation = branded print view (`window.print()`).

## How to connect real data providers later
1. **Tax Authority direct:** implement the auth'd server call in `tax-authority-provider.ts`,
   map deals → `Comparable{ source:'tax_authority', comparableType:'sold' }`, return `ok`.
2. **Live Yad2/Madlan:** the importers already populate `external_listings`; keep importing
   (external-listings module) and the providers surface them automatically. To call a portal
   live at valuation time, add the fetch inside `portal-listings.ts` (server-only, respecting
   each portal's ToS) and tag rows with `source`.
3. **Geocoding:** set `latitude/longitude` on the valuation input (wizard prefill already
   carries property coords) to enable real distance-weighted similarity + radius filtering.
4. **PDF storage:** to store a real PDF file, render `valuation_reports.html_snapshot`
   through a headless-Chrome service and write the URL to `valuation_reports.pdf_url`.
5. **Real send:** swap the wa.me/mailto handoff for the WhatsApp/Email provider connections
   already in the distribution module, writing `status='sent'` + `sent_at`.

## Safety & legal
Indicative language only ("שווי מוערך", "אינדיקטיבי", "טווח שוק"). The mandatory disclaimer
appears in the result UI, the send modal, and the PDF: *"הדוח מהווה אינדיקציה מקצועית בלבד
ואינו מהווה שמאות מקרקעין או התחייבות למחיר מכירה בפועל."* No official data is fabricated;
demo rows (if ever introduced) carry `is_demo` and a "דמו" badge.

## Supabase
Run `20260735120000_price_intelligence.sql` (additive + idempotent). Provided as text below.
