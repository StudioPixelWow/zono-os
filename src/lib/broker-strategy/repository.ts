// ============================================================================
// Autonomous Growth Strategy™ — MAI-12 repository (server-only).
//
// Pure data access: reads the org's MAI-11 coaching records (broker_ai_coaching)
// and MAI-10 gap profiles (broker_gap_analysis), maps them into the engine's
// per-broker StrategyInput (coach items + current Zone score + gap severities +
// strengths + current share/success for the simulation), and upserts the
// computed strategies. No strategy logic here — that lives in engine.ts (pure).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { StrategyInput, CoachItemLite, GapSeverity, StrategyGapType } from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;

interface CoachRow {
  broker_id: string; overall_confidence: number | null;
  recommendations: unknown; opportunities: unknown; warnings: unknown; metadata: unknown;
}
interface GapRow {
  broker_id: string; zone_dominance_score: number | null; leader_gap: number | null;
  gaps: unknown; strengths: unknown; metadata: unknown;
}

const toItem = (kind: CoachItemLite["kind"]) => (r: Record<string, unknown>): CoachItemLite => ({
  id: String(r.id ?? ""), kind, title: String(r.title ?? ""),
  confidence: typeof r.confidence === "number" ? r.confidence : 0,
  estimatedImpact: (r.estimatedImpact === "HIGH" || r.estimatedImpact === "MEDIUM" || r.estimatedImpact === "LOW") ? r.estimatedImpact : "LOW",
  supportingEvidence: Array.isArray(r.supportingEvidence) ? r.supportingEvidence.map(String) : [],
  generatedFrom: Array.isArray(r.generatedFrom) ? r.generatedFrom.map(String) : [],
  blockedBy: Array.isArray(r.blockedBy) ? r.blockedBy.map(String) : [],
});

/** Assemble per-broker strategy inputs from coaching + gap profiles. */
export async function gatherStrategyInputs(organizationId: string): Promise<StrategyInput[]> {
  const db = createServiceRoleClient() as Db;

  const { data: coachData } = await db
    .from("broker_ai_coaching" as never)
    .select("broker_id,overall_confidence,recommendations,opportunities,warnings,metadata")
    .eq("organization_id", organizationId)
    .limit(20000);
  const coachRows = (coachData ?? []) as unknown as CoachRow[];
  if (!coachRows.length) return [];

  // Gap profiles → current Zone, leader gap, gap severities, strengths, share/success.
  interface GapAgg {
    zone: number | null; leaderGap: number | null; momentum: number;
    severity: Partial<Record<StrategyGapType, GapSeverity>>; strengths: Set<string>;
    marketShare: number | null; successRate: number | null; bestConfidence: number;
  }
  const gapByBroker = new Map<string, GapAgg>();
  {
    const { data } = await db
      .from("broker_gap_analysis" as never)
      .select("broker_id,zone_dominance_score,leader_gap,gaps,strengths,metadata,confidence")
      .eq("organization_id", organizationId)
      .limit(60000);
    for (const r of (data ?? []) as unknown as (GapRow & { confidence: number | null })[]) {
      if (!r.broker_id) continue;
      const conf = r.confidence ?? 0;
      let agg = gapByBroker.get(r.broker_id);
      if (!agg || conf > agg.bestConfidence) {
        // Use the highest-confidence segment as the broker's "current" snapshot.
        agg = agg ?? { zone: null, leaderGap: null, momentum: 0, severity: {}, strengths: new Set(), marketShare: null, successRate: null, bestConfidence: -1 };
        if (conf > agg.bestConfidence) {
          agg.zone = r.zone_dominance_score; agg.leaderGap = r.leader_gap; agg.bestConfidence = conf;
          const meta = (r.metadata && typeof r.metadata === "object" ? r.metadata : {}) as Record<string, unknown>;
          agg.momentum = typeof meta.brokerMomentum === "number" ? meta.brokerMomentum : 0;
        }
      }
      // Severities + share/success come from gaps; strengths from strengths (any segment).
      for (const g of (Array.isArray(r.gaps) ? r.gaps : []) as Record<string, unknown>[]) {
        const t = String(g.type) as StrategyGapType;
        const sev = (g.severity === "HIGH" || g.severity === "MEDIUM" || g.severity === "LOW") ? g.severity : "LOW";
        const prev = agg.severity[t];
        if (!prev || sevWeight(sev) > sevWeight(prev)) agg.severity[t] = sev;
        if (t === "MARKET_SHARE" && typeof g.brokerValue === "number") agg.marketShare = g.brokerValue;
        if (t === "SUCCESS_RATE" && typeof g.brokerValue === "number") agg.successRate = g.brokerValue;
      }
      for (const s of (Array.isArray(r.strengths) ? r.strengths : []) as Record<string, unknown>[]) {
        if (s.type) agg.strengths.add(String(s.type));
      }
      gapByBroker.set(r.broker_id, agg);
    }
  }

  return coachRows.map((c) => {
    const items: CoachItemLite[] = [
      ...(Array.isArray(c.recommendations) ? c.recommendations.map(toItem("recommendation")) : []),
      ...(Array.isArray(c.opportunities) ? c.opportunities.map(toItem("opportunity")) : []),
      ...(Array.isArray(c.warnings) ? c.warnings.map(toItem("warning")) : []),
    ];
    const g = gapByBroker.get(c.broker_id);
    const meta = (c.metadata && typeof c.metadata === "object" ? c.metadata : {}) as Record<string, unknown>;
    const zoneFromCoach = typeof meta.zoneDominanceScore === "number" ? meta.zoneDominanceScore : null;
    return {
      brokerId: c.broker_id,
      currentZoneScore: g?.zone ?? zoneFromCoach,
      currentLeaderGap: g?.leaderGap ?? null,
      momentum: g?.momentum ?? 0,
      currentMarketShare: g?.marketShare ?? null,
      currentSuccessRate: g?.successRate ?? null,
      gapSeverityByType: g?.severity ?? {},
      strengthTypes: g ? [...g.strengths] : [],
      coachItems: items,
    } as StrategyInput;
  });
}

const sevWeight = (s: GapSeverity): number => (s === "HIGH" ? 3 : s === "MEDIUM" ? 2 : 1);

/** Upsert computed strategy rows (conflict-keyed by broker + strategy version). */
export async function upsertStrategyRows(rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  const db = createServiceRoleClient() as Db;
  for (let i = 0; i < rows.length; i += 500) {
    try {
      await db
        .from("broker_growth_strategy" as never)
        .upsert(rows.slice(i, i + 500) as never, { onConflict: "organization_id,broker_id,strategy_version" });
    } catch { /* best-effort — retried on the next sync */ }
  }
}
