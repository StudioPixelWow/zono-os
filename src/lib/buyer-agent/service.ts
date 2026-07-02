// ============================================================================
// 🛒 Buyer Intelligence Agent — service (server-only). 29.4.
// Assembles buyer signals by REUSING the Buyer Digital Twin (getBuyerTwins),
// buyer↔property matches and the Unified Customer Journey — then builds one
// buyer scorecard each and exposes signals for the agent runtime. Read-only;
// evidence-only; nothing auto-executes. No engine modified.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getBuyerTwins, type BuyerTwin } from "@/lib/digital-twin/buyers";
import { getCustomerJourneys } from "@/lib/digital-twin/customer";
import { buildBuyerScorecard } from "./scorecard";
import type { BuyerSignals, BuyerMatchInput, BuyerScorecard } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };
const DAY = 86400000;

async function assemble(orgId: string | null, limit: number): Promise<{ signals: BuyerSignals[]; notes: string[] }> {
  const notes: string[] = [];
  const now = Date.now();
  const overview = await getBuyerTwins(orgId).catch(() => null);
  const twins: BuyerTwin[] = (overview?.twins ?? []).slice(0, limit);
  if (!twins.length) { notes.push("אין קונים במערכת עדיין — צור קונים כדי להפעיל את סוכן הקונים."); return { signals: [], notes }; }

  const ids = twins.map((t) => t.identity.id);

  // Matches (buyer↔property).
  const matchesByBuyer = new Map<string, BuyerMatchInput[]>();
  try {
    const db = await createClient();
    const { data } = await db.from("buyer_property_matches" as never).select("buyer_id,linked_property_id,match_score,updated_at").in("buyer_id" as never, ids as never).limit(3000);
    for (const m of (data ?? []) as Row[]) {
      const bid = s(m.buyer_id), pid = s(m.linked_property_id); if (!bid || !pid) continue;
      const at = s(m.updated_at); const ageDays = at ? Math.round((now - new Date(at).getTime()) / DAY) : null;
      (matchesByBuyer.get(bid) ?? matchesByBuyer.set(bid, []).get(bid)!).push({ listingId: pid, title: `נכס ${pid.slice(0, 8)}`, score: num(m.match_score) ?? 0, ageDays, reasons: [] });
    }
  } catch { /* none */ }

  // Customer journey roles/stage (Unified Customer Journey, reused).
  const roleByBuyer = new Map<string, { roles: string[]; stage: string | null }>();
  try {
    const journeys = await getCustomerJourneys(orgId);
    for (const j of journeys.journeys) for (const mem of j.identity.members) if (mem.kind === "buyer") roleByBuyer.set(mem.id, { roles: j.identity.roles, stage: j.currentStage });
  } catch { /* none */ }

  const signals: BuyerSignals[] = twins.map((t) => {
    const p = t.profile; const jr = roleByBuyer.get(t.identity.id);
    const strongest = (t.relationships?.strongest ?? []).filter((e) => e.type === "works_at" || e.type === "managed_by" || e.type === "represents").map((e) => e.to);
    return {
      id: t.identity.id, name: t.identity.name,
      readiness: p.readiness, urgency: p.urgency, trust: p.trust, probabilityToBuy: p.probabilityToBuy,
      communicationHealth: p.communicationHealth, budgetConfidence: p.budgetConfidence, completeness: p.completeness,
      decisionStyle: p.decisionStyle, motivation: p.motivation, timeline: p.timeline, behavior: p.behavior,
      healthScore: t.health.score, healthLabel: t.health.label, recencyScore: t.memory.recencyScore, engagementScore: t.memory.engagementScore,
      totalActivities: t.memory.totalActivities, lastActivityAt: t.memory.lastActivityAt,
      relationshipDegree: t.relationships?.degree ?? 0, classification: t.classification, learnings: t.learnings.map((l) => l.type),
      lifecycleRoles: jr?.roles ?? [], repeatClient: (jr?.roles ?? []).includes("repeat_client"), investor: t.classification.includes("משקיע") || (jr?.roles ?? []).includes("investor"),
      formerClient: (jr?.roles ?? []).includes("former_client"), lifecycleStage: jr?.stage ?? null,
      matches: matchesByBuyer.get(t.identity.id) ?? [], brokerConnections: strongest,
      truthScore: t.truth?.truthScore ?? null, budgetChanged: false, timelineChanged: false,
    };
  });
  return { signals, notes };
}

/** Signals for the agent runtime (injected into the framework context). */
export async function getBuyerAgentSignals(orgId: string | null, limit = 20): Promise<BuyerSignals[]> {
  try { return (await assemble(orgId, limit)).signals; } catch { return []; }
}

export interface BuyerAgentScorecardsOverview {
  version: string; generatedAt: string;
  totals: { buyers: number; hot: number; cold: number; closing: number; needsInfo: number; dormant: number; withMatches: number };
  scorecards: BuyerScorecard[]; notes: string[];
}

/** One buyer scorecard per buyer (dashboard). */
export async function getBuyerAgentScorecards(orgId: string | null, limit = 30): Promise<BuyerAgentScorecardsOverview> {
  const { signals, notes } = await assemble(orgId, limit);
  const scorecards = signals.map(buildBuyerScorecard);
  const st = (c: BuyerScorecard) => c.strategy.recommendedStrategy;
  return {
    version: "29.4", generatedAt: new Date().toISOString(),
    totals: {
      buyers: scorecards.length,
      hot: scorecards.filter((c) => c.health.label === "בריא" && c.health.buyingConfidence >= 60).length,
      cold: scorecards.filter((c) => c.classification.includes("קונה קר") || c.health.buyingConfidence < 30).length,
      closing: scorecards.filter((c) => ["CLOSE_DEAL", "NEGOTIATE", "LAWYER_STAGE"].includes(st(c))).length,
      needsInfo: scorecards.filter((c) => st(c) === "COLLECT_INFORMATION").length,
      dormant: scorecards.filter((c) => c.health.label === "רדום").length,
      withMatches: scorecards.filter((c) => c.matchIntel.perfect.length + c.matchIntel.emerging.length > 0).length,
    },
    scorecards: [...scorecards].sort((a, b) => b.strategy.confidence - a.strategy.confidence),
    notes,
  };
}
