// ============================================================================
// Evidence-Based Broker Coach™ — MAI-11 repository (server-only).
//
// Pure data access: reads the org's MAI-10 gap profiles (broker_gap_analysis)
// and MAI-6 broker context (broker_market_intelligence), maps them into the
// coach engine's inputs, and upserts the coaching records. No coaching logic
// here — that lives in engine.ts (pure). Service-role + explicit org scope.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { BrokerCoachInput, CoachGap, CoachStrength, CoachGapProfile, CoachMarketContext } from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;

const segLabel = (city: string | null, neighborhood: string | null, propertyType: string | null, rooms: number | null, priceBucket: string | null) =>
  [city, neighborhood, propertyType, rooms != null ? `${rooms} חד׳` : null, priceBucket].filter(Boolean).join(" / ") || "כל האזור";

interface GapRow {
  broker_id: string; city: string | null; neighborhood: string | null; property_type: string | null;
  rooms: number | null; price_bucket: string | null; window_days: number;
  zone_dominance_score: number | null; zone_dominance_level: string | null;
  leader_gap: number | null; winning_dna_match_score: number | null; confidence: number | null;
  gaps: unknown; strengths: unknown; metadata: unknown;
}

/** Gather per-broker coach inputs from the persisted gap profiles + market context. */
export async function gatherCoachInputs(organizationId: string): Promise<BrokerCoachInput[]> {
  const db = createServiceRoleClient() as Db;

  const { data: gapData } = await db
    .from("broker_gap_analysis" as never)
    .select("broker_id,city,neighborhood,property_type,rooms,price_bucket,window_days,zone_dominance_score,zone_dominance_level,leader_gap,winning_dna_match_score,confidence,gaps,strengths,metadata")
    .eq("organization_id", organizationId)
    .limit(60000);
  const gapRows = (gapData ?? []) as unknown as GapRow[];
  if (!gapRows.length) return [];

  // Market context per broker (best-effort).
  const ctx = new Map<string, CoachMarketContext>();
  try {
    const { data } = await db
      .from("broker_market_intelligence" as never)
      .select("broker_id,market_activity_score,market_success_rate,dominant_neighborhood,dominant_property_type")
      .eq("organization_id", organizationId)
      .limit(20000);
    for (const r of (data ?? []) as unknown as { broker_id: string; market_activity_score: number | null; market_success_rate: number | null; dominant_neighborhood: string | null; dominant_property_type: string | null }[]) {
      ctx.set(r.broker_id, {
        marketActivityScore: r.market_activity_score, marketSuccessRate: r.market_success_rate,
        dominantNeighborhood: r.dominant_neighborhood, dominantPropertyType: r.dominant_property_type,
      });
    }
  } catch { /* context is optional */ }

  const byBroker = new Map<string, CoachGapProfile[]>();
  for (const r of gapRows) {
    if (!r.broker_id) continue;
    const gaps = (Array.isArray(r.gaps) ? r.gaps : []) as CoachGap[];
    const strengths = (Array.isArray(r.strengths) ? r.strengths : []) as CoachStrength[];
    const meta = (r.metadata && typeof r.metadata === "object" ? r.metadata : {}) as Record<string, unknown>;
    const momentum = typeof meta.brokerMomentum === "number" ? meta.brokerMomentum : 0;
    const profile: CoachGapProfile = {
      segmentLabel: segLabel(r.city, r.neighborhood, r.property_type, r.rooms, r.price_bucket),
      windowDays: r.window_days,
      zoneDominanceScore: r.zone_dominance_score,
      zoneDominanceLevel: r.zone_dominance_level ?? "INSUFFICIENT_DATA",
      leaderGap: r.leader_gap,
      winningDnaMatchScore: r.winning_dna_match_score,
      confidence: r.confidence ?? 0,
      momentum,
      gaps, strengths,
    };
    const arr = byBroker.get(r.broker_id) ?? [];
    arr.push(profile);
    byBroker.set(r.broker_id, arr);
  }

  return [...byBroker.entries()].map(([brokerId, gapProfiles]) => ({ brokerId, gapProfiles, context: ctx.get(brokerId) }));
}

/** Upsert computed coaching rows (conflict-keyed by broker + coach version). */
export async function upsertCoachingRows(rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  const db = createServiceRoleClient() as Db;
  for (let i = 0; i < rows.length; i += 500) {
    try {
      await db
        .from("broker_ai_coaching" as never)
        .upsert(rows.slice(i, i + 500) as never, { onConflict: "organization_id,broker_id,coach_version" });
    } catch { /* best-effort — retried on the next sync */ }
  }
}
