# ENGINE_EXECUTION_REPORT

_Phase 10 · Part C — How each intelligence engine is executed. Inspection only._
_Execution modes: **cron** (scheduled), **manual button** (admin/page recompute), **server action** (triggered by a user write), **page load** (computed on render), **never** (no trigger wired)._

## Key facts

- The only scheduled jobs are in `vercel.json`: `external-listings-sync` (`0 2 * * *`) and — **newly scheduled in this phase** — `transactions-refresh` (`0 3 * * *`). Both API routes are `CRON_SECRET`-guarded.
- All **business-intelligence engines** are **manual** (admin "חשב הכל" on `/admin/system-health`, or per-page recompute buttons) — there is **no cron** that keeps them fresh.
- `/admin/system-health` reads `engine_runs` and exposes per-engine + "recompute with deps" + "recompute all" buttons (`src/lib/system/actions.ts`).

## Engine matrix

| Engine | Service file | Execution mode | Cron? | Notes / Risk |
|---|---|---|---|---|
| **Decision Intelligence** | `src/lib/decision-intelligence/service.ts` | Manual button + page-load read | ❌ | Aggregates other brains; stale until recompute. **MEDIUM.** |
| **Match Intelligence** | `src/lib/matching-intelligence/service.ts` | Manual button (`recalcMatchesAction`) + server action (buyer matches tab refresh) | ❌ | Matches not refreshed on new property/buyer automatically. **MEDIUM.** |
| **Market Intelligence** | `src/lib/market/service.ts` | Manual button + page-load read; data depends on transactions | ❌ direct (indirectly via transactions cron) | Heatmap stale without recompute. **MEDIUM.** |
| **Reputation** | `src/lib/reputation/service.ts` | Manual button | ❌ | Recompute-on-demand only. **LOW-MEDIUM.** |
| **Routing** | `src/lib/routing/service.ts` | Manual button (twin recompute + route leads) | ❌ | Agent twins stale until recompute. **MEDIUM.** |
| **Forecast** | `src/lib/forecast/service.ts` | Manual button | ❌ | Pipeline snapshot on demand. **LOW-MEDIUM.** |
| **Territories** | `src/lib/territory/service.ts` | Manual button | ❌ | Depends on graph + transactions. **MEDIUM.** |
| **Marketing** | `src/lib/marketing/service.ts` | Manual button | ❌ | On-demand. **LOW-MEDIUM.** |
| **Competitor Intelligence** | `src/lib/competitor*/service.ts` | Manual button | ❌ | On-demand + manual competitor data. **MEDIUM.** |
| **Knowledge Graph / Relationships** | `src/lib/graph/service.ts` | Manual button ("חשב קשרים") | ❌ | On-demand. **LOW.** |
| **Journeys** | `src/lib/journey-intelligence/service.ts` | **Server action — auto-created on entity create** (PHASE 3) + manual recompute | ❌ cron | Best path: real-time on create. **LOW.** |
| **External Listings sync** | `src/lib/external-listings/service.ts` | **Cron** `0 2 * * *` + manual "Sync Now" | ✅ | Needs `APIFY_TOKEN`. **MEDIUM (key).** |
| **Transactions refresh** | `src/lib/transactions/service.ts` | **Cron** `0 3 * * *` (added this phase) + manual | ✅ (now) | Was orphaned (route existed, not scheduled). Needs `APIFY_TOKEN`. **Fixed → LOW.** |

## Findings

1. **The biggest operational gap: no scheduled recompute for the 10 business-intelligence engines.** They are fresh only after a manual "recompute" click. For a live brokerage this means dashboards silently drift stale. **Severity: MEDIUM-HIGH for ongoing operation; LOW for a controlled demo (just click recompute first).**
2. **Orphaned cron fixed:** `transactions-refresh` had a working, guarded route but was missing from `vercel.json` → it never ran. Added a `0 3 * * *` schedule (config-only change). It self-disables without `CRON_SECRET`/`APIFY_TOKEN`, so the addition is safe.
3. **Recommended (not built — out of scope):** add a single nightly "recompute-all-engines" cron route (guarded by `CRON_SECRET`) that calls the existing `recomputeAllEnginesAction` ordering, so intelligence stays fresh without manual clicks. The execution ordering + dependency graph already exist in `src/lib/system/service.ts`.

**Net:** execution is correct and safe but **manual-first**. One nightly engine-recompute cron would move most MEDIUM risks to LOW.
