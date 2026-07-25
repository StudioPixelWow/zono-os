// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · BOUNDED POLLING POLICY (PURE). Phase 5.
// ----------------------------------------------------------------------------
// Deterministic, policy-aware polling bounds. Webhooks are the preferred low-latency
// path; polling exists ONLY for backfill / gap-fill / reconciliation / surfaces
// without full webhook coverage. Everything here is BOUNDED: small page limits, a
// max page + record budget per execution, a bounded backfill window, and a DECAYING
// idle cadence so an inactive source is never polled frequently forever. No full
// scan, no unbounded loop. Pure (drives QA).
// ============================================================================

export const LISTENING_PAGE_LIMIT = 25;          // records per provider page (small)
export const LISTENING_MAX_PAGES = 3;            // pages per execution (bounded)
export const LISTENING_MAX_RECORDS = 200;        // records per execution (bounded)
export const BACKFILL_MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;   // 30d backfill floor
const MIN_CADENCE_MS = 5 * 60_000;               // active source, most frequent
const MAX_CADENCE_MS = 6 * 60 * 60_000;          // inactive source, least frequent (still bounded)

/** Next poll time: decays toward MAX when a source keeps coming up empty. */
export function nextPollDelayMs(input: { consecutiveEmptyPolls: number; hadActivity: boolean; retryAfterMs?: number | null }): number {
  if (input.retryAfterMs && input.retryAfterMs > 0) return Math.min(input.retryAfterMs, MAX_CADENCE_MS);
  if (input.hadActivity) return MIN_CADENCE_MS;
  const decayed = MIN_CADENCE_MS * Math.pow(2, Math.max(0, input.consecutiveEmptyPolls));
  return Math.max(MIN_CADENCE_MS, Math.min(MAX_CADENCE_MS, decayed));
}

/** Whether another page may be pulled within this execution's budget (bounded). */
export function canPullMore(state: { pagesPulled: number; recordsPulled: number; pageBudget: number; recordBudget: number }): boolean {
  return state.pagesPulled < Math.min(state.pageBudget, LISTENING_MAX_PAGES) && state.recordsPulled < Math.min(state.recordBudget, LISTENING_MAX_RECORDS);
}

/** Bounded backfill floor — never pulls older than the window. */
export function backfillFloorIso(nowMs: number, requestedOldestIso: string | null): string {
  const floorMs = nowMs - BACKFILL_MAX_WINDOW_MS;
  const requested = requestedOldestIso ? Date.parse(requestedOldestIso) : NaN;
  const oldest = Number.isFinite(requested) ? Math.max(requested, floorMs) : floorMs;
  return new Date(oldest).toISOString();
}
