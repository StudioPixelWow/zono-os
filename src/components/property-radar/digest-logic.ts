// ============================================================================
// ZONO Property Radar™ — DIGEST pure logic (P9.1B). No React, no I/O — so it is
// unit-testable for every batch size (0/1/5/30/100/250) and every lifecycle
// event (fetch / acknowledge / new-arrival / quiet). The hook is a thin shell
// over this; the QA drives THIS directly.
// ============================================================================
import type { PropertyRadarAlertDTO } from "@/lib/property-radar/alerts/types";

/** RTL-correct, singular/plural Hebrew label for a batch size. */
export function digestCountLabel(n: number): string {
  if (n <= 0) return "";
  if (n === 1) return "הזדמנות חדשה אחת";
  if (n === 2) return "2 הזדמנויות חדשות";
  return `${n.toLocaleString("he-IL")} הזדמנויות חדשות`;
}

/** Most common non-empty city among preview alerts (for the digest copy). */
export function deriveCity(alerts: Pick<PropertyRadarAlertDTO, "metadata">[]): string | null {
  const counts = new Map<string, number>();
  for (const a of alerts) {
    const c = (a.metadata?.city ?? "").trim();
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [c, n] of counts) if (n > bestN) { best = c; bestN = n; }
  return best;
}

// ── Digest state machine ────────────────────────────────────────────────────
// The whole "why doesn't it flood / drain / replay" contract lives here.

export interface DigestState {
  /** EXACT count of NEW (unseen) opportunities. */
  count: number;
  /** Newest unseen alert id (identity of the current batch). */
  topId: string | null;
  /** Newest id at the moment the user last acknowledged (viewed/postponed). */
  ackTopId: string | null;
}

export const INITIAL_DIGEST_STATE: DigestState = { count: 0, topId: null, ackTopId: null };

export type DigestEvent =
  | { type: "fetch"; count: number; topId: string | null }
  | { type: "insert"; id: string }
  | { type: "acknowledge" };

export function digestReducer(state: DigestState, event: DigestEvent): DigestState {
  switch (event.type) {
    case "fetch":
      // Server reconcile: adopt the authoritative count + batch identity.
      return { ...state, count: event.count, topId: event.topId };
    case "insert":
      // A genuinely-new realtime insert bumps the count + becomes the batch top.
      return { ...state, count: state.count + 1, topId: event.id };
    case "acknowledge":
      // Optimistically drain + remember this batch so a pre-commit re-fetch of the
      // SAME batch cannot replay it. A later, different top id re-shows the digest.
      return { count: 0, topId: state.topId, ackTopId: state.topId };
    default:
      return state;
  }
}

/**
 * The single source of truth for whether the ONE digest banner is visible.
 * Visible only when: alerts are enabled (not quiet), there is at least one unseen
 * opportunity, and the current batch has NOT already been acknowledged.
 */
export function isDigestVisible(state: DigestState, isQuiet: boolean): boolean {
  return !isQuiet && state.count > 0 && state.topId !== null && state.topId !== state.ackTopId;
}
