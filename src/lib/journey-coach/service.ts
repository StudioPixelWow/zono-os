// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.7 · JOURNEY AI COACH SERVICE (server-only).
//
// The Coach consumes ONLY the approved canonical entry points:
//   · getJourneyCenter()            — canonical Journey state (5.6G evidence gate)
//   · getBrokerIntelligenceQueue()  — evidence-gated recommendations
//   · buildExecJourneyProjection    — the ONE shared projection (manager overview)
//   · mapJourneyQueueItems          — the ONE queue→action mapping
//
// It reads NO tables of its own: no stage_entered_at, no activity timestamps,
// no forbidden score columns, no legacy models, no predictions. Org scoping is
// the providers' (RLS via session context); the manager flag fails CLOSED.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getJourneyCenter } from "@/lib/journey-center/service";
import { getBrokerIntelligenceQueue } from "@/lib/broker-intelligence/aggregate-service";
import {
  buildExecJourneyProjection, mapJourneyQueueItems,
} from "@/lib/executive-os/journey-projection";
import { isJourneyType, stageLabel, type JourneyType } from "@/lib/journey-canonical";
import { buildCoachOverview, type CoachMode, type CoachOverview } from "./engine";

/** Fails CLOSED: any error ⇒ not a manager (same rule as Executive, 5.6G). */
async function isManager(): Promise<boolean> {
  try {
    const db = await createClient();
    const { data } = await db.rpc("has_min_role", { p_min: "manager" });
    return data === true;
  } catch {
    return false;
  }
}

/**
 * The canonical Journey Coach. Provider failure surfaces as null — the caller
 * says "unavailable" rather than coaching from nothing.
 */
export async function getJourneyCoach(mode: CoachMode = "NORMAL"): Promise<CoachOverview | null> {
  const [jc, jq, manager] = await Promise.all([
    getJourneyCenter().catch(() => undefined),
    getBrokerIntelligenceQueue({ limit: 40 }).catch(() => undefined),
    isManager(),
  ]);
  if (jc === undefined) return null;                      // provider failure ⇒ unavailable, never an empty coach

  const actions = jq === undefined ? [] : mapJourneyQueueItems(jq.items ?? []);
  const projection = buildExecJourneyProjection({
    kpis: jc.kpis ?? null,
    actions,
    isManager: false,                                     // the Coach NEVER carries workload — org counts only
    stageLabel: (t, s) => (isJourneyType(t) ? stageLabel(t as JourneyType, s) : s),
  });

  return buildCoachOverview(
    jc.journeys,
    actions,
    projection,
    manager ? "manager" : "member",
    mode,
  );
}
