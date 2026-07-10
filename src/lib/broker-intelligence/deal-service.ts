// ============================================================================
// 🤝 ZONO — BROKER INTELLIGENCE · Area 4 · Deal service (server-only).
// Feeds the pure deal engine with REAL persisted data in ONE batch pass:
//   • deal_profiles     — stage/status/risk/health/velocity/probability/close
//   • deal_objections   — unresolved objection counts (per canonical deal)
// Reuses the existing deal intelligence tables — no parallel engine. Only OPEN
// deals are evaluated (won/lost excluded). Never throws.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { rankDeals, type DealSignals } from "./deal";
import type { Recommendation } from "./types";

const DAY = 86_400_000;
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

export interface DealIntelligence {
  recommendations: Recommendation[];
  scanned: number;
  actionable: number;
  generatedAt: string;
}

export async function getDealIntelligence(limit = 12): Promise<DealIntelligence> {
  const empty: DealIntelligence = { recommendations: [], scanned: 0, actionable: 0, generatedAt: new Date().toISOString() };
  try {
    const db = await createClient();
    const { data: profiles } = await db
      .from("deal_profiles")
      .select("id,deal_id,deal_stage,status,deal_risk,deal_health,deal_velocity,deal_probability,expected_close_date")
      .neq("status", "won")
      .neq("status", "lost")
      .limit(500);
    const rows = profiles ?? [];
    if (!rows.length) return empty;

    // Unresolved objections per deal_profile (best-effort; table may be absent).
    const objByProfile = new Map<string, number>();
    try {
      const { data: obj } = await db
        .from("deal_objections")
        .select("deal_profile_id,resolved")
        .eq("resolved", false)
        .limit(4000);
      for (const o of obj ?? []) {
        const key = o.deal_profile_id as string;
        objByProfile.set(key, (objByProfile.get(key) ?? 0) + 1);
      }
    } catch { /* objections table optional */ }

    const now = Date.now();
    const signals: DealSignals[] = rows.map((r) => {
      const close = r.expected_close_date ? new Date(r.expected_close_date as string).getTime() : null;
      const daysToClose = close != null && !Number.isNaN(close) ? Math.round((close - now) / DAY) : null;
      return {
        dealId: (r.deal_id as string | null) ?? (r.id as string),
        title: `עסקה · ${(r.deal_stage as string | null) ?? "פעילה"}`,
        stage: (r.deal_stage as string | null) ?? null,
        status: (r.status as string | null) ?? null,
        dealRisk: num(r.deal_risk),
        dealHealth: num(r.deal_health),
        dealVelocity: num(r.deal_velocity),
        dealProbability: num(r.deal_probability),
        daysToExpectedClose: daysToClose,
        openObjections: objByProfile.get(r.id as string) ?? 0,
      };
    });

    const ranked = rankDeals(signals);
    const actionable = ranked.filter((r) => !r.insufficientEvidence).length;
    return { recommendations: ranked.slice(0, limit), scanned: rows.length, actionable, generatedAt: new Date().toISOString() };
  } catch (e) {
    console.error("[broker-intelligence] deal failed:", e);
    return empty;
  }
}
