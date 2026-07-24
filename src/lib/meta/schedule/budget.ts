// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · RATE BUDGET, CONCURRENCY & FAIRNESS
// (PURE). Phase 3B.
// ----------------------------------------------------------------------------
// Bounds how much background publishing may run at once. Three guards, all pure:
//   • a durable fixed-window RATE budget per org/scope (the queue's counterpart
//     to the Phase-3A in-memory limiter — it survives process restarts),
//   • a GLOBAL concurrency cap and a PER-ORG concurrency cap (so one org can
//     never monopolise workers), and
//   • FAIR batch selection: round-robin across orgs by priority then age, so a
//     large backlog in one org does not starve the others.
// Every limit is a bounded constant; no unbounded env value ever feeds these.
// ============================================================================

export interface ConcurrencyLimits { globalMax: number; perOrgMax: number }
/** Conservative, bounded defaults. */
export const DEFAULT_CONCURRENCY: ConcurrencyLimits = { globalMax: 8, perOrgMax: 3 };
/** Largest batch a single dispatch tick will claim. */
export const DEFAULT_DISPATCH_BATCH = 8;

/** Floor `nowMs` to the start of its fixed window (ms epoch). */
export function windowStartMs(nowMs: number, windowSeconds: number): number {
  const w = Math.max(1, Math.floor(windowSeconds)) * 1000;
  return Math.floor(nowMs / w) * w;
}

/** Does a fixed-window rate budget have room for one more unit? */
export function rateBudgetAllows(used: number, limit: number): boolean {
  return used < limit;
}

export interface DispatchCandidate { jobId: string; orgId: string; priority: number; runAfterMs: number }
export interface InFlightState { globalInFlight: number; perOrgInFlight: Readonly<Record<string, number>> }

/** Per-org concurrency headroom given current in-flight + already-selected. */
function orgHeadroom(orgId: string, state: InFlightState, selectedPerOrg: Record<string, number>, perOrgMax: number): number {
  const current = (state.perOrgInFlight[orgId] ?? 0) + (selectedPerOrg[orgId] ?? 0);
  return Math.max(0, perOrgMax - current);
}

/**
 * Select a fair, bounded batch of claimable candidates. Candidates are grouped by
 * org, each group ordered by priority (ascending = more urgent) then age (older
 * runAfter first); we then round-robin one per org per pass, respecting per-org
 * and global concurrency and the batch cap. Deterministic for a given input.
 */
export function selectFairBatch(
  candidates: readonly DispatchCandidate[],
  state: InFlightState,
  limits: ConcurrencyLimits = DEFAULT_CONCURRENCY,
  batchMax: number = DEFAULT_DISPATCH_BATCH,
): DispatchCandidate[] {
  const globalRoom = Math.max(0, limits.globalMax - state.globalInFlight);
  const cap = Math.min(batchMax, globalRoom);
  if (cap <= 0) return [];

  const byOrg = new Map<string, DispatchCandidate[]>();
  for (const c of candidates) {
    const arr = byOrg.get(c.orgId) ?? [];
    arr.push(c);
    byOrg.set(c.orgId, arr);
  }
  // Deterministic org order: by best (lowest) priority then earliest runAfter,
  // then orgId to break ties.
  const orgs = [...byOrg.keys()].sort((a, b) => {
    const ga = byOrg.get(a)!, gb = byOrg.get(b)!;
    const pa = Math.min(...ga.map((c) => c.priority)), pb = Math.min(...gb.map((c) => c.priority));
    if (pa !== pb) return pa - pb;
    const ta = Math.min(...ga.map((c) => c.runAfterMs)), tb = Math.min(...gb.map((c) => c.runAfterMs));
    if (ta !== tb) return ta - tb;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  for (const arr of byOrg.values()) arr.sort((x, y) => (x.priority - y.priority) || (x.runAfterMs - y.runAfterMs) || (x.jobId < y.jobId ? -1 : 1));

  const selected: DispatchCandidate[] = [];
  const selectedPerOrg: Record<string, number> = {};
  const cursor: Record<string, number> = {};
  let progressed = true;
  while (selected.length < cap && progressed) {
    progressed = false;
    for (const orgId of orgs) {
      if (selected.length >= cap) break;
      if (orgHeadroom(orgId, state, selectedPerOrg, limits.perOrgMax) <= 0) continue;
      const arr = byOrg.get(orgId)!;
      const idx = cursor[orgId] ?? 0;
      if (idx >= arr.length) continue;
      selected.push(arr[idx]);
      cursor[orgId] = idx + 1;
      selectedPerOrg[orgId] = (selectedPerOrg[orgId] ?? 0) + 1;
      progressed = true;
    }
  }
  return selected;
}
