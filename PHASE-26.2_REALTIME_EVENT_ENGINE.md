# PHASE 26.2 — Realtime Event Engine + Global System Refresh

**Status:** ✅ Complete · scoped `tsc` clean · `eslint` 0 errors · committed (`3608402`)

## What was built

Two connected capabilities, both additive and org-scoped:

1. **Realtime Event Engine** — the authenticated app now listens to Supabase realtime and refreshes affected views automatically, so a new alert, price drop, or orchestrator run shows up without a manual reload.
2. **Global sticky "רענן מערכת" button** — a premium purple pill, fixed to the physical left of every authenticated page, that force-runs the full orchestration pipeline from anywhere.

## Files

### Created — `src/lib/realtime/`
- `types.ts` — `RealtimeEvent`, `RealtimeTableSub { table, event?, orgColumn }`, `OrchestratorLiveStatus`.
- `channels.ts` — channel-name builders + `ZONO_REFRESH_SUBS` (the org-scoped subscription set).
- `useZonoRealtime.ts` — core hook: subscribes one channel to N org-scoped tables, invokes `onSignal` per change, 30s poll fallback when realtime is not `SUBSCRIBED`, cleans up on unmount, re-subscribes only on org/channel change.
- `useOrchestratorRealtime.ts` — returns the latest `zono_orchestrator_runs` status for live progress.
- `usePropertyEventsRealtime.ts` — debounced wrapper (collapses a burst into one `onChange` per 3s).
- `index.ts` — re-exports.

### Created — components
- `src/components/realtime/ZonoRealtimeProvider.tsx` — mounts once, wires `usePropertyEventsRealtime(org.id, () => router.refresh())`, renders nothing.
- `src/components/orchestrator/StickySystemRefreshButton.tsx` — the sticky button (phases: idle / running / success / partial / failed / skipped, transient toast, double-submit guard).

### Modified
- `src/lib/orchestrator/actions.ts` — added `runManualSystemRefreshAction()` (+`skippedReason`), runs the orchestrator with `skipExternalSync: true, force: true`.
- `src/app/(app)/layout.tsx` — mounts `<ZonoRealtimeProvider />` + `<StickySystemRefreshButton />` (authenticated group only).
- `src/app/globals.css` — `.zono-sysrefresh*` block (purple pill, glow, spinner keyframe, toast, mobile icon-only, focus-visible).

## How realtime works

`ZonoRealtimeProvider` subscribes a single Supabase channel — using the browser **anon** client (never service-role) — to `ZONO_REFRESH_SUBS`:

| Table | Event | Org column |
|---|---|---|
| `property_alerts` | INSERT | `org_id` |
| `property_alerts` | UPDATE | `org_id` |
| `zono_orchestrator_runs` | * | `organization_id` |

Every postgres_changes payload is filtered server-side by `col=eq.<orgId>`, so an org only ever sees its own rows (no cross-tenant leakage). A burst of rows is debounced into **one** `router.refresh()` per 3s, which re-runs the server components and updates the dashboard / Property Radar / Market / Command widgets in place. If the realtime socket isn't connected, a **30s poll** triggers the same refresh as a fallback.

Note: `market_property_events` / `market_property_sources` are **shared-cache** tables with no org column, so they are intentionally **not** subscribed — their downstream effect reaches the user through the org-scoped `property_alerts` rows the orchestrator writes.

## How the sticky button works

Clicking "רענן מערכת" calls `runManualSystemRefreshAction()`, which runs `runOrchestratorForSession("manual_sync", { skipExternalSync: true, force: true, source: "sticky_system_refresh" })` — the **full** pipeline (bridge → market snapshots → decision brain → events → alerts → revalidation) **minus** the heavy provider scrape. The scrape stays with the chunked "סנכרן עכשיו" flow + nightly cron so this button never hits a serverless timeout.

It `force`-runs but still respects the per-org lock: if a run is already active, the action returns `skipped` and the button shows "כבר מתבצע" instead of starting a duplicate. On success it shows either "המערכת רועננה בהצלחה" or, when events/alerts were produced, "נמצאו X אירועים חדשים · נוצרו Y התראות", then calls `router.refresh()`. States reset after 4s. A `busyRef` guard blocks double-clicks during the request.

## Manual test steps

1. Sign in, land on the dashboard. Confirm the purple "רענן מערכת" pill sits on the left, vertically centered-lower; on mobile it collapses to an icon at bottom-left.
2. Click it → spinner + "מרענן…", then a success/partial toast; the page refreshes. Click again immediately → "כבר מתבצע" (lock respected).
3. With the app open, insert a row into `property_alerts` for your org (or run the master cron) → within a few seconds the dashboard refreshes on its own (no reload).
4. Temporarily block the realtime socket → confirm the 30s poll still refreshes.

## Supabase tables to inspect
- `zono_orchestrator_runs` — one row per run (status, steps, timing).
- `zono_orchestrator_locks` — per-org lock; `skipped` means an unexpired lock was present.
- `property_alerts` — the org-scoped rows that drive realtime refresh.

Ensure realtime is enabled for `property_alerts` and `zono_orchestrator_runs` in the Supabase dashboard (Database → Replication) for live (non-poll) updates.

## Limitations / risks
- Realtime depends on those two tables being added to the `supabase_realtime` publication; without it the 30s poll still works (graceful degradation).
- Debounce is fixed at 3s and poll at 30s — fine for current load; revisit if alert volume grows.
- The button skips the scrape by design — discovering brand-new external listings still requires "סנכרן עכשיו" or the cron.

## Verdict
**Production-ready.** Additive, typed, RTL, org-scoped, lock-safe, no service-role in the client, no existing flow changed.
