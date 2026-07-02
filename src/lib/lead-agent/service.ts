// ============================================================================
// 🎯 ZONO Lead Intelligence Agent™ — service (server-only). 29.6.
// Assembles lead signals by REUSING the Lead Digital Twin (getLeadTwins:
// profile/health/memory/relationships/classification/learnings/truth), the
// Unified Customer Journey (getCustomerJourneys: lifecycle roles/stage) and the
// existing `leads` read model (message + conversion links + property) — then
// builds one lead scorecard each and exposes signals for the agent runtime.
// Read-only; evidence-only; routing/conversion are approval-gated; nothing runs.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getLeadTwins, type LeadTwin } from "@/lib/digital-twin/leads";
import { getCustomerJourneys } from "@/lib/digital-twin/customer";
import { buildLeadScorecard } from "./scorecard";
import type { LeadSignals, LeadScorecard } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

interface LeadExtra { message: string | null; hasConvertedBuyer: boolean; hasConvertedSeller: boolean; hasProperty: boolean }

async function assemble(orgId: string | null, limit: number): Promise<{ signals: LeadSignals[]; notes: string[] }> {
  const notes: string[] = [];
  const [overview, journeys] = await Promise.all([
    getLeadTwins(orgId, Math.max(limit, 30)).catch(() => null),
    getCustomerJourneys(orgId).catch(() => null),
  ]);
  const twins: LeadTwin[] = (overview?.twins ?? []).slice(0, limit);
  if (!twins.length) { notes.push("אין לידים במערכת עדיין — צור לידים כדי להפעיל את סוכן מודיעין הלידים. אין המצאות."); return { signals: [], notes }; }

  // Lead-row extras (message + conversion links + property) — evidence, not recomputed.
  const db = await createClient();
  const ids = twins.map((t) => t.identity.id);
  const extraById = new Map<string, LeadExtra>();
  try {
    for (const r of ((await db.from("leads").select("id,message,converted_buyer_id,converted_seller_id,property_id").in("id", ids)).data ?? []) as Row[]) {
      const id = s(r.id); if (!id) continue;
      extraById.set(id, { message: s(r.message), hasConvertedBuyer: !!s(r.converted_buyer_id), hasConvertedSeller: !!s(r.converted_seller_id), hasProperty: !!s(r.property_id) });
    }
  } catch { /* leads extras unavailable — fall back to twin profile only */ }

  // Customer journey lifecycle roles / stage per lead.
  const roleByLead = new Map<string, { roles: string[]; stage: string | null; memberKinds: number }>();
  for (const j of journeys?.journeys ?? []) for (const mem of j.identity.members) if (mem.kind === "lead") roleByLead.set(mem.id, { roles: j.identity.roles, stage: j.currentStage, memberKinds: new Set(j.identity.members.map((m) => m.kind)).size });

  const signals: LeadSignals[] = twins.map((t) => {
    const p = t.profile; const jr = roleByLead.get(t.identity.id);
    const extra = extraById.get(t.identity.id) ?? { message: null, hasConvertedBuyer: false, hasConvertedSeller: false, hasProperty: p.relationshipPath.some((x) => x.includes("נכס")) };
    const roles = jr?.roles ?? [];
    const strongest = (t.relationships?.strongest ?? []).filter((e) => e.type === "works_at" || e.type === "managed_by" || e.type === "represents").map((e) => e.to);
    return {
      id: t.identity.id, name: t.identity.name,
      source: p.source, sourceQuality: p.sourceQuality, leadQuality: p.leadQuality,
      intent: p.intent, intentConfidence: p.intentConfidence, buyerSellerFit: p.buyerSellerFit,
      urgency: p.urgency, conversionProbability: p.conversionProbability, duplicateRisk: p.duplicateRisk, contactRisk: p.contactRisk,
      communicationHealth: p.communicationHealth, completeness: p.completeness, stage: p.stage, nextBestAction: p.nextBestAction,
      message: extra.message,
      relationshipPath: p.relationshipPath,
      behavior: p.behavior,
      healthScore: t.health.score, healthLabel: t.health.label, recencyScore: t.memory.recencyScore, engagementScore: t.memory.engagementScore,
      totalActivities: t.memory.totalActivities, lastActivityAt: t.memory.lastActivityAt,
      relationshipDegree: t.relationships?.degree ?? 0, brokerConnections: strongest,
      classification: t.classification, learnings: t.learnings.map((l) => l.type),
      lifecycleRoles: roles, existingCustomer: roles.includes("repeat_client") || roles.includes("buyer") || roles.includes("seller"),
      repeatClient: roles.includes("repeat_client"), formerBuyer: roles.includes("buyer") || extra.hasConvertedBuyer, formerSeller: roles.includes("seller") || extra.hasConvertedSeller,
      investor: t.classification.includes("משקיע") || roles.includes("investor") || p.intent === "investor", multiRole: (jr?.memberKinds ?? 1) > 1,
      lifecycleStage: jr?.stage ?? null,
      hasConvertedBuyer: extra.hasConvertedBuyer, hasConvertedSeller: extra.hasConvertedSeller, hasProperty: extra.hasProperty,
      truthScore: t.truth?.truthScore ?? null,
    };
  });
  return { signals, notes };
}

/** Signals for the agent runtime (injected into the framework context). */
export async function getLeadAgentSignals(orgId: string | null, limit = 20): Promise<LeadSignals[]> {
  try { return (await assemble(orgId, limit)).signals; } catch { return []; }
}

export interface LeadAgentScorecardsOverview {
  version: string; generatedAt: string;
  totals: { leads: number; hot: number; duplicates: number; buyers: number; sellers: number; both: number; nurture: number; humanReview: number; convertReady: number };
  scorecards: LeadScorecard[]; notes: string[];
}

/** One lead scorecard per lead (dashboard). */
export async function getLeadAgentScorecards(orgId: string | null, limit = 30): Promise<LeadAgentScorecardsOverview> {
  const { signals, notes } = await assemble(orgId, limit);
  const scorecards = signals.map(buildLeadScorecard);
  const conv = ["CONVERT_TO_BUYER", "CONVERT_TO_SELLER", "CONVERT_TO_BOTH"];
  return {
    version: "29.6", generatedAt: new Date().toISOString(),
    totals: {
      leads: scorecards.length,
      hot: scorecards.filter((c) => c.opportunities.some((o) => o.type === "hot_lead")).length,
      duplicates: scorecards.filter((c) => c.routing.target === "duplicate_review").length,
      buyers: scorecards.filter((c) => c.routing.target === "buyer").length,
      sellers: scorecards.filter((c) => c.routing.target === "seller").length,
      both: scorecards.filter((c) => c.routing.target === "both").length,
      nurture: scorecards.filter((c) => c.routing.target === "nurture").length,
      humanReview: scorecards.filter((c) => c.routing.target === "human_review").length,
      convertReady: scorecards.filter((c) => conv.includes(c.strategy.recommendedStrategy)).length,
    },
    scorecards: [...scorecards].sort((a, b) => b.strategy.confidence - a.strategy.confidence),
    notes,
  };
}
