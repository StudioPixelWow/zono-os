// ============================================================================
// ⏱️ Pure time-budget + classification decisions — shared by the hourly-watch
// route, the org sync, and the A–J harness (so tests exercise the real shipped
// logic). No deps, no I/O, deterministic.
// ============================================================================

/** Enrichment may run only while now is safely before the deadline (minus a
 *  reserve to finish/defer cleanly). Null deadline = unbounded (dev/manual). */
export function enrichmentBudgetOk(deadline: number | null | undefined, reserveMs: number, now: number): boolean {
  if (deadline == null) return true;
  return now < deadline - reserveMs;
}

/** True once the hard application deadline has passed. */
export function pastDeadline(deadline: number | null | undefined, now: number): boolean {
  return deadline != null && now > deadline;
}

export type OrgBudgetDecision = "run" | "defer" | "stop";

/**
 * Per-org start decision. `run` when enough budget remains to finish the org
 * (padded historical estimate); `defer` when this org won't fit but smaller ones
 * behind it might; `stop` when the invocation is essentially out of budget.
 */
export function orgBudgetDecision(params: { remainingMs: number; estMs: number; minStartMs: number; safety: number; deadlineMs: number }): OrgBudgetDecision {
  const { remainingMs, estMs, minStartMs, safety, deadlineMs } = params;
  if (remainingMs < minStartMs) return "stop";
  const needed = Math.min(deadlineMs, Math.max(minStartMs, estMs * safety));
  return remainingMs < needed ? "defer" : "run";
}

/**
 * A listing is a PRIVATE (owner) opportunity ONLY when the source explicitly
 * states there is no agent. UNKNOWN (null/undefined) must NEVER be treated as
 * private. Mirrors the sync's `privateOwner` rule.
 */
export function isPrivateOpportunity(hasAgent: boolean | null | undefined): boolean {
  return hasAgent === false;
}
