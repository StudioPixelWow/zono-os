// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.8 · EXECUTIVE DECISION SERVICE (server).
//
// Thin canonical wiring for the PURE decision engine. Consumes ONLY approved
// canonical providers:
//   · getJourneyCoach()             — evidence-native journey reasoning (5.7),
//                                     which itself carries the shared projection
//   · getBrokerIntelligenceQueue()  — the ONE evidence-gated action queue
//
// No writes, no cache, no tables, no projections of its own, no SQL. The
// manager flag fails CLOSED (any error ⇒ member visibility).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getJourneyCoach } from "@/lib/journey-coach/service";
import { getBrokerIntelligenceQueue } from "@/lib/broker-intelligence/aggregate-service";
import { buildExecutiveDecisions } from "./engine";
import type { DecisionQueueItem, ExecutiveDecisions } from "./types";

async function isManager(): Promise<boolean> {
  try {
    const db = await createClient();
    const { data } = await db.rpc("has_min_role", { p_min: "manager" });
    return data === true;
  } catch {
    return false;
  }
}

/** Provider failure ⇒ null — "unavailable", never a fabricated no-action. */
export async function getExecutiveDecisions(): Promise<ExecutiveDecisions | null> {
  const [coach, jq, manager] = await Promise.all([
    getJourneyCoach("SHORT").catch(() => null),
    getBrokerIntelligenceQueue({ limit: 40 }).catch(() => undefined),
    isManager(),
  ]);
  if (!coach && jq === undefined) return null;      // both providers failed ⇒ unavailable

  const queueItems: DecisionQueueItem[] = (jq?.items ?? []).map((r) => ({
    id: r.id, area: r.area, entityType: r.entityType, entityId: r.entityId,
    title: r.title, why: r.why, suggestedAction: r.suggestedAction,
    expectedImpact: r.expectedImpact, confidence: r.confidence,
    priority: r.priority, urgency: r.urgency, href: r.href,
    evidence: r.evidence.map((e) => ({ label: e.label, source: e.source })),
    insufficientEvidence: r.insufficientEvidence,
  }));

  return buildExecutiveDecisions({
    queueItems,
    coach,
    audience: manager ? "manager" : "member",
  });
}
