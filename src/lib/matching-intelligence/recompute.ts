/**
 * Matching Intelligence — BOUNDED, event-driven recompute (server-only).
 *
 * The canonical org engine (generateMatchesForOrgId in ./service.ts) recomputes an
 * ENTIRE org and stays the daily-cron safety net. This module adds the precise,
 * event-driven complement Buyer Command Center 5.1 needs:
 *
 *   • generateMatchesForBuyerId  — one buyer × candidate properties
 *   • generateMatchesForPropertyId — one property × relevant buyers
 *
 * SAME scoring brain (calculateCompatibility / computeMatchScores / playbook) — it
 * is NOT a second engine, only a narrower candidate set. Boundedness is the whole
 * point: a buyer criteria change costs 1×P, a property change costs 1×B, never B×P.
 *
 * SAFETY vs the org engine's org-wide child delete: here child rows
 * (match_risks/opportunities/revenue_signals) are regenerated ONLY for the affected
 * match_ids, so a bounded recompute never wipes sibling buyers'/properties' children.
 * Stale in-scope matches (no longer above threshold, or a now-unavailable property)
 * are marked match_status='inactive' — never hard-deleted — so history is preserved
 * and they drop out of ACTIVE recommendations.
 */
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import {
  calculateCompatibility,
  computeMatchScores,
  type CompatInput,
  type MatchInput,
} from "./scoring";
import {
  detectMatchRisks,
  estimatedCommission,
  dealValue,
  matchStageIndex,
  nextBestMatchActions,
} from "./playbook";

type SupabaseLike = ReturnType<typeof createServiceRoleClient>;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const COMPAT_THRESHOLD = 40;
const BUYER_KEEP = 60;      // max active matches surfaced per buyer
const PROPERTY_KEEP = 100;  // max interested buyers surfaced per property
const ACTIVE_PROPERTY_STATUSES = ["active", "published", "ready"] as const;
const revenueScoreOf = (price: number | null) => clamp((price ?? 0) / 50_000);

interface ScopedCandidate {
  buyerId: string; propertyId: string; sellerId: string | null;
  compat: ReturnType<typeof calculateCompatibility>;
  input: MatchInput; scores: ReturnType<typeof computeMatchScores>;
  price: number | null; stage: string;
}

type BuyerPrefRow = { id: string; budget_min: number | null; budget_max: number | null; rooms_min: number | null; rooms_max: number | null; preferred_areas: string[] | null; preferred_types: string[] | null; must_have_parking: boolean | null; must_have_elevator: boolean | null; must_have_safe_room: boolean | null };
type BuyerIntelRow = { buyer_id: string; buyer_readiness_score: number | null; buyer_engagement_score: number | null; buyer_trust_score: number | null; buyer_financing_score: number | null; buyer_conversion_probability: number | null; days_since_activity: number | null };
type PropRow = { id: string; price: number | null; rooms: number | null; city: string | null; neighborhood: string | null; type: string | null; has_parking: boolean | null; has_elevator: boolean | null; has_safe_room: boolean | null; seller_id: string | null; status: string | null };

function scoreCandidate(
  prefs: BuyerPrefRow, bi: BuyerIntelRow, p: PropRow,
  propIntel: Map<string, { success_score: number | null; market_position_score: number | null; momentum_score: number | null }>,
  sellerIntel: Map<string, { seller_trust_score: number | null; seller_churn_risk_score: number | null; seller_confidence_score: number | null }>,
  visited: Set<string>, existing: Map<string, string>,
): ScopedCandidate | null {
  const ci: CompatInput = {
    budgetMin: prefs.budget_min, budgetMax: prefs.budget_max, roomsMin: prefs.rooms_min, roomsMax: prefs.rooms_max,
    preferredAreas: prefs.preferred_areas ?? [], preferredTypes: prefs.preferred_types ?? [],
    mustParking: !!prefs.must_have_parking, mustElevator: !!prefs.must_have_elevator, mustSafeRoom: !!prefs.must_have_safe_room,
    price: p.price, rooms: p.rooms, city: p.city, neighborhood: p.neighborhood, type: p.type ?? "",
    hasParking: !!p.has_parking, hasElevator: !!p.has_elevator, hasSafeRoom: !!p.has_safe_room,
  };
  const compat = calculateCompatibility(ci);
  if (compat.score < COMPAT_THRESHOLD) return null;
  const pi = propIntel.get(p.id);
  const si = p.seller_id ? sellerIntel.get(p.seller_id) : undefined;
  const stage = existing.get(`${bi.buyer_id}|${p.id}`) ?? "recommended";
  const input: MatchInput = {
    buyerReadiness: bi.buyer_readiness_score ?? 0, buyerEngagement: bi.buyer_engagement_score ?? 0, buyerTrust: bi.buyer_trust_score ?? 0,
    buyerFinancing: bi.buyer_financing_score ?? 0, buyerConversion: bi.buyer_conversion_probability ?? 0, buyerDaysSinceActivity: bi.days_since_activity,
    sellerTrust: si?.seller_trust_score ?? null, sellerChurn: si?.seller_churn_risk_score ?? null, sellerConfidence: si?.seller_confidence_score ?? null,
    propertySuccess: pi?.success_score ?? 40, propertyMarketPosition: pi?.market_position_score ?? 40, propertyMomentum: pi?.momentum_score ?? 40,
    visits: visited.has(`${bi.buyer_id}|${p.id}`) ? 1 : 0, feedbackPositive: false, openObjections: 0, matchStageIndex: matchStageIndex(stage),
  };
  const scores = computeMatchScores(input, compat.score);
  return { buyerId: bi.buyer_id, propertyId: p.id, sellerId: p.seller_id, compat, input, scores, price: p.price, stage };
}

function profileRow(orgId: string, c: ScopedCandidate) {
  const revenue = revenueScoreOf(c.price);
  const opportunity = clamp(c.scores.closing * 0.6 + revenue * 0.4);
  const urgency = clamp(c.scores.timing * 0.5 + c.scores.closing * 0.3 + (100 - c.scores.risk) * 0.2);
  return {
    org_id: orgId, buyer_id: c.buyerId, property_id: c.propertyId, seller_id: c.sellerId,
    compatibility_score: c.scores.compatibility, readiness_score: c.scores.readiness, engagement_score: c.scores.engagement,
    trust_score: c.scores.trust, timing_score: c.scores.timing, momentum_score: c.scores.momentum, risk_score: c.scores.risk,
    closing_probability: c.scores.closing, opportunity_score: opportunity, revenue_score: revenue, urgency_score: urgency,
    match_status: "active", match_stage: c.stage,
    next_best_action: nextBestMatchActions(c.input, c.stage)[0]?.title ?? null,
    primary_blocker: c.compat.blocker, strongest_advantage: c.compat.advantage,
    estimated_deal_value: dealValue(c.price), estimated_commission: estimatedCommission(c.price),
    intelligence_summary: `הסתברות סגירה ${c.scores.closing}% · התאמה ${c.scores.compatibility} · סיכון ${c.scores.risk}`,
    ai_summary: `הסתברות סגירה ${c.scores.closing}%. התאמה ${c.scores.compatibility}/100, מוכנות ${c.scores.readiness}, תזמון ${c.scores.timing}.`,
    ai_risk_summary: c.compat.blocker ? `חסם עיקרי: ${c.compat.blocker}.` : "אין חסם משמעותי.",
    ai_recommendation_summary: `פעולה מומלצת: ${nextBestMatchActions(c.input, c.stage)[0]?.title ?? "—"}.`,
    last_calculated_at: new Date().toISOString(),
  };
}

/**
 * Persist a scoped recompute: upsert kept rows, regenerate child rows for the
 * AFFECTED match_ids only, and deactivate in-scope matches that fell out of `kept`.
 * `scopeColumn`/`scopeId` bound every write to this one buyer or property.
 */
async function persistScoped(
  supabase: SupabaseLike, orgId: string,
  kept: ScopedCandidate[], scopeColumn: "buyer_id" | "property_id", scopeId: string,
): Promise<number> {
  if (kept.length) {
    const rows = kept.map((c) => profileRow(orgId, c));
    const { error } = await supabase.from("match_intelligence_profiles").upsert(rows as never, { onConflict: "org_id,buyer_id,property_id" });
    if (error) throw new Error(error.message);
  }

  // Re-read EVERY match row in this scope (kept + previously-existing) → id map.
  const { data: scopedRows } = await supabase
    .from("match_intelligence_profiles").select("id,buyer_id,property_id")
    .eq("org_id", orgId).eq(scopeColumn, scopeId);
  const scoped = (scopedRows ?? []) as Array<{ id: string; buyer_id: string; property_id: string }>;
  const idByPair = new Map(scoped.map((m) => [`${m.buyer_id}|${m.property_id}`, m.id]));
  const scopedMatchIds = scoped.map((m) => m.id);
  const keptPairs = new Set(kept.map((c) => `${c.buyerId}|${c.propertyId}`));

  // Child regen scoped by match_id — NEVER by org (would wipe siblings).
  if (scopedMatchIds.length) {
    await Promise.all([
      supabase.from("match_risks").delete().in("match_id", scopedMatchIds as never),
      supabase.from("match_opportunities").delete().in("match_id", scopedMatchIds as never),
      supabase.from("revenue_signals").delete().in("match_id", scopedMatchIds as never),
    ]);
  }
  const riskRows: Database["public"]["Tables"]["match_risks"]["Insert"][] = [];
  const oppRows: Database["public"]["Tables"]["match_opportunities"]["Insert"][] = [];
  const revRows: Database["public"]["Tables"]["revenue_signals"]["Insert"][] = [];
  for (const c of kept) {
    const matchId = idByPair.get(`${c.buyerId}|${c.propertyId}`);
    if (!matchId) continue;
    for (const r of detectMatchRisks(c.input)) riskRows.push({ org_id: orgId, match_id: matchId, risk_type: r.riskType, severity: r.severity, title: r.title, description: r.description, recommended_action: r.recommendedAction, status: "open" });
    const revenue = revenueScoreOf(c.price);
    const commission = estimatedCommission(c.price);
    oppRows.push({ org_id: orgId, match_id: matchId, opportunity_score: clamp(c.scores.closing * 0.6 + revenue * 0.4), revenue_score: revenue, urgency_score: clamp(c.scores.timing * 0.5 + c.scores.closing * 0.5), estimated_deal_value: dealValue(c.price), estimated_commission: commission, recommended_action: nextBestMatchActions(c.input, c.stage)[0]?.title ?? null, status: "open" });
    revRows.push({ org_id: orgId, match_id: matchId, estimated_commission: commission, expected_revenue: commission, confidence: c.scores.closing, probability_weighted_revenue: Math.round((commission * c.scores.closing) / 100) });
  }
  if (riskRows.length) await supabase.from("match_risks").insert(riskRows as never);
  if (oppRows.length) await supabase.from("match_opportunities").insert(oppRows as never);
  if (revRows.length) await supabase.from("revenue_signals").insert(revRows as never);

  // Deactivate in-scope matches that are no longer kept (fell below threshold, or
  // the property went unavailable). Soft — preserves history, drops from ACTIVE.
  const staleIds = scoped.filter((m) => !keptPairs.has(`${m.buyer_id}|${m.property_id}`)).map((m) => m.id);
  if (staleIds.length) {
    await supabase.from("match_intelligence_profiles")
      .update({ match_status: "inactive", last_calculated_at: new Date().toISOString() } as never)
      .in("id", staleIds as never);
  }
  return kept.length;
}

/** Recompute matches for ONE buyer (criteria change / new buyer). Bounded: 1×P. */
export async function generateMatchesForBuyerId(orgId: string, buyerId: string, opts?: { db?: SupabaseLike }): Promise<number> {
  const supabase: SupabaseLike = opts?.db ?? createServiceRoleClient();
  const [biRes, prefsRes, propsRes, ppRes, spRes, existingRes, visitsRes] = await Promise.all([
    supabase.from("buyer_intelligence_profiles").select("buyer_id,buyer_readiness_score,buyer_engagement_score,buyer_trust_score,buyer_financing_score,buyer_conversion_probability,days_since_activity").eq("org_id", orgId).eq("buyer_id", buyerId).maybeSingle(),
    supabase.from("buyers").select("id,budget_min,budget_max,rooms_min,rooms_max,preferred_areas,preferred_types,must_have_parking,must_have_elevator,must_have_safe_room").eq("org_id", orgId).eq("id", buyerId).maybeSingle(),
    supabase.from("properties").select("id,price,rooms,city,neighborhood,type,has_parking,has_elevator,has_safe_room,seller_id,status").eq("org_id", orgId).in("status", [...ACTIVE_PROPERTY_STATUSES]).limit(400),
    supabase.from("property_intelligence_profiles").select("property_id,success_score,market_position_score,momentum_score").eq("org_id", orgId),
    supabase.from("seller_intelligence_profiles").select("seller_id,seller_trust_score,seller_churn_risk_score,seller_confidence_score").eq("org_id", orgId),
    supabase.from("match_intelligence_profiles").select("buyer_id,property_id,match_stage").eq("org_id", orgId).eq("buyer_id", buyerId),
    supabase.from("entity_relationships").select("source_entity_id,target_entity_id").eq("org_id", orgId).eq("relationship_type", "buyer_visited_property").eq("status", "active").eq("source_entity_id", buyerId),
  ]);
  const bi = biRes.data as BuyerIntelRow | null;
  const prefs = prefsRes.data as BuyerPrefRow | null;
  // No intelligence profile or no prefs → nothing to score. Deactivate any leftovers.
  if (!bi || !prefs) { await persistScoped(supabase, orgId, [], "buyer_id", buyerId); return 0; }
  const propIntel = new Map((ppRes.data ?? []).map((p) => [p.property_id, p]));
  const sellerIntel = new Map((spRes.data ?? []).map((s) => [s.seller_id, s]));
  const existing = new Map(((existingRes.data ?? []) as Array<{ buyer_id: string; property_id: string; match_stage: string }>).map((m) => [`${m.buyer_id}|${m.property_id}`, m.match_stage]));
  const visited = new Set(((visitsRes.data ?? []) as Array<{ source_entity_id: string; target_entity_id: string }>).map((r) => `${r.source_entity_id}|${r.target_entity_id}`));

  const candidates: ScopedCandidate[] = [];
  for (const p of (propsRes.data ?? []) as PropRow[]) {
    const c = scoreCandidate(prefs, bi, p, propIntel, sellerIntel, visited, existing);
    if (c) candidates.push(c);
  }
  candidates.sort((a, b) => b.scores.closing - a.scores.closing);
  return persistScoped(supabase, orgId, candidates.slice(0, BUYER_KEEP), "buyer_id", buyerId);
}

/** Recompute matches for ONE property (created / price / status / core attrs). Bounded: 1×B. */
export async function generateMatchesForPropertyId(orgId: string, propertyId: string, opts?: { db?: SupabaseLike }): Promise<number> {
  const supabase: SupabaseLike = opts?.db ?? createServiceRoleClient();
  const { data: prop } = await supabase.from("properties").select("id,price,rooms,city,neighborhood,type,has_parking,has_elevator,has_safe_room,seller_id,status").eq("org_id", orgId).eq("id", propertyId).maybeSingle();
  // Unavailable / missing property → remove it from ACTIVE recommendations (soft).
  if (!prop || !ACTIVE_PROPERTY_STATUSES.includes((prop.status ?? "") as (typeof ACTIVE_PROPERTY_STATUSES)[number])) {
    await persistScoped(supabase, orgId, [], "property_id", propertyId);
    return 0;
  }
  const p = prop as PropRow;
  const [biRes, buyersRes, ppRes, spRes, existingRes, visitsRes] = await Promise.all([
    supabase.from("buyer_intelligence_profiles").select("buyer_id,buyer_readiness_score,buyer_engagement_score,buyer_trust_score,buyer_financing_score,buyer_conversion_probability,days_since_activity").eq("org_id", orgId).limit(500),
    supabase.from("buyers").select("id,budget_min,budget_max,rooms_min,rooms_max,preferred_areas,preferred_types,must_have_parking,must_have_elevator,must_have_safe_room").eq("org_id", orgId).limit(500),
    supabase.from("property_intelligence_profiles").select("property_id,success_score,market_position_score,momentum_score").eq("org_id", orgId).eq("property_id", propertyId),
    supabase.from("seller_intelligence_profiles").select("seller_id,seller_trust_score,seller_churn_risk_score,seller_confidence_score").eq("org_id", orgId),
    supabase.from("match_intelligence_profiles").select("buyer_id,property_id,match_stage").eq("org_id", orgId).eq("property_id", propertyId),
    supabase.from("entity_relationships").select("source_entity_id,target_entity_id").eq("org_id", orgId).eq("relationship_type", "buyer_visited_property").eq("status", "active").eq("target_entity_id", propertyId),
  ]);
  const buyerPrefs = new Map(((buyersRes.data ?? []) as BuyerPrefRow[]).map((b) => [b.id, b]));
  const propIntel = new Map((ppRes.data ?? []).map((pp) => [pp.property_id, pp]));
  const sellerIntel = new Map((spRes.data ?? []).map((s) => [s.seller_id, s]));
  const existing = new Map(((existingRes.data ?? []) as Array<{ buyer_id: string; property_id: string; match_stage: string }>).map((m) => [`${m.buyer_id}|${m.property_id}`, m.match_stage]));
  const visited = new Set(((visitsRes.data ?? []) as Array<{ source_entity_id: string; target_entity_id: string }>).map((r) => `${r.source_entity_id}|${r.target_entity_id}`));

  const candidates: ScopedCandidate[] = [];
  for (const bi of (biRes.data ?? []) as BuyerIntelRow[]) {
    const prefs = buyerPrefs.get(bi.buyer_id);
    if (!prefs) continue;
    const c = scoreCandidate(prefs, bi, p, propIntel, sellerIntel, visited, existing);
    if (c) candidates.push(c);
  }
  candidates.sort((a, b) => b.scores.closing - a.scores.closing);
  return persistScoped(supabase, orgId, candidates.slice(0, PROPERTY_KEEP), "property_id", propertyId);
}
