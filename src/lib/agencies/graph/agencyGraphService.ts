// ============================================================================
// ZONO — Agency Knowledge Graph service (Phase 26.3, SERVER-ONLY).
// Orchestrates a graph (re)build for an agency: scan → upsert → soft-deactivate,
// then derive timeline events + signals from what changed (recorded on the
// existing agency_timeline / agency_signals tables). Exposes the scoring hooks
// Phase 26.4 will consume. No UI.
// ============================================================================
import "server-only";
import { buildAgencyGraphForAgency } from "./agencyGraphBuilder";
import { getAgencyAreaFootprint } from "./agencyGraphQueries";
import { detectTimelineEvents, detectSignals } from "./agencyGraphTypes";
import { addTimelineEvent } from "../timelineRepository";
import { createSignal } from "../signalRepository";
import type { AgencyAreaFootprint } from "./agencyGraphTypes";

export interface UpdateAgencyGraphResult {
  agencyId: string;
  created: number;
  updated: number;
  deactivated: number;
  relationshipsDetected: number;
  areasDetected: number;
  timelineEventsCreated: number;
  signalsCreated: number;
}

export const AgencyGraphService = {
  /**
   * Rebuild the graph for one agency and emit derived timeline events + signals.
   * Idempotent: re-running produces no duplicate edges and (because events are
   * derived from BEFORE→AFTER diffs) no duplicate events when nothing changed.
   */
  async updateAgencyGraph(agencyId: string): Promise<UpdateAgencyGraphResult> {
    const res = await buildAgencyGraphForAgency(agencyId);

    const events = detectTimelineEvents(res.before, res.after);
    const signals = detectSignals(res.before, res.after);

    let timelineEventsCreated = 0;
    for (const e of events) {
      await addTimelineEvent({ agencyId, eventType: e.eventType, title: e.title, description: e.description, metadata: e.metadata }).then(() => { timelineEventsCreated++; }).catch(() => {});
    }
    let signalsCreated = 0;
    for (const s of signals) {
      await createSignal({ agencyId, signalType: s.signalType, severity: s.severity, title: s.title, description: s.description, metadata: s.metadata }).then(() => { signalsCreated++; }).catch(() => {});
    }

    // Scoring hook (Phase 26.4 will consume; today this is a no-throw stub).
    await onAgencyGraphUpdated(agencyId).catch(() => {});

    return {
      agencyId,
      created: res.created,
      updated: res.updated,
      deactivated: res.deactivated,
      relationshipsDetected: res.relationshipsDetected,
      areasDetected: res.areasDetected,
      timelineEventsCreated,
      signalsCreated,
    };
  },

  getAreaFootprint(agencyId: string): Promise<AgencyAreaFootprint> {
    return getAgencyAreaFootprint(agencyId);
  },
};

// ── Scoring hooks (Phase 26.4) ───────────────────────────────────────────────
// Intentionally side-effect-free placeholders so callers can wire them now;
// Phase 26.4 will fill in market-strength / coverage / momentum recomputation.

/** Called after an agency's graph changes. Phase 26.4 will recompute scores. */
export async function onAgencyGraphUpdated(agencyId: string): Promise<void> {
  // no-op stub (Phase 26.4 will recompute market-strength / coverage / momentum)
  void agencyId;
  return;
}

/** Recompute and return the agency's area footprint (used by scoring in 26.4). */
export async function recalculateAgencyAreaFootprint(agencyId: string): Promise<AgencyAreaFootprint> {
  return getAgencyAreaFootprint(agencyId);
}
