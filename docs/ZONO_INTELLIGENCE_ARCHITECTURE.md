# ZONO — Intelligence Platform Architecture

The ZONO intelligence platform is a layered, **deterministic-first** system. Every
business number is computed by a deterministic engine; **AI summarizes/explains
only** — it never scores, matches, triggers, or approves.

## Module map

| Layer | Module | Route | Source of truth |
|------|--------|-------|-----------------|
| Ingest | Property Radar connectors (Yad2/Madlan/GovMap via Apify) | — | external listings |
| Cache | **Shared Market Cache** (`market_property_sources`, `market_area_*`) | — | de-duplicated public market |
| Events | Market events diff (`market_property_events`) | — | price drop / removed / back-on-market |
| Match | **Buyer Matching** (`buyer_property_matches`) | — | deterministic compatibility |
| Live | Property Radar Live | `/property-radar` | org-scoped live feed |
| Seller | **Exclusive Acquisition** (`radar_seller_*`) | `/exclusive-opportunities` | seller score / exclusive prob |
| QA | Provider QA (`provider_qa_*`) | `/admin/provider-qa` | data-quality scoring |
| AI | **AI Copilot** (`ai_copilot_cache`) | reusable panel | augmentation only |
| Office | **Office Intelligence** (`office_*`) | `/office-intelligence` | KPIs, leaderboard, forecast |
| Competitor | **Competitor Intelligence** (`radar_competitor_*`) | `/competitor-intelligence` | public-listing inference (estimated) |
| Automation | **Journey Automation** (`journey_*`) | `/journey-automation`, `/journey-builder` | deterministic executor |
| Executive | **Business Intelligence** (`bi_*`) | `/executive-intelligence` | composes all the above |
| Shared | **Analytics Core** (`src/lib/analytics-core`) | — | canonical helpers + DTOs |

## Data flow

```
Apify connectors ─▶ Shared Market Cache ─▶ Events diff ─▶ Buyer Matching ─▶ Alerts
                                   │                              │
                                   ├─▶ Seller (Exclusive Acquisition)
                                   └─▶ Competitor Intelligence (estimated share)
Office Intelligence ◀── reads matches/seller/QA/competitor ──┐
Journey Automation  ◀── consumes trigger context (scores) ───┤
Business Intelligence ◀── composes Office + Journey + Competitor ── AI briefs (summarize only)
```

## Source-of-truth rules
- The deterministic engine that **owns** a number is the only writer of that number.
- Downstream modules **read and compose**; they never recompute another engine's score.
  - Office Intelligence reads matching/seller/QA; Business Intelligence reads Office +
    Journey metrics + Competitor; Journey conditions read scores from the trigger context.
- Market share and forecasts are **labeled estimates** with confidence; never "official".

## Deterministic vs AI boundary
- **Deterministic:** all scoring, matching, forecasting, pipeline, ROI, health, risk,
  market-share, journey condition evaluation + execution.
- **AI (optional, augmentation):** content generation (WhatsApp/email/brief), explanations,
  executive summaries. AI runs with a graceful deterministic fallback (`runCopilot`), is
  cache-aware, and is sandboxed by prompt-safety (`sanitizeContext`/`assertNoSecrets`).
  AI **cannot** trigger a workflow, skip a condition, or approve an execution.

## Cron jobs / scheduled work
- Property Radar sync + market fan-out (per-org, queue-backed) — `mode.ts` jobs/cron.
- Market daily refresh + events reconcile.
- Provider QA (best-effort after sync).
- Office Intelligence snapshot (`runOfficeIntelligenceSnapshotJob`).
- Competitor snapshot (`runCompetitorIntelligenceSnapshotJob`).
- Journey delay queue (`runJourneyDelayQueue`) — durable, idempotent, batched.
- BI daily snapshot (`runBiSnapshotJob`).

## Shared market cache + fan-out
- `market_property_sources` is a **global, de-duplicated** cache (unique `provider+external_id`),
  with no `org_id`. Org relevance is via `org_market_property_links` and operating-city scope.
- Fan-out: one market refresh feeds every org whose operating cities intersect — avoids
  per-org scraping. Credits are budgeted; duplicate scans are avoided.

## Buyer matching
- Deterministic compatibility (budget/rooms/area/type) → `buyer_property_matches`.
- Match level + explanation are deterministic; alerts are built from matches + events.

## Journey automation
- Workflows are versioned DAGs (`journey_workflow_versions`, never deleted). The executor is
  deterministic, idempotent (unique `workflow_id,dedup_key`), retry-safe, with parallel
  split/merge, delays (durable `journey_delayed_actions` queue) and **Simulation Mode**
  (fast-forwards delays, no side effects). Every action is audited (`journey_audit_log`).

## BI snapshots
- `bi_snapshots` stores the daily executive snapshot (KPIs/forecast/pipeline/health/ROI/
  revenue/risk/benchmarks). Heavy historical analytics prefer snapshots; live compose is
  bounded and reuses Office Intelligence (single source of truth). Reports
  (`bi_reports`) export canonical JSON → CSV / Markdown (PDF/Excel downstream).

## Provider QA
- Validates + scores connector output (completeness, duplicates, statistics) into
  `provider_qa_*`. Surfaces a data-quality score; never blocks sync.

## Performance posture
- Heavy pages: one bounded compose per request, batched reads, snapshots for history,
  caps on list sizes (e.g. market sources ≤ 300, competitor listings ≤ 1500).
- Error boundaries isolate widget failures.
- Load simulation (deterministic, in-memory) headline results (single core):
  - Buyer matching ≈ **30M+ pair-scores/sec**; 200k candidate scores ≈ ~6 ms.
  - Seller scoring ≈ **10M/sec**; 100k properties ≈ ~10 ms.
  - Journey executions ≈ **40k full simulations/sec**.
  - 1,000,000 event diffs ≈ ~31 ms (and the real path is queue-parallelizable).
  - Heap delta for the run ≈ ~1–2 MB.

## Known limitations
- Competitor share + BI forecasts are **estimates** (labeled), not official figures.
- Competitor attribution from public listings is partial (no per-agent ground truth).
- Pipeline stages in BI are **derived from current aggregates**, not a historical deal funnel.
- Per-module analytics/permission helpers have not yet fully converged onto `analytics-core`
  (intentional — see the 19.5 stabilization report's convergence backlog).
- Snapshot jobs run per-session org in the current build; multi-tenant batch scheduling is a
  future enterprise concern (interfaces are ready).

## Future compatibility (no business-logic change required)
- Canonical report JSON (`bi_reports.payload`) → Power BI / Looker / public APIs.
- Journey action handler seam → WhatsApp Business API / email / calendar / CRM integrations.
- Analytics-core DTOs → multi-office / national-franchise aggregation layers.
