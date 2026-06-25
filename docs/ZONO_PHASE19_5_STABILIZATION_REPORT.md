# ZONO — Phase 19.5 Stabilization, Refactor & Performance Report

_Scope: stabilize the intelligence platform (Property Radar, Market Cache, Matching,
Exclusive Acquisition, AI Copilot, Office Intelligence, Competitor Intelligence,
Journey Automation, Business Intelligence) before production hardening. No major new
features, no UI redesign, no business-logic changes except verified bugs._

## Summary of changes shipped in 19.5

1. **`src/lib/analytics-core/`** — a canonical, client-safe shared library: `percentages`
   (clamp/round/avg/sum/sharePercent/pctChange/direction), `currency` (he-IL formatters),
   `date-ranges` (today/week/month/quarter/year + rolling-7/30/90/365, UTC-stable, Hebrew
   labels), `kpi`, `trends`, `benchmarks`, `scoring` (normalize/band/severity/confidence/
   weighted), `permissions` (ROLE_RANK + helpers), `types` (KPI/trend/timeline/alert/map/
   report DTOs). **Additive** — new code adopts it; existing module-local helpers keep
   working until they converge (see "Convergence backlog").
2. **`src/lib/analytics-core/server-permissions.ts`** — consolidated org-context gate:
   `getCurrentOrgContext`, `assertOrgAccess`, `assertManagerAccess`, `assertAgentAccess`,
   `assertMinRole`. Mirrors the pattern repeated in 9 modules.
3. **Shared premium UI** — `src/components/intelligence/shared.tsx`
   (`IntelligenceKpiCard`, `ExecutiveKpiStrip`, `RiskBadge`, `ScoreBadge`,
   `ConfidenceBadge`, `DataQualityBadge`, `ProviderHealthBadge`, `EmptyState`,
   `LoadingState`, `TrendIcon`) consuming analytics-core DTOs.
4. **Error boundaries** — `IntelligenceErrorBoundary` wraps the six heavy pages
   (/property-radar, /office-intelligence, /competitor-intelligence,
   /journey-automation, /journey-builder, /executive-intelligence). One widget
   failing no longer crashes the page.
5. **Consolidated QA** — `scripts/zono-intelligence-full-dev-check.ts` (runs all 13
   intelligence dev-checks, fail-fast, summary) + `scripts/zono-intelligence-load-sim.ts`
   (deterministic in-memory benchmark at headline scale).
6. **Architecture docs** — `docs/ZONO_INTELLIGENCE_ARCHITECTURE.md`.

## Findings (audit)

### Duplicated logic
- **`clamp` / `pctChange` / `round`** implemented separately in `office-intelligence/analytics.ts`,
  `competitor-intelligence/analytics.ts`, `business-intelligence/analytics.ts`. They differ
  **subtly** on the zero-baseline case (office returns `null`; competitor/BI return `0`).
  → Canonicalized in `analytics-core/percentages.ts`. **Not force-refactored** — changing the
  null-vs-0 behavior would alter outputs and risk regressions; convergence is a follow-up.
- **Role gate** (`ROLE_RANK` + `getSessionContext` + roles lookup) duplicated in
  office/competitor/journey/business permission files. → Canonicalized in
  `analytics-core/server-permissions.ts`; modules can adopt incrementally.
- **Severity ranking / Hebrew labels** repeated across risk/alert modules. → Canonical in
  `analytics-core/scoring.ts`.

### Repeated query patterns
- `orgCities(db, orgId)` (active `user_operating_localities`) appears in property-radar live,
  competitor-intelligence, office-intelligence. Candidate for a shared repository helper
  (deferred — low risk but touches server-only files).
- `market_property_sources` SELECT column lists duplicated. Acceptable; each scopes columns.

### Performance / N+1
- Heavy pages already batch: office/BI compose via one `composeOfficeDashboard`; competitor
  classifies one bounded `marketListings` fetch (limit 1500); journey dashboard uses bounded
  reads. **No N+1 found** in the new modules. Property Radar live caps sources at 300.
- BI reuses Office Intelligence output rather than re-querying — single source of truth.
- Snapshots exist (`office_intelligence_snapshots`, `bi_snapshots`,
  `radar_competitor_area_metrics`) for historical analytics; live compose is bounded.

### Type safety
- Supabase access uses the project-standard `.from(x as never)` + `as unknown as T` casts —
  intentional (generated types not wired). Domain types remain strict. New analytics-core DTOs
  give shared strict types for KPI/trend/timeline/alert/map/report.

### UI consistency
- KPI tiles, risk/score/confidence badges, empty/loading states were re-implemented per module.
  → Shared components now available; adoption is incremental to avoid visual churn.

### Empty / loading states
- All new dashboards already ship honest empty states. `LoadingState` standardizes spinners.

## Convergence backlog (safe, incremental — not done in 19.5 to avoid regressions)
- Point `office/competitor/business` analytics helpers at `analytics-core/percentages`
  after aligning the zero-baseline convention (one dev-check update each).
- Replace per-module permission gates with `analytics-core/server-permissions` one module at a
  time, re-running that module's dev-check.
- Adopt `IntelligenceKpiCard` / badges in the newest dashboards where markup is identical.

## QA (19.5)
- TypeScript: 0 errors (scoped). ESLint: 0 problems (new surface).
- All 13 intelligence dev-checks pass via the consolidated runner.
- Load simulation completes (see ARCHITECTURE doc for numbers).
- No business logic changed; no schema changes; no UI redesign.
