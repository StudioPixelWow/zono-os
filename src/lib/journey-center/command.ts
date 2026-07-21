// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.6H · CANONICAL JOURNEY COMMAND (server).
//
// THE one Journey read for every non-Executive command surface (the Home
// dashboard Journey section, the Ask-ZONO Copilot, and whatever 5.7 adds).
// It exists so no surface ever again builds its own Journey reasoning path:
//
//   · STATE  comes from the canonical Journey Center (getJourneyCenter) —
//     dwell/stall/blocked already evidence-gated at the ONE shared provider
//     (5.6G: verified transitions only; null = insufficient evidence).
//   · ACTIONS come from the canonical Broker Intelligence queue — evidence-
//     gated recommendations with their own identity/lifecycle/confidence,
//     mapped through the ONE shared mapper (mapJourneyQueueItems). A KPI is
//     never promoted into an action here or anywhere.
//   · The projection itself is buildExecJourneyProjection — the SAME pure
//     projection Executive renders, so all surfaces agree byte-for-byte on
//     counts, dwell evidence status and the deterministic top action.
//
// Deliberately MEMBER-SAFE by default: isManager is false and no owner names
// are resolved, so per-broker workload can never leak into a shared surface.
// Executive OS keeps its own manager-aware wiring (role-separated cache); this
// provider is for surfaces that must never see workload at all.
//
// FORBIDDEN (same as 5.6E–5.6G, enforced upstream by types): journeys.progress
// / health_score / engagement_score / conversion_score / risk_score /
// velocity_score / velocity_state / next_best_action / journey_predictions.
// The legacy journey-intelligence engine is NOT consulted.
// ============================================================================
import "server-only";
import { getJourneyCenter } from "./service";
import { getBrokerIntelligenceQueue } from "@/lib/broker-intelligence/aggregate-service";
import {
  buildExecJourneyProjection, mapJourneyQueueItems, type ExecJourneyProjection,
} from "@/lib/executive-os/journey-projection";
import { isJourneyType, stageLabel, type JourneyType } from "@/lib/journey-canonical";

/**
 * The canonical Journey Command projection — provider failures surface as
 * `unavailable` (never a fabricated zero), zero verified dwell surfaces as
 * `insufficient` (never 0 days), exactly like Executive.
 */
export async function getCanonicalJourneyCommand(): Promise<ExecJourneyProjection> {
  // `undefined` marks a FAILED provider so the projection reports "unavailable"
  // rather than an empty state that reads as healthy.
  const [jc, jq] = await Promise.all([
    getJourneyCenter().catch(() => undefined),
    getBrokerIntelligenceQueue({ limit: 40 }).catch(() => undefined),
  ]);
  return buildExecJourneyProjection({
    kpis: jc === undefined ? null : jc.kpis ?? null,
    actions: jq === undefined ? [] : mapJourneyQueueItems(jq.items ?? []),
    isManager: false,                 // member-safe: workload never reaches shared surfaces
    stageLabel: (t, s) => (isJourneyType(t) ? stageLabel(t as JourneyType, s) : s),
  });
}
